import { getRedisCache } from "./redis";

const TTL_SECONDS = 3600;

export async function shouldRecordClick(
	linkId: string,
	ipHash: string
): Promise<boolean> {
	const redis = getRedisCache();
	const key = `click:dedup:${linkId}:${ipHash}`;

	try {
		const result = await redis.set(key, "1", "EX", TTL_SECONDS, "NX");
		return result === "OK";
	} catch {
		return true;
	}
}

export async function isClickRecorded(
	linkId: string,
	ipHash: string
): Promise<boolean> {
	const redis = getRedisCache();
	const key = `click:dedup:${linkId}:${ipHash}`;

	try {
		return (await redis.exists(key)) === 1;
	} catch {
		return false;
	}
}
