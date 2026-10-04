import { isLocalHost, readBooleanEnv } from "@databuddy/env/app";

const useCiUrls = readBooleanEnv("CI");
const defaultDatabaseUrl =
	"postgres://databuddy:databuddy_dev_password@localhost:5432/databuddy_test";
const defaultRedisUrl = "redis://localhost:6379/1";

function localTestUrl(name: string, value: string): string {
	if (!isLocalHost(value)) {
		throw new Error(
			`${name} must point at a local test service. Refusing to run tests against ${new URL(value).hostname}.`
		);
	}
	return value;
}

process.env.DATABASE_URL =
	useCiUrls && process.env.DATABASE_URL
		? localTestUrl("DATABASE_URL", process.env.DATABASE_URL)
		: defaultDatabaseUrl;
process.env.REDIS_URL =
	useCiUrls && process.env.REDIS_URL
		? localTestUrl("REDIS_URL", process.env.REDIS_URL)
		: defaultRedisUrl;
process.env.BULLMQ_REDIS_URL =
	useCiUrls && process.env.BULLMQ_REDIS_URL
		? localTestUrl("BULLMQ_REDIS_URL", process.env.BULLMQ_REDIS_URL)
		: process.env.REDIS_URL;
process.env.CLICKHOUSE_URL =
	useCiUrls && process.env.CLICKHOUSE_URL
		? localTestUrl("CLICKHOUSE_URL", process.env.CLICKHOUSE_URL)
		: "http://default:@localhost:8123";
process.env.BETTER_AUTH_SECRET ??= "test-auth-secret-for-integration";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
process.env.AUTUMN_SECRET_KEY ||= "test-autumn-secret-key";
process.env.NODE_ENV = "test";
