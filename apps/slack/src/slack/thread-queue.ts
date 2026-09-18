import { getRedisCache } from "@databuddy/redis";
import type { SlackAgentRun, SlackFollowUpMessage } from "@/agent/agent-client";

const THREAD_LOCK_TTL_SECONDS = 5 * 60;
const MAX_FOLLOW_UP_ITEMS = 10;
// Retain pending messages and deletion references while every queued author runs.
const FOLLOW_UP_QUEUE_TTL_SECONDS =
	MAX_FOLLOW_UP_ITEMS * THREAD_LOCK_TTL_SECONDS;
const ENGAGED_THREAD_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_FOLLOW_UP_TEXT_CHARS = 4000;

interface RedisLike {
	del(...keys: string[]): Promise<number>;
	eval(
		script: string,
		keyCount: number,
		...args: string[]
	): Promise<number | [number, number] | string[]>;
	get(key: string): Promise<string | null>;
	lrange(key: string, start: number, stop: number): Promise<string[]>;
	lrem(key: string, count: number, value: string): Promise<number>;
	set(
		key: string,
		value: string,
		exMode?: "EX",
		seconds?: number,
		nxMode?: "NX"
	): Promise<"OK" | null>;
}

type SlackFollowUpQueueReason =
	| "empty"
	| "stopped"
	| "queue_full"
	| "redis_error"
	| "redis_unavailable";

export interface SlackFollowUpQueueResult {
	ok: boolean;
	queuedCount?: number;
	reason?: SlackFollowUpQueueReason;
	truncated?: boolean;
}

export interface SlackDeletedFollowUpRef {
	channelId: string;
	messageTs: string;
	teamId?: string;
}

export interface SlackThreadQueueStore {
	drain(run: SlackAgentRun): Promise<SlackFollowUpMessage[]>;
	enqueue(run: SlackAgentRun): Promise<SlackFollowUpQueueResult>;
	isEngaged(
		run: Pick<SlackAgentRun, "channelId" | "messageTs" | "teamId" | "threadTs">
	): Promise<boolean>;
	isStopped(run: SlackAgentRun): Promise<boolean>;
	markEngaged(run: SlackAgentRun): Promise<void>;
	release(run: SlackAgentRun, whenEmpty?: boolean): Promise<boolean>;
	removeDeletedFollowUp(ref: SlackDeletedFollowUpRef): Promise<boolean>;
	renew(run: SlackAgentRun): Promise<boolean>;
	stop(run: SlackAgentRun): Promise<void>;
	tryAcquire(run: SlackAgentRun): Promise<boolean>;
}

function defaultRedis(): RedisLike | null {
	try {
		// ioredis overloads are wider than the subset this queue needs.
		return getRedisCache() as RedisLike;
	} catch {
		return null;
	}
}

function threadIdentity(
	run: Pick<SlackAgentRun, "channelId" | "messageTs" | "teamId" | "threadTs">
): string {
	return [
		run.teamId ?? "team",
		run.channelId,
		run.threadTs ?? run.messageTs ?? "thread",
	].join(":");
}

const lockKey = (run: SlackAgentRun): string =>
	`slack:agent:thread-lock:${threadIdentity(run)}`;

const queueKey = (run: SlackAgentRun): string =>
	`slack:agent:followups:${threadIdentity(run)}`;

const stopKey = (run: SlackAgentRun): string =>
	`slack:agent:stopped:${threadIdentity(run)}`;

const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 1 end
if ARGV[2] == 'true' and redis.call('LLEN', KEYS[2]) > 0 then return 0 end
redis.call('DEL', KEYS[1])
return 1`;

const RENEW_LOCK = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('EXPIRE', KEYS[1], ARGV[2])`;

const ENQUEUE_FOLLOW_UP = `
local stoppedAt = redis.call('GET', KEYS[2])
if stoppedAt and tonumber(ARGV[4]) <= tonumber(stoppedAt) then return {-1, 0} end
local count = redis.call('LLEN', KEYS[1])
if count >= tonumber(ARGV[2]) then return {0, count} end
count = redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return {1, count}`;

const STOP_THREAD = `
local previous = redis.call('GET', KEYS[2])
local stamp = previous and tonumber(previous) > tonumber(ARGV[1]) and previous or ARGV[1]
local cutoff = tonumber(stamp)
redis.call('SET', KEYS[2], stamp, 'EX', ARGV[2])
local items = redis.call('LRANGE', KEYS[1], 0, -1)
redis.call('DEL', KEYS[1])
for _, raw in ipairs(items) do
  local ok, item = pcall(cjson.decode, raw)
  if ok and type(item) == 'table' and (tonumber(item.requestTs or item.messageTs) or 0) > cutoff then
    redis.call('RPUSH', KEYS[1], raw)
  end
end
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 1`;

