import { cacheable } from "@databuddy/redis";
import type { City } from "@maxmind/geoip2-node";
import {
	AddressNotFoundError,
	BadMethodCallError,
	Reader,
} from "@maxmind/geoip2-node";
import { captureError, record, setAttributes } from "../lib/tracing";

interface GeoIPReader extends Reader {
	city(ip: string): City;
}

const CDN_URL = "https://cdn.databuddy.cc/mmdb/GeoLite2-City.mmdb";

let reader: GeoIPReader | null = null;
let isLoading = false;
let loadPromise: Promise<void> | null = null;
let dbBuffer: Buffer | null = null;

function loadDatabaseFromCdn(): Promise<Buffer> {
	return record("links-geo_load_database", async () => {
		const response = await fetch(CDN_URL);
		if (!response.ok) {
			throw new Error(`Failed to fetch GeoIP database: ${response.status}`);
		}

		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		setAttributes({ geo_db_size_bytes: buffer.length });

		if (buffer.length < 1_000_000) {
			throw new Error(`Database file too small: ${buffer.length} bytes`);
		}

		return buffer;
	});
}

function loadDatabase() {
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
			setAttributes({ geo_db_loaded: true });
		} catch (err) {
			captureError(err, { operation: "geo_load_database" });
			reader = null;
			dbBuffer = null;
		} finally {
			isLoading = false;
		}
	})();

	return loadPromise;
}

const ipv4Regex =
	/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

function isValidIp(ip: string): boolean {
	return Boolean(ip && (ipv4Regex.test(ip) || ipv6Regex.test(ip)));
}

const ignore = ["127.0.0.1", "::1", "unknown"];

async function lookupGeoLocation(ip: string): Promise<{
	country: string | null;
	region: string | null;
	city: string | null;
}> {
	if (!(reader || isLoading)) {
		await loadDatabase();
	}

	if (!reader) {
		return { country: null, region: null, city: null };
	}

	try {
		const response = reader.city(ip);
		return {
			country: response.country?.names?.en || null,
			region: response.subdivisions?.[0]?.names?.en || null,
			city: response.city?.names?.en || null,
		};
	} catch (err) {
		if (
			err instanceof AddressNotFoundError ||
			err instanceof BadMethodCallError
		) {
			return { country: null, region: null, city: null };
		}
		console.error("GeoIP lookup error:", err);
		return { country: null, region: null, city: null };
	}
}

const cachedGeoLookup = cacheable(lookupGeoLocation, {
	expireInSec: 86_400 * 7,
	prefix: "geoip",
	staleWhileRevalidate: true,
	staleTime: 86_400,
});

export function getGeo(ip: string) {
	if (!ip || ignore.includes(ip) || !isValidIp(ip)) {
		return Promise.resolve({ country: null, region: null, city: null });
	}

	return cachedGeoLookup(ip);
}

export function extractIp(request: Request): string {
	const cfIp = request.headers.get("cf-connecting-ip");
	if (cfIp) {
		return cfIp.trim();
	}

	const forwardedFor = request.headers.get("x-forwarded-for");
	const firstIp = forwardedFor?.split(",")[0]?.trim();
	if (firstIp) {
		return firstIp;
	}

	const realIp = request.headers.get("x-real-ip");
	if (realIp) {
		return realIp.trim();
	}

	return "unknown";
}
