import { expect, test } from "bun:test";

// A subprocess exercises the real signal handlers and process exit without
// sharing shutdown state or replacing process.exit in the test runner.
const shutdownScenario = `
import { mock } from "bun:test";
import { Elysia } from "elysia";

const geo = Promise.withResolvers();
const geoStarted = Promise.withResolvers();
const delivery = Promise.withResolvers();
const steps = [];
const timers = [];
// Keep the event loop alive like Bun's HTTP server while deadlines are unref'd.
setInterval(() => {}, 1000);
let status = null;
let rejectedStatus = null;
let inserts = 0;
let lost = 0;
const nativeSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (handler, delay, ...args) => {
  timers.push(delay);
  return nativeSetTimeout(handler, delay >= 1000 ? delay / 100 : delay, ...args);
};
process.on("exit", () => console.log(JSON.stringify({ steps, timers, status, rejectedStatus, inserts, lost })));

const link = {
  id: "synthetic-link", targetUrl: "https://example.com", expiresAt: null,
  expiredRedirectUrl: null, ogTitle: null, ogDescription: null, ogImageUrl: null,
  ogVideoUrl: null, iosUrl: null, androidUrl: null, deepLinkApp: null,
};
mock.module("@databuddy/env/app", () => ({ config: { urls: { dashboard: "https://dashboard.test" } } }));
mock.module("@databuddy/db", () => ({
  and: () => {}, db: {}, eq: () => {}, isNull: () => {}, sql: () => {},
  shutdownPostgres: async () => { steps.push("postgres-close"); },
}));
mock.module("@databuddy/db/schema", () => ({ links: {} }));
mock.module("@databuddy/db/clickhouse", () => ({
  clickHouse: { insert: async () => {
    inserts++;
    await delivery.promise;
    steps.push("clickhouse-ack");
  } },
  TABLE_NAMES: { link_visits: "analytics.link_visits" },
}));
mock.module("@databuddy/redis", () => ({
  redis: {}, getCachedLink: async () => ({ state: "hit", link }),
  getRateLimitHeaders: () => ({}), ratelimit: async () => ({ success: true }),
  setCachedLinkIfAbsent: async () => {}, setCachedLinkNotFoundIfAbsent: async () => {},
  shutdownRedis: async () => { steps.push("redis-close"); },
}));
mock.module("@databuddy/shared/bot-detection", () => ({
  BotCategory: { SEARCH_ENGINE: "search", SOCIAL_MEDIA: "social" },
  detectBot: () => ({ category: "other", isBot: false }),
}));
mock.module("evlog", () => ({
  createError: (fields) => Object.assign(new Error(fields.message), fields),
  initLogger: () => {},
  log: { info: () => {}, warn: () => {}, error: (event) => {
    if (event.failed_steps) steps.push(event.failed_steps);
  } },
}));
mock.module("evlog/elysia", () => ({ evlog: () => new Elysia() }));
mock.module("./src/lib/logging.ts", () => ({
  captureError: () => {}, captureWarning: () => {}, mergeWideEvent: () => {},
  setAttributes: () => {}, enrich: () => {}, drain: async () => {},
  emitServiceEvent: (_, event) => { if (event.links === "click_lost") lost++; },
  record: async (_, run) => run(),
  flushDrain: async () => { steps.push("log-flush"); },
}));
mock.module("./src/utils/geo.ts", () => ({
  preloadGeoDatabase: () => {}, extractIp: () => "127.0.0.1",
  getGeo: () => { geoStarted.resolve(); return geo.promise; },
}));

const { default: server } = await import("./src/index.ts");
const response = server.fetch(new Request("http://links.test/synthetic-link"));
await geoStarted.promise;
process.emit("SIGTERM");
process.emit("SIGINT");
rejectedStatus = (await server.fetch(new Request("http://links.test/new-link"))).status;
if (process.env.SCENARIO !== "hung") {
  geo.resolve({ city: null, country: null, region: null });
  status = (await response).status;
  await Bun.sleep(0);
  steps.push("release-clickhouse");
  delivery.resolve();
}
`;

async function runShutdown(mode: string | undefined, scenario = "delayed") {
	const child = Bun.spawn([process.execPath, "--no-env-file", "-"], {
		cwd: new URL("..", import.meta.url).pathname,
		env: {
			NODE_ENV: "test",
			...(mode === undefined ? {} : { SELFHOST: mode }),
			SCENARIO: scenario,
		},
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		timeout: 5000,
	});
	child.stdin.write(shutdownScenario);
	child.stdin.end();
	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect(stderr).toBe("");
	return {
		code,
		result: JSON.parse(stdout) as {
			inserts: number;
			lost: number;
			rejectedStatus: number | null;
			status: number | null;
			steps: string[];
			timers: number[];
		},
	};
}

test("self-host shutdown drains an admitted redirect before its ClickHouse write", async () => {
	const { code, result } = await runShutdown("true");
	expect(code).toBe(0);
	expect(result).toMatchObject({
		inserts: 1,
		lost: 0,
		rejectedStatus: 503,
		status: 302,
		steps: [
			"release-clickhouse",
			"clickhouse-ack",
			"redis-close",
			"postgres-close",
			"log-flush",
		],
	});
	expect(result.timers).toContain(30_000);
});

test("self-host shutdown stops waiting for a hung redirect", async () => {
	const { code, result } = await runShutdown("true", "hung");
	expect(code).toBe(1);
	expect(result.inserts).toBe(0);
	expect(result.steps).toContain("httpRequestDrain");
	expect(result.steps).toContain("redis-close");
	expect(result.steps).toContain("postgres-close");
});

test.each([
	"false",
	undefined,
])("hosted shutdown retains its existing request and timeout behavior with SELFHOST=%s", async (mode) => {
	const { code, result } = await runShutdown(mode, "hung");
	expect(code).toBe(0);
	expect(result.inserts).toBe(0);
	expect(result.steps).not.toContain("httpRequestDrain");
	expect(result.timers).toContain(20_000);
	expect(result.timers).not.toContain(30_000);
});
