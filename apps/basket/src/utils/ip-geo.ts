import { createHash } from "node:crypto";
import { cacheable } from "@databuddy/redis/cacheable";
import { captureError, mergeWideEvent, record } from "@lib/tracing";
import type { City } from "@maxmind/geoip2-node";
import {
	AddressNotFoundError,
	BadMethodCallError,
	Reader,
} from "@maxmind/geoip2-node";
import { createError, EvlogError, log } from "evlog";

if (!process.env.IP_HASH_SALT && process.env.NODE_ENV === "production") {
	throw new Error(
		"IP_HASH_SALT must be set in production. The fallback salt is public in the open-source repo, so leaving it unset lets anyone reverse 'anonymized' IPs via a precomputed table."
	);
}

interface GeoIPReader extends Reader {
	city(ip: string): City;
}

const CDN_URL = "https://cdn.databuddy.cc/mmdb/GeoLite2-City.mmdb";

let reader: GeoIPReader | null = null;
let isLoading = false;
let loadPromise: Promise<void> | null = null;
let loadError: Error | null = null;
let dbBuffer: Buffer | null = null;

function loadDatabaseFromCdn(): Promise<Buffer> {
	return record("loadDatabaseFromCdn", async () => {
		try {
			const response = await fetch(CDN_URL);
			if (!response.ok) {
				throw createError({
					code: "basket.GEOIP_DOWNLOAD_FAILED",
					message: "Failed to load GeoIP database",
					status: 502,
					why: "The GeoIP database CDN returned a non-success response.",
					fix: "Retry later or verify CDN availability.",
					internal: {
						status: response.status,
						statusText: response.statusText,
					},
				});
			}

			const arrayBuffer = await response.arrayBuffer();
			const buf = Buffer.from(arrayBuffer);

			if (buf.length < 1_000_000) {
				throw createError({
					code: "basket.GEOIP_DATABASE_INVALID",
					message: "Failed to load GeoIP database",
					status: 502,
					why: "The downloaded file is below the expected minimum size.",
					fix: "Verify the CDN artifact is the full GeoLite2-City database.",
					internal: { byteLength: buf.length },
				});
			}

			return buf;
		} catch (error) {
			captureError(error, { message: "Failed to load database from CDN" });
			if (error instanceof EvlogError) {
				throw error;
			}
			const cause = error instanceof Error ? error : new Error(String(error));
			throw createError({
				code: "basket.GEOIP_LOAD_FAILED",
				message: "Failed to load GeoIP database from CDN",
				status: 500,
				why: "The GeoIP database could not be downloaded or initialized.",
				fix: "Ensure the CDN is reachable and the database file is valid.",
				cause,
			});
		}
	});
}

function loadDatabase() {
	if (loadError) {
		throw loadError;
	}

	if (isLoading && loadPromise) {
		return loadPromise;
	}

	if (reader) {
		return;
	}

	isLoading = true;
	loadPromise = (async () => {
		try {
			dbBuffer = await loadDatabaseFromCdn();
			reader = Reader.openBuffer(dbBuffer) as GeoIPReader;
		} catch (error) {
			captureError(error, { message: "Failed to load GeoIP database" });
			loadError = error as Error;
			reader = null;
			dbBuffer = null;
		} finally {
			isLoading = false;
		}
	})();

	return loadPromise;
}

const ignore = ["127.0.0.1", "::1"];

const ipv4Regex =
	/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

function isValidIp(ip: string): boolean {
	return Boolean(ip && (ipv4Regex.test(ip) || ipv6Regex.test(ip)));
}

function getCloudflareCountry(headers: Headers): string | undefined {
	const cfCountry = headers.get("cf-ipcountry");
	if (cfCountry && cfCountry.length === 2) {
		return cfCountry;
	}
	return;
}

function lookupGeoLocation(ip: string): Promise<{
	country: string | undefined;
	region: string | undefined;
	city: string | undefined;
}> {
	return record("lookupGeoLocation", async () => {
		if (!(reader || isLoading || loadError)) {
			try {
				await loadDatabase();
			} catch (error) {
				captureError(error, {
					message: "Failed to load database for IP lookup",
				});
				return { country: undefined, region: undefined, city: undefined };
			}
		}

		if (!reader) {
			return { country: undefined, region: undefined, city: undefined };
		}

		try {
			const response = reader.city(ip);
			return {
				country: response.country?.names?.en,
				region: response.subdivisions?.[0]?.names?.en,
				city: response.city?.names?.en,
			};
		} catch (error) {
			if (
				error instanceof AddressNotFoundError ||
				error instanceof BadMethodCallError
			) {
				return { country: undefined, region: undefined, city: undefined };
			}
			captureError(error, { message: "Error looking up IP" });
			return { country: undefined, region: undefined, city: undefined };
		}
	});
}