const DRAIN_FOLLOW_UPS = `
if redis.call('GET', KEYS[3]) ~= ARGV[1] then return redis.error_reply('Slack thread lock expired') end
redis.call('EXPIRE', KEYS[3], ARGV[2])
local result = {}
local author = nil
local cutoff = tonumber(redis.call('GET', KEYS[2]) or '0')
while redis.call('LLEN', KEYS[1]) > 0 do
  local raw = redis.call('LINDEX', KEYS[1], 0)
  local ok, item = pcall(cjson.decode, raw)
  if ok and type(item) == 'table' and (tonumber(item.requestTs or item.messageTs) or 0) > cutoff then
    if #result > 0 and item.userId ~= author then break end
    author = item.userId
    table.insert(result, raw)
  end
  redis.call('LPOP', KEYS[1])
end
return result`;

const queueKeyFromIdentity = (identity: string): string =>
	`slack:agent:followups:${identity}`;

const engagedKey = (
	run: Pick<SlackAgentRun, "channelId" | "messageTs" | "teamId" | "threadTs">
): string => `slack:agent:engaged-thread:${threadIdentity(run)}`;

const followUpRefKey = ({
	channelId,
	messageTs,
	teamId,
}: SlackDeletedFollowUpRef): string =>
	`slack:agent:followup-ref:${teamId ?? "team"}:${channelId}:${messageTs}`;

function followUpRefKeys(ref: SlackDeletedFollowUpRef): string[] {
	return [
		ref.teamId ? followUpRefKey(ref) : null,
		followUpRefKey({
			channelId: ref.channelId,
			messageTs: ref.messageTs,
		}),
	].filter((key): key is string => key !== null);
}

function parseQueuedFollowUp(raw: string): SlackFollowUpMessage | null {
	try {
		const parsed = JSON.parse(raw) as Partial<SlackFollowUpMessage>;
		if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
			return null;
		}
		return {
			...(typeof parsed.messageTs === "string"
				? { messageTs: parsed.messageTs }
				: {}),
			text: parsed.text,
			...(typeof parsed.requestTs === "string"
				? { requestTs: parsed.requestTs }
				: {}),
			...(typeof parsed.userId === "string" ? { userId: parsed.userId } : {}),
		};
	} catch {
		return null;
	}
}

export class SlackThreadQueue implements SlackThreadQueueStore {
	#redis: RedisLike | null | undefined;
	readonly #locks = new WeakMap<SlackAgentRun, string>();

	constructor(redis?: RedisLike | null) {
		this.#redis = redis;
	}

