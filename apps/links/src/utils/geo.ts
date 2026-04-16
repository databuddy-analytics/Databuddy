import { cacheable } from "@databuddy/redis";
import type { City } from "@maxmind/geoip2-node";
import {
	AddressNotFoundError,
	BadMethodCallError,
	Reader,
} from "@maxmind/geoip2-node";
import { log } from "evlog";
import { LRUCache } from "lru-cache";
import { captureError, setAttributes } from "../lib/logging";

interface GeoIPReader extends Reader {
	city(ip: string): City;
}

interface GeoResult {
	city: string | null;
	country: string | null;
	region: string | null;
}

const CDN_URL = "https://cdn.databuddy.cc/mmdb/GeoLite2-City.mmdb";
const EMPTY_GEO: GeoResult = { country: null, region: null, city: null };

let reader: GeoIPReader | null = null;
let loadPromise: Promise<void> | null = null;

const geoMemCache = new LRUCache<string, GeoResult>({
	max: 2000,
	ttl: 60_000,
});

function loadDatabase(): Promise<void> {
	if (reader) {
		return;
	}
	if (loadPromise) {
		return loadPromise;
	}

	loadPromise = (async () => {
		try {
			const response = await fetch(CDN_URL);
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
			loadPromise = null;
		}
	})();

	return loadPromise;
}

const IPV4_RE =
	/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const IPV6_RE =
	/^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;

function isValidIp(ip: string): boolean {
	return Boolean(ip && (IPV4_RE.test(ip) || IPV6_RE.test(ip)));
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

export async function getGeo(
	ip: string,
	request?: Request
): Promise<GeoResult> {
	if (!ip || IGNORED_IPS.has(ip) || !isValidIp(ip)) {
		return EMPTY_GEO;
	}

	const memHit = geoMemCache.get(ip);
	if (memHit) {
		return memHit;
	}

	const geo = await cachedGeoLookup(ip);

	if (!geo.country && request?.headers) {
		const cf = request.headers.get("cf-ipcountry");
		if (cf && cf.length === 2) {
			const result: GeoResult = { country: cf, region: null, city: null };
			geoMemCache.set(ip, result);
			setAttributes({ geo_fallback: "cloudflare", geo_country: cf });
			return result;
		}
	}

	if (geo.country) {
		geoMemCache.set(ip, geo);
	}
	return geo;
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