function coarsenIpForCache(ip: string): string {
	if (ip.includes(":")) {
		const groups = ip.split(":");
		const head = groups.slice(0, 4).join(":");
		return `${head}::`;
	}
	const octets = ip.split(".");
	if (octets.length === 4) {
		return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
	}
	return ip;
}

const getCachedGeoLocation = cacheable(lookupGeoLocation, {
	expireInSec: 86_400 * 7,
	prefix: "geoip_location",
	staleWhileRevalidate: true,
	staleTime: 86_400,
});

function getGeoLocation(ip: string) {
	return getCachedGeoLocation(coarsenIpForCache(ip));
}

export function anonymizeIp(ip: string): string {
	if (!ip) {
		return "";
	}

	const salt = process.env.IP_HASH_SALT || "databuddy-ip-salt";
	const hash = createHash("sha256");
	hash.update(`${ip}${salt}`);
	return hash.digest("hex").slice(0, 12);
}

export function getGeo(ip: string, request?: Request) {
	return record("getGeo", async () => {
		if (!ip || ignore.includes(ip) || !isValidIp(ip)) {
			mergeWideEvent({
				geo: { skipped: true, reason: "invalid_or_local_ip" },
			});
			return {
				anonymizedIP: anonymizeIp(ip),
				country: undefined,
				region: undefined,
				city: undefined,
			};
		}

		const geo = await getGeoLocation(ip);

		if (!geo.country && request?.headers) {
			const cfCountry = getCloudflareCountry(request.headers);
			if (cfCountry) {
				mergeWideEvent({
					geo: {
						source: "cloudflare_header",
						country: cfCountry,
					},
				});
				return {
					anonymizedIP: anonymizeIp(ip),
					country: cfCountry,
					region: undefined,
					city: undefined,
				};
			}
		}

		return {
			anonymizedIP: anonymizeIp(ip),
			country: geo.country,
			region: geo.region,
			city: geo.city,
		};
	});
}

const TRUSTED_IP_HEADER = process.env.TRUSTED_IP_HEADER || "cf-connecting-ip";
const IP_HEADER_VERIFIED =
	process.env.IP_HEADER_VERIFIED?.toLowerCase() === "true";

if (!process.env.IP_HEADER_VERIFIED && process.env.NODE_ENV === "production") {
	log.warn({
		message:
			"IP_HEADER_VERIFIED is not set — client-supplied IP headers are spoofable. Set IP_HEADER_VERIFIED=true only when traffic is forced through a trusted proxy that overwrites this header.",
	});
}

export function extractIpFromRequest(
	request: Request,
	trustedHeader = TRUSTED_IP_HEADER
): string {
	const headerName = trustedHeader.toLowerCase();
	const trusted = request.headers.get(headerName);
	if (trusted) {
		const ip =
			headerName === "x-forwarded-for"
				? trusted.split(",")[0]?.trim()
				: trusted.trim();
		if (ip) {
			return ip;
		}
	}

	return "";
}

export function extractTrustedClientIp(request: Request): string | null {
	if (!IP_HEADER_VERIFIED) {
		return null;
	}
	return extractIpFromRequest(request) || null;
}

export async function getVisitorCountryForAutoMode(
	events: Array<{ anonymizeVisitorIds?: unknown }>,
	request: Request
): Promise<string | undefined> {
	if (!events.some((event) => event.anonymizeVisitorIds === "auto")) {
		return;
	}

	const trustedIp = extractTrustedClientIp(request);
	if (!trustedIp) {
		return;
	}

	return (await getGeo(trustedIp, request)).country;
}

export function closeGeoIPReader(): void {
	if (reader) {
		reader = null;
	}
	if (dbBuffer) {
		dbBuffer = null;
	}
	loadPromise = null;
	loadError = null;
	isLoading = false;
}
