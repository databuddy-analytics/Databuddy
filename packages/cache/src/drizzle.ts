import { getTableName, is, Table } from "drizzle-orm";
import { Cache, type MutationOption } from "drizzle-orm/cache/core";
import type { CacheConfig } from "drizzle-orm/cache/core/types";

export interface RedisCacheClient {
	del(key: string): Promise<unknown>;
	expire(key: string, seconds: number): Promise<unknown>;
	get(key: string): Promise<string | null>;
	sadd(key: string, member: string): Promise<unknown>;
	set(key: string, value: string, mode?: "KEEPTTL"): Promise<unknown>;
	setex(key: string, seconds: number, value: string): Promise<unknown>;
	smembers(key: string): Promise<string[]>;
	unlink(key: string): Promise<unknown>;
}
function toArray<T>(value: T | T[] | undefined): T[] {
	if (!value) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
}
export interface RedisCacheConfig {
	defaultTtl?: number;
	namespace?: string;
	redis: RedisCacheClient;
	strategy?: "explicit" | "all";
}
export class RedisDrizzleCache extends Cache {
	private readonly redis: RedisCacheClient;
	private readonly defaultTtl: number;
	private readonly namespace: string;
	private readonly _strategy: "explicit" | "all";
	constructor({
		redis,
		defaultTtl = 300,
		strategy = "explicit",
		namespace = "drizzle",
	}: RedisCacheConfig) {
		super();
		this.redis = redis;
		this.defaultTtl = defaultTtl;
		this.namespace = namespace;
		this._strategy = strategy;
	}
	override strategy(): "explicit" | "all" {
		return this._strategy;
	}
	override async get(key: string): Promise<unknown[] | undefined> {
		const cacheKey = this.formatKey(key);
		try {
			const cached = await this.redis.get(cacheKey);
			if (!cached) {
				return;
			}
			const parsed: unknown = JSON.parse(cached);
			return Array.isArray(parsed) ? parsed : undefined;
		} catch (error) {
			console.error(
				`[RedisDrizzleCache] GET failed for key ${cacheKey}:`,
				error
			);
			return;
		}
	}
	override async put(
		key: string,
		response: unknown,
		tables: string[],
		_isTag: boolean,
		config?: CacheConfig
	): Promise<void> {
		const cacheKey = this.formatKey(key);
		const ttl = this.calculateTtl(config);

		try {
			if (config?.keepTtl) {
				await this.redis.set(cacheKey, JSON.stringify(response), "KEEPTTL");
			} else {
				await this.redis.setex(cacheKey, ttl, JSON.stringify(response));
			}

			if (tables.length === 0) {
				return;
			}

			const depTtl = Math.max(ttl, this.defaultTtl) * 2;
			await Promise.all(
				tables.map(async (table) => {
					const depKey = this.formatDepKey(table);
					await this.redis.sadd(depKey, key);
					await this.redis.expire(depKey, depTtl);
				})
			);
		} catch (error) {
			console.error(
				`[RedisDrizzleCache] PUT failed for key ${cacheKey}:`,
				error
			);
		}
	}
	override async onMutate(params: MutationOption): Promise<void> {
		const tagsArray = toArray(params.tags);
		const tablesArray = toArray(params.tables);

		const depKeys = tablesArray.map((table) =>
			this.formatDepKey(
				is(table, Table) ? getTableName(table) : (table as string)
			)
		);

		const keysFromDeps = await Promise.all(
			depKeys.map((depKey) =>
				this.redis.smembers(depKey).catch(() => [] as string[])
			)
		);
		const keysToDelete = new Set<string>(keysFromDeps.flat());

		if (keysToDelete.size === 0 && tagsArray.length === 0) {
			return;
		}

		const deletePromises: Promise<unknown>[] = [];

		for (const tag of tagsArray) {
			const tagKey = this.formatKey(`tag:${tag}`);
			deletePromises.push(
				this.redis.unlink(tagKey).catch(() => this.redis.del(tagKey))
			);
		}

		for (const key of keysToDelete) {
			const cacheKey = this.formatKey(key);
			deletePromises.push(
				this.redis.unlink(cacheKey).catch(() => this.redis.del(cacheKey))
			);
		}

		for (const depKey of depKeys) {
			deletePromises.push(
				this.redis.unlink(depKey).catch(() => this.redis.del(depKey))
			);
		}

		await Promise.all(deletePromises);
	}
	private formatKey(key: string): string {
		return `${this.namespace}:${key}`;
	}

	private formatDepKey(table: string): string {
		return `${this.namespace}:dep:${table}`;
	}
	private calculateTtl(config?: CacheConfig): number {
		if (config?.ex !== undefined) {
			return config.ex;
		}
		if (config?.px !== undefined) {
			return Math.floor(config.px / 1000);
		}
		if (config?.exat !== undefined) {
			const now = Math.floor(Date.now() / 1000);
			return Math.max(0, config.exat - now);
		}
		if (config?.pxat !== undefined) {
			const now = Math.floor(Date.now() / 1000);
			return Math.max(0, Math.floor(config.pxat / 1000) - now);
		}
		return this.defaultTtl;
	}
}
