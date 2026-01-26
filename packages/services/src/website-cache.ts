import { RedisClient } from "bun";
import type { Website } from "./websites";

type WebsiteCacheRecord = Omit<
	Website,
	"createdAt" | "updatedAt" | "deletedAt"
> & {
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
};

function toRecord(website: Website): WebsiteCacheRecord {
	return {
		...website,
		createdAt: website.createdAt.toISOString(),
		updatedAt: website.updatedAt.toISOString(),
		deletedAt: website.deletedAt ? website.deletedAt.toISOString() : null,
	};
}

function fromRecord(record: WebsiteCacheRecord): Website {
	return {
		...record,
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
		deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
	};
}

export class WebsiteCache {
	private readonly namespace = "services:websites";
	private readonly pingIntervalMs = 30_000;

	private redis: RedisClient | null = null;
	private lastPingAtMs = 0;
	private isHealthyCached: boolean | null = null;
	private pingInFlight: Promise<boolean> | null = null;

	private getRedisClient(): RedisClient | null {
		if (this.redis) {
			return this.redis;
		}

		const url = process.env.REDIS_URL;
		if (!url) {
			this.isHealthyCached = false;
			return null;
		}

		try {
			this.redis = new RedisClient(url);
			return this.redis;
		} catch (error) {
			this.isHealthyCached = false;
			console.error("WebsiteCache: failed to create Redis client", {
				error: String(error),
			});
			return null;
		}
	}

	/**
	 * Ping Redis to see if it's healthy. When Redis is unhealthy (or REDIS_URL is missing),
	 * all cache operations should be skipped.
	 */
	pingRedis(force = false): Promise<boolean> {
		const now = Date.now();
		if (
			!force &&
			this.isHealthyCached !== null &&
			now - this.lastPingAtMs < this.pingIntervalMs
		) {
			return Promise.resolve(this.isHealthyCached);
		}

		if (this.pingInFlight) {
			return this.pingInFlight;
		}

		const redis = this.getRedisClient();
		this.lastPingAtMs = now;

		if (!redis) {
			this.isHealthyCached = false;
			return Promise.resolve(false);
		}

		this.pingInFlight = redis
			.ping()
			.then((pong) => {
				this.isHealthyCached = pong === "PONG";
				return this.isHealthyCached;
			})
			.catch((error) => {
				this.isHealthyCached = false;
				console.error("WebsiteCache.pingRedis failed:", {
					error: String(error),
				});
				return false;
			})
			.finally(() => {
				this.pingInFlight = null;
			});

		return this.pingInFlight;
	}

	private shouldUseCache(): Promise<boolean> {
		return this.pingRedis(false);
	}

	private keyWebsiteById(id: string): string {
		return `${this.namespace}:website:${id}`;
	}

	private keyListByOrg(organizationId: string): string {
		return `${this.namespace}:list:org:${organizationId}`;
	}

	private keyByDomain(domain: string, organizationId: string): string {
		return `${this.namespace}:domain:org:${organizationId}:${domain}`;
	}

	async getWebsiteById(id: string): Promise<Website | null> {
		if (!(await this.shouldUseCache())) {
			return null;
		}

		try {
			const redis = this.getRedisClient();
			if (!redis) {
				return null;
			}
			const cached = await redis.get(this.keyWebsiteById(id));
			if (!cached) {
				return null;
			}
			const record = JSON.parse(cached) as WebsiteCacheRecord;
			return fromRecord(record);
		} catch (error) {
			this.isHealthyCached = false;
			console.error("WebsiteCache.getWebsiteById failed:", {
				error: String(error),
			});
			return null;
		}
	}

	async setWebsite(website: Website): Promise<void> {
		if (!(await this.shouldUseCache())) {
			return;
		}

		try {
			const redis = this.getRedisClient();
			if (!redis) {
				return;
			}
			await redis.set(
				this.keyWebsiteById(website.id),
				JSON.stringify(toRecord(website))
			);
		} catch (error) {
			this.isHealthyCached = false;
			console.error("WebsiteCache.setWebsite failed:", {
				error: String(error),
			});
		}
	}