	#getRedis(): RedisLike | null {
		if (this.#redis !== undefined) {
			return this.#redis;
		}
		this.#redis = defaultRedis();
		return this.#redis;
	}

	async tryAcquire(run: SlackAgentRun): Promise<boolean> {
		const redis = this.#getRedis();
		if (!redis) {
			throw new Error("Slack thread coordination is unavailable");
		}

		const token = crypto.randomUUID();
		const result = await redis.set(
			lockKey(run),
			token,
			"EX",
			THREAD_LOCK_TTL_SECONDS,
			"NX"
		);
		if (result === "OK") {
			this.#locks.set(run, token);
		}
		return result === "OK";
	}

	async release(run: SlackAgentRun, whenEmpty = false): Promise<boolean> {
		const token = this.#locks.get(run);
		if (!token) {
			return true;
		}
		const released = await this.#getRedis()?.eval(
			RELEASE_LOCK,
			2,
			lockKey(run),
			queueKey(run),
			token,
			String(whenEmpty)
		);
		if (released === 1) {
			this.#locks.delete(run);
		}
		return released === 1;
	}

	async stop(run: SlackAgentRun): Promise<void> {
		const redis = this.#getRedis();
		if (!redis) {
			throw new Error("Slack thread coordination is unavailable");
		}
		await redis.eval(
			STOP_THREAD,
			2,
			queueKey(run),
			stopKey(run),
			run.requestTs ?? run.messageTs ?? String(Date.now() / 1000),
			String(FOLLOW_UP_QUEUE_TTL_SECONDS)
		);
	}

	async renew(run: SlackAgentRun): Promise<boolean> {
		const token = this.#locks.get(run);
		return Boolean(
			token &&
				(await this.#getRedis()?.eval(
					RENEW_LOCK,
					1,
					lockKey(run),
					token,
					String(THREAD_LOCK_TTL_SECONDS)
				))
		);
	}

	async isStopped(run: SlackAgentRun): Promise<boolean> {
		const stoppedAt = await this.#getRedis()?.get(stopKey(run));
		return Boolean(
			stoppedAt &&
				Number(stoppedAt) >= Number(run.requestTs ?? run.messageTs ?? 0)
		);
	}

	async enqueue(run: SlackAgentRun): Promise<SlackFollowUpQueueResult> {
		const redis = this.#getRedis();
		if (!redis) {
			return { ok: false, reason: "redis_unavailable" };
		}

		let text = run.text.trim();
		if (!text) {
			return { ok: false, reason: "empty" };
		}

		const truncated = text.length > MAX_FOLLOW_UP_TEXT_CHARS;
		if (truncated) {
			text = text.slice(0, MAX_FOLLOW_UP_TEXT_CHARS);
		}

		const item: SlackFollowUpMessage = {
			...(run.messageTs ? { messageTs: run.messageTs } : {}),
			text,
			...(run.requestTs ? { requestTs: run.requestTs } : {}),
			userId: run.userId,
		};
		try {
			const key = queueKey(run);
			const result = await redis.eval(
				ENQUEUE_FOLLOW_UP,
				2,
				key,
				stopKey(run),
				JSON.stringify(item),
				String(MAX_FOLLOW_UP_ITEMS),
				String(FOLLOW_UP_QUEUE_TTL_SECONDS),
				run.requestTs ?? run.messageTs ?? "0"
			);
			const status = Array.isArray(result) ? result[0] : undefined;
			const queuedCount = Array.isArray(result) ? result[1] : undefined;
			if (typeof status !== "number" || typeof queuedCount !== "number") {
				throw new Error("Invalid Slack enqueue response");
			}
			if (status === -1) {
				return { ok: false, reason: "stopped" };
			}
			if (status === 0) {
				return {
					ok: false,
					queuedCount,
					reason: "queue_full",
					truncated,
				};
			}

			if (run.messageTs) {
				const identity = threadIdentity(run);
				await Promise.all(
					followUpRefKeys({
						channelId: run.channelId,
						messageTs: run.messageTs,
						teamId: run.teamId,
					}).map((refKey) =>
						redis.set(refKey, identity, "EX", FOLLOW_UP_QUEUE_TTL_SECONDS)
					)
				);
			}
			return { ok: true, queuedCount, truncated };
		} catch {
			return { ok: false, reason: "redis_error", truncated };
		}
	}

	async drain(run: SlackAgentRun): Promise<SlackFollowUpMessage[]> {
		const redis = this.#getRedis();
		if (!redis) {
			throw new Error("Slack thread coordination is unavailable");
		}
		const token = this.#locks.get(run);
		if (!token) {
			throw new Error("Slack thread lock is not held");
		}
		// Atomically discard cancelled messages and consume one contiguous author group.
		const items = await redis.eval(
			DRAIN_FOLLOW_UPS,
			3,
			queueKey(run),
			stopKey(run),
			lockKey(run),
			token,
			String(THREAD_LOCK_TTL_SECONDS)
		);
		if (!Array.isArray(items)) {
			throw new Error("Invalid Slack queue response");
		}
		return items
			.filter((item): item is string => typeof item === "string")
			.map(parseQueuedFollowUp)
			.filter((item): item is SlackFollowUpMessage => item !== null);
	}

	async markEngaged(run: SlackAgentRun): Promise<void> {
		await this.#getRedis()
			?.set(engagedKey(run), "1", "EX", ENGAGED_THREAD_TTL_SECONDS)
			.catch(() => undefined);
	}

	async isEngaged(
		run: Pick<SlackAgentRun, "channelId" | "messageTs" | "teamId" | "threadTs">
	): Promise<boolean> {
		const redis = this.#getRedis();
		if (!redis) {
			return false;
		}
		try {
			return (await redis.get(engagedKey(run))) === "1";
		} catch {
			return false;
		}
	}

	async removeDeletedFollowUp(ref: SlackDeletedFollowUpRef): Promise<boolean> {
		const redis = this.#getRedis();
		if (!redis) {
			return false;
		}

		try {
			for (const refKey of followUpRefKeys(ref)) {
				const identity = await redis.get(refKey);
				if (!identity) {
					continue;
				}

				const key = queueKeyFromIdentity(identity);
				const items = await redis.lrange(key, 0, -1);
				for (const rawItem of items) {
					const parsed = parseQueuedFollowUp(rawItem);
					if (parsed?.messageTs !== ref.messageTs) {
						continue;
					}

					await redis.lrem(key, 1, rawItem);
					await redis.del(refKey);
					return true;
				}
				await redis.del(refKey);
			}
			return false;
		} catch {
			return false;
		}
	}
}

export const slackThreadQueue = new SlackThreadQueue();
