/** biome-ignore-all lint/performance/noNamespaceImport: "Required" */

import { RedisDrizzleCache } from "@databuddy/cache";
import type { Cache } from "drizzle-orm/cache/core/cache";
import { drizzle } from "drizzle-orm/node-postgres";
import Redis from "ioredis";
import * as relations from "./drizzle/relations";
import * as schema from "./drizzle/schema";

const fullSchema = { ...schema, ...relations };

const databaseUrl = process.env.DATABASE_URL as string;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is not set");
}

const cache = process.env.REDIS_URL
	? new RedisDrizzleCache({
		redis: new Redis(process.env.REDIS_URL ?? ""),
		defaultTtl: 300, // 5 minutes default
		strategy: "all", // Cache all queries by default
		namespace: "drizzle:db",
	})
	: undefined;

// @ts-expect-error - cache is not a Cache instance
export const db = drizzle(databaseUrl, {
	schema: fullSchema,
	cache: cache as Cache,
});
