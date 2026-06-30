import { getRedisCache } from "./redis";

const DEFAULT_MAX_LEN = 2000;
const DEFAULT_TTL_SEC = 3600;
const DEFAULT_BLOCK_MS = 15_000;

const STREAM_PREFIX = "agent:stream";
const ACTIVE_STREAM_PREFIX = "agent:active-stream";

export interface StreamBufferOptions {
	maxLen?: number;
	ttlSec?: number;
}

export interface StreamEntry {
	data: Uint8Array;
	done: boolean;
	id: string;
}

export function streamBufferKey(
	websiteId: string,
	chatId: string,
	streamId: string
): string {
	return `${STREAM_PREFIX}:${websiteId}:${chatId}:${streamId}`;
}

export function activeStreamKey(websiteId: string, chatId: string): string {
	return `${ACTIVE_STREAM_PREFIX}:${websiteId}:${chatId}`;
}

export async function appendStreamChunk(
	streamKey: string,
	data: Uint8Array,
	options?: StreamBufferOptions
): Promise<void> {
	const redis = getRedisCache();
	const maxLen = options?.maxLen ?? DEFAULT_MAX_LEN;
	const ttlSec = options?.ttlSec ?? DEFAULT_TTL_SEC;
	const value = Buffer.from(data).toString("base64");
	await redis
		.multi()
		.xadd(streamKey, "MAXLEN", "~", maxLen, "*", "d", value)
		.expire(streamKey, ttlSec)
		.exec();
}

export async function markStreamDone(
	streamKey: string,
	options?: StreamBufferOptions
): Promise<void> {
	const redis = getRedisCache();
	const ttlSec = options?.ttlSec ?? DEFAULT_TTL_SEC;
	await redis
		.multi()
		.xadd(streamKey, "*", "end", "1")
		.expire(streamKey, ttlSec)
		.exec();
}

function parseEntry(entry: [string, string[]]): StreamEntry {
	const [id, fields] = entry;
	const map = new Map<string, string>();
	for (let i = 0; i < fields.length; i += 2) {
		map.set(fields[i] ?? "", fields[i + 1] ?? "");
	}
	if (map.has("end")) {
		return { id, data: new Uint8Array(0), done: true };
	}
	const value = map.get("d") ?? "";
	const buffer = Buffer.from(value, "base64");
	return { id, data: new Uint8Array(buffer), done: false };
}

export async function readStreamHistory(
	streamKey: string,
	sinceId = "0-0",
	count = 2000
): Promise<StreamEntry[]> {
	const redis = getRedisCache();
	const result = (await redis.xrange(
		streamKey,
		sinceId === "0-0" ? "-" : `(${sinceId}`,
		"+",
		"COUNT",
		count
	)) as [string, string[]][];
	return result.map(parseEntry);
}

export async function* tailStream(
	streamKey: string,
	fromId: string,
	options: { blockMs?: number; signal?: AbortSignal } = {}
): AsyncGenerator<StreamEntry> {
	const conn = getRedisCache().duplicate();
	try {
		const blockMs = options.blockMs ?? DEFAULT_BLOCK_MS;
		let lastId = fromId;
		while (!options.signal?.aborted) {
			const result = (await conn.xread(
				"BLOCK",
				blockMs,
				"STREAMS",
				streamKey,
				lastId
			)) as [string, [string, string[]][]][] | null;
			if (!result) {
				continue;
			}
			for (const [, entries] of result) {
				for (const entry of entries) {
					const parsed = parseEntry(entry);
					lastId = parsed.id;
					yield parsed;
					if (parsed.done) {
						return;
					}
				}
			}
		}
	} finally {
		conn.disconnect();
	}
}

export async function setActiveStream(
	websiteId: string,
	chatId: string,
	streamId: string,
	ttlSec = DEFAULT_TTL_SEC
): Promise<void> {
	const redis = getRedisCache();
	await redis.setex(activeStreamKey(websiteId, chatId), ttlSec, streamId);
}

export async function getActiveStream(
	websiteId: string,
	chatId: string
): Promise<string | null> {
	const redis = getRedisCache();
	return (await redis.get(activeStreamKey(websiteId, chatId))) ?? null;
}

export async function clearActiveStream(
	websiteId: string,
	chatId: string,
	streamId: string
): Promise<void> {
	const redis = getRedisCache();
	const key = activeStreamKey(websiteId, chatId);
	await redis.eval(
		`if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0`,
		1,
		key,
		streamId
	);
}