	async deleteWebsiteById(id: string): Promise<void> {
		if (!(await this.shouldUseCache())) {
			return;
		}

		try {
			const redis = this.getRedisClient();
			if (!redis) {
				return;
			}
			await redis.unlink(this.keyWebsiteById(id));
		} catch (error) {
			this.isHealthyCached = false;
			console.error("WebsiteCache.deleteWebsiteById failed:", {
				error: String(error),
			});
		}
	}

	async getWebsiteByDomain(
		domain: string,
		organizationId: string
	): Promise<Website | null> {
		if (!(await this.shouldUseCache())) {
			return null;
		}

		try {
			const redis = this.getRedisClient();
			if (!redis) {
				return null;
			}
			const cached = await redis.get(this.keyByDomain(domain, organizationId));
			if (!cached) {
				return null;
			}
			const record = JSON.parse(cached) as WebsiteCacheRecord;
			return fromRecord(record);
		} catch (error) {
			this.isHealthyCached = false;
			console.error("WebsiteCache.getWebsiteByDomain failed:", {
				error: String(error),
			});
			return null;
		}
	}

	async setWebsiteByDomain(
		domain: string,
		organizationId: string,
		website: Website
	): Promise<void> {
		if (!(await this.shouldUseCache())) {
			return;
		}

		try {
			const redis = this.getRedisClient();
			if (!redis) {
				return;
			}
			await redis.set(
				this.keyByDomain(domain, organizationId),
				JSON.stringify(toRecord(website))
			);
		} catch (error) {
			this.isHealthyCached = false;
			console.error("WebsiteCache.setWebsiteByDomain failed:", {
				error: String(error),
			});
		}
	}

	async deleteWebsiteByDomain(
		domain: string,
		organizationId: string
	): Promise<void> {
		if (!(await this.shouldUseCache())) {
			return;
		}

		try {
			const redis = this.getRedisClient();
			if (!redis) {
				return;
			}
			await redis.unlink(this.keyByDomain(domain, organizationId));
		} catch (error) {
			this.isHealthyCached = false;
			console.error("WebsiteCache.deleteWebsiteByDomain failed:", {
				error: String(error),
			});
		}
	}

	async getList(organizationId: string): Promise<Website[] | null> {
		if (!(await this.shouldUseCache())) {
			return null;
		}

		try {
			const redis = this.getRedisClient();
			if (!redis) {
				return null;
			}
			const cached = await redis.get(this.keyListByOrg(organizationId));
			if (!cached) {
				return null;
			}
			const records = JSON.parse(cached) as WebsiteCacheRecord[];
			return records.map(fromRecord);
		} catch (error) {
			this.isHealthyCached = false;
			console.error("WebsiteCache.getList failed:", { error: String(error) });
			return null;
		}
	}

	async setList(organizationId: string, websites: Website[]): Promise<void> {
		if (!(await this.shouldUseCache())) {
			return;
		}

		try {
			const redis = this.getRedisClient();
			if (!redis) {
				return;
			}
			await redis.set(
				this.keyListByOrg(organizationId),
				JSON.stringify(websites.map(toRecord))
			);
		} catch (error) {
			this.isHealthyCached = false;
			console.error("WebsiteCache.setList failed:", { error: String(error) });
		}
	}

	async invalidateLists(organizationIds: string[]): Promise<void> {
		if (!(await this.shouldUseCache())) {
			return;
		}

		if (organizationIds.length === 0) {
			return;
		}

		const keys = organizationIds.map((id) => this.keyListByOrg(id));

		try {
			const redis = this.getRedisClient();
			if (!redis) {
				return;
			}
			await redis.unlink(...keys);
		} catch (error) {
			this.isHealthyCached = false;
			console.error("WebsiteCache.invalidateLists failed:", {
				error: String(error),
			});
		}
	}
}
