import { cacheable } from "@databuddy/redis";
import { getTrustedClientIp } from "@databuddy/shared/utils/trusted-client-ip";
import type { City } from "@maxmind/geoip2-node";
import {
	AddressNotFoundError,
	BadMethodCallError,
	Reader,
} from "@maxmind/geoip2-node";
import { log } from "evlog";
import { LRUCache } from "lru-cache";
import { isIP } from "node:net";
import { captureError, record, setAttributes } from "../lib/logging";

interface GeoIPReader extends Reader {
	city(ip: string): City;
}

interface GeoResult {
	city: string | null;
	country: string | null;
	region: string | null;
}

const DEFAULT_GEOIP_DB_URL = "https://cdn.databuddy.cc/mmdb/GeoLite2-City.mmdb";
const GEOIP_DB_URL = process.env.GEOIP_DB_URL || DEFAULT_GEOIP_DB_URL;
const GEOIP_FETCH_TIMEOUT_MS = 5000;
const EMPTY_GEO: GeoResult = { country: null, region: null, city: null };

let reader: GeoIPReader | null = null;
let loadPromise: Promise<void> | null = null;

const geoMemCache = new LRUCache<string, GeoResult>({
	max: 2000,
	ttl: 60_000,
});

function loadDatabase(): Promise<void> {
	if (reader) {
		return Promise.resolve();
	}
	if (loadPromise) {
		return loadPromise;
	}

	loadPromise = (async () => {
		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			GEOIP_FETCH_TIMEOUT_MS
		);
		try {
			const response = await fetch(GEOIP_DB_URL, {
				signal: controller.signal,
			});
			if (!response.ok) {
				throw new Error(`GeoIP fetch failed: ${response.status}`);
			}

			const buffer = Buffer.from(await response.arrayBuffer());
			setAttributes({ geo_db_size_bytes: buffer.length });

			if (buffer.length < 1_000_000) {
				throw new Error(`GeoIP database too small: ${buffer.length} bytes`);
			}

			reader = Reader.openBuffer(buffer) as GeoIPReader;
			setAttributes({ geo_db_loaded: true });
		} catch (err) {
			captureError(err, { operation: "geo_load_database" });
			reader = null;
		} finally {
			clearTimeout(timeout);
			loadPromise = null;
		}
	})();

	return loadPromise;
}

function isValidIp(ip: string): boolean {
	return isIP(ip) !== 0;
}

const IGNORED_IPS = new Set(["127.0.0.1", "::1", "unknown"]);

async function lookupGeo(ip: string): Promise<GeoResult> {
	if (!(reader || loadPromise)) {
		await loadDatabase();
	}
	if (!reader) {
		return EMPTY_GEO;
	}

	try {
		const r = reader.city(ip);
		return {
			country: r.country?.names?.en || null,
			region: r.subdivisions?.[0]?.names?.en || null,
			city: r.city?.names?.en || null,
		};
	} catch (err) {
		if (
			err instanceof AddressNotFoundError ||
			err instanceof BadMethodCallError
		) {
			return EMPTY_GEO;
		}
		log.error({
			links: "geoip_lookup",
			error_message: err instanceof Error ? err.message : String(err),
		});
		return EMPTY_GEO;
	}
}

const cachedGeoLookup = cacheable(lookupGeo, {
	expireInSec: 86_400 * 7,
	prefix: "geoip",
	staleWhileRevalidate: true,
	staleTime: 86_400,
});

function getCloudflareGeo(request?: Request): GeoResult | null {
	const cf = request?.headers.get("cf-ipcountry");
	if (cf && cf.length === 2 && cf !== "XX") {
		return { country: cf, region: null, city: null };
	}
	return null;
}

export function preloadGeoDatabase(): void {
	loadDatabase().catch((err) =>
		captureError(err, { operation: "geo_preload_database" })
	);
}

export async function getGeo(
	ip: string,
	request?: Request
): Promise<GeoResult> {
	if (!ip || IGNORED_IPS.has(ip) || !isValidIp(ip)) {
		return getCloudflareGeo(request) ?? EMPTY_GEO;
	}

	const memHit = geoMemCache.get(ip);
	if (memHit) {
		return memHit;
	}

	if (!reader) {
		const cfGeo = getCloudflareGeo(request);
		if (cfGeo) {
			geoMemCache.set(ip, cfGeo);
			setAttributes({
				geo_fallback: "cloudflare",
				geo_country: cfGeo.country ?? "",
			});
			preloadGeoDatabase();
			return cfGeo;
		}
	}

	const geo = await record("geo.lookup", () => cachedGeoLookup(ip));

	if (!geo.country) {
		const cfGeo = getCloudflareGeo(request);
		if (cfGeo) {
			geoMemCache.set(ip, cfGeo);
			setAttributes({
				geo_fallback: "cloudflare",
				geo_country: cfGeo.country ?? "",
			});
			return cfGeo;
		}
	}

	if (geo.country) {
		geoMemCache.set(ip, geo);
	}
	return geo;
}

export function extractIp(request: Request): string {
	return getTrustedClientIp(request.headers) ?? "unknown";
}
