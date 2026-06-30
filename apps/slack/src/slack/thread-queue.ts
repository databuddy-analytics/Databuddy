import { getRedisCache } from "@databuddy/redis";
import type { SlackAgentRun, SlackFollowUpMessage } from "@/agent/agent-client";

const THREAD_LOCK_TTL_SECONDS = 5 * 60;
const FOLLOW_UP_QUEUE_TTL_SECONDS = THREAD_LOCK_TTL_SECONDS;
const ENGAGED_THREAD_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_FOLLOW_UP_ITEMS = 10;
const MAX_FOLLOW_UP_TEXT_CHARS = 4000;

interface RedisLike {
	del(...keys: string[]): Promise<number>;
	expire(key: string, seconds: number): Promise<number>;
	get(key: string): Promise<string | null>;
	llen(key: string): Promise<number>;
	lrange(key: string, start: number, stop: number): Promise<string[]>;
	lrem(key: string, count: number, value: string): Promise<number>;
	ltrim(key: string, start: number, stop: number): Promise<unknown>;
	rpush(key: string, ...values: string[]): Promise<number>;
	set(
		key: string,
		value: string,
		exMode?: "EX",
		seconds?: number,
		nxMode?: "NX"
	): Promise<"OK" | null>;
}

export type SlackFollowUpQueueReason =
	| "empty"
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
	markEngaged(run: SlackAgentRun): Promise<void>;
	release(run: SlackAgentRun): Promise<void>;
	removeDeletedFollowUp(ref: SlackDeletedFollowUpRef): Promise<boolean>;
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
			...(typeof parsed.userId === "string" ? { userId: parsed.userId } : {}),
		};
	} catch {
		return null;
	}
}

export class SlackThreadQueue implements SlackThreadQueueStore {
	#redis: RedisLike | null | undefined;

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
			return true;
		}

		try {
			const result = await redis.set(
				lockKey(run),
				"1",
				"EX",
				THREAD_LOCK_TTL_SECONDS,
				"NX"
			);
			return result === "OK";
		} catch {
			return true;
		}
	}

	async release(run: SlackAgentRun): Promise<void> {
		await this.#getRedis()
			?.del(lockKey(run))
			.catch(() => undefined);
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
			userId: run.userId,
		};
		try {
			const key = queueKey(run);
			const currentLength = await redis.llen(key);
			if (currentLength >= MAX_FOLLOW_UP_ITEMS) {
				return {
					ok: false,
					queuedCount: currentLength,
					reason: "queue_full",
					truncated,
				};
			}

			const queuedCount = await redis.rpush(key, JSON.stringify(item));
			await redis.expire(key, FOLLOW_UP_QUEUE_TTL_SECONDS);
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
			return [];
		}

		try {
			const key = queueKey(run);
			const items = await redis.lrange(key, 0, -1);
			if (items.length > 0) {
				await redis.ltrim(key, items.length, -1);
			}

			return items
				.map(parseQueuedFollowUp)
				.filter((item): item is SlackFollowUpMessage => item !== null);
		} catch {
			return [];
		}
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
