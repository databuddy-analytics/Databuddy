type Env = Record<string, string | undefined>;

export const LOOPBACK_HOSTS = new Set([
	"0.0.0.0",
	"127.0.0.1",
	"[::1]",
	"localhost",
]);

const LOCAL_DATA_URLS = {
	BULLMQ_REDIS_URL: "redis://localhost:6379",
	CLICKHOUSE_URL: "http://default:@localhost:8123/databuddy_analytics",
	DATABASE_URL:
		"postgres://databuddy:databuddy_dev_password@localhost:5432/databuddy",
	REDIS_URL: "redis://localhost:6379",
} as const;

export function readBooleanEnv(
	name: string,
	environment: Env = process.env
): boolean {
	return environment[name]?.trim().toLowerCase() === "true";
}

function hostnameOf(url: string): string {
	return new URL(
		url.includes("://") ? url : `tcp://${url}`
	).hostname.toLowerCase();
}

export function isLocalHost(url: string): boolean {
	const hostname = hostnameOf(url);
	return (
		LOOPBACK_HOSTS.has(hostname) ||
		(hostname !== "" && !hostname.includes(".") && !hostname.includes(":"))
	);
}

export function dataUrl(
	key: keyof typeof LOCAL_DATA_URLS,
	env: Env = process.env
): string | undefined {
	return (
		env[key] ||
		(env.NODE_ENV === "development" ? LOCAL_DATA_URLS[key] : undefined)
	);
}
