import { readBooleanEnv } from "@databuddy/env/app";

const useCiUrls = readBooleanEnv("CI");
const defaultDatabaseUrl =
	"postgres://databuddy:databuddy_dev_password@localhost:5432/databuddy_test";
const defaultRedisUrl = "redis://localhost:6379/1";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function localTestUrl(name: string, value: string): string {
	const { hostname } = new URL(value);
	if (!loopbackHosts.has(hostname)) {
		throw new Error(
			`${name} must point at a local test service. Refusing to run tests against ${hostname}.`
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
process.env.BETTER_AUTH_SECRET ??= "test-auth-secret-for-integration";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
process.env.NODE_ENV = "test";
