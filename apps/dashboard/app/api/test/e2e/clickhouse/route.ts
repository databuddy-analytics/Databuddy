import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { readBooleanEnv } from "@databuddy/env/boolean";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_KEY_HEADER = "x-e2e-test-key";
const PATHS = ["/", "/pricing", "/docs", "/dashboard", "/settings"];
const REFERRERS = [null, "https://google.com", "https://github.com"];

interface SeedBody {
	eventCount?: unknown;
	websiteId?: unknown;
}

function isE2EModeEnabled(): boolean {
	return readBooleanEnv("DATABUDDY_E2E_MODE");
}

function notFound(): Response {
	return Response.json({ error: "Not found" }, { status: 404 });
}

function assertE2EAccess(request: Request): Response | null {
	if (!isE2EModeEnabled()) {
		return notFound();
	}
	const key = process.env.DATABUDDY_E2E_TEST_KEY;
	if (!key) {
		return notFound();
	}
	if (request.headers.get(TEST_KEY_HEADER) !== key) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	return null;
}

function normalizeEventCount(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed)) {
		return 250;
	}
	return Math.min(Math.max(Math.floor(parsed), 1), 5000);
}

function clickHouseDate(date: Date): string {
	return date.toISOString().replace("T", " ").replace("Z", "");
}

function pageTitle(path: string): string {
	return path === "/" ? "Home" : path.slice(1).replaceAll("-", " ");
}

async function clearExistingSeedData(websiteId: string): Promise<void> {
	const params = { websiteId };
	const settings = { mutations_sync: "1", wait_end_of_query: 1 } as const;

	await Promise.all([
		clickHouse.command({
			clickhouse_settings: settings,
			query: `ALTER TABLE ${TABLE_NAMES.events} DELETE WHERE client_id = {websiteId:String}`,
			query_params: params,
		}),
		clickHouse.command({
			clickhouse_settings: settings,
			query: `ALTER TABLE ${TABLE_NAMES.outgoing_links} DELETE WHERE client_id = {websiteId:String}`,
			query_params: params,
		}),
		clickHouse.command({
			clickhouse_settings: settings,
			query:
				"ALTER TABLE analytics.daily_pageviews DELETE WHERE client_id = {websiteId:String}",
			query_params: params,
		}),
	]);
}

export async function POST(request: Request): Promise<Response> {
	const denied = assertE2EAccess(request);
	if (denied) {
		return denied;
	}

	if (!readBooleanEnv("DATABUDDY_E2E_SEED_CLICKHOUSE")) {
		return Response.json({ seeded: false, reason: "disabled" });
	}

	const body = (await request.json().catch(() => ({}))) as SeedBody;
	if (typeof body.websiteId !== "string" || !body.websiteId) {
		return Response.json({ error: "websiteId is required" }, { status: 400 });
	}

	const eventCount = normalizeEventCount(body.eventCount);
	await clearExistingSeedData(body.websiteId);

	const now = Date.now();
	const users = Array.from(
		{ length: Math.max(3, Math.ceil(eventCount / 40)) },
		() => crypto.randomUUID()
	);
	const sessions = Array.from(
		{ length: Math.max(5, Math.ceil(eventCount / 12)) },
		(_, index) => ({
			anonymousId: users[index % users.length],
			sessionId: crypto.randomUUID(),
			start: now - (eventCount - index) * 60_000,
		})
	);

	const events = Array.from({ length: eventCount }, (_, index) => {
		const session = sessions[index % sessions.length];
		const path = PATHS[index % PATHS.length];
		const timestamp = new Date(session.start + index * 30_000);
		return {
			id: crypto.randomUUID(),
			client_id: body.websiteId as string,
			event_name: index % 4 === 0 ? "page_exit" : "screen_view",
			anonymous_id: session.anonymousId,
			time: clickHouseDate(timestamp),
			session_id: session.sessionId,
			session_start_time: clickHouseDate(new Date(session.start)),
			timestamp: clickHouseDate(timestamp),
			referrer: REFERRERS[index % REFERRERS.length],
			url: `https://e2e.databuddy.local${path}`,
			path,
			title: pageTitle(path),
			ip: "127.0.0.1",
			user_agent: "Databuddy E2E",
			browser_name: index % 3 === 0 ? "Firefox" : "Chrome",
			os_name: index % 2 === 0 ? "macOS" : "Linux",
			device_type: index % 5 === 0 ? "mobile" : "desktop",
			country: index % 2 === 0 ? "US" : "DE",
			properties: "{}",
			created_at: clickHouseDate(new Date(now)),
		};
	});

	const screenViewEvents = events.filter(
		(event) => event.event_name === "screen_view"
	);
	const screenViewsByCountry = screenViewEvents.reduce<Record<string, number>>(
		(acc, event) => {
			acc[event.country] = (acc[event.country] ?? 0) + 1;
			return acc;
		},
		{}
	);
	const screenViewsByPath = screenViewEvents.reduce<Record<string, number>>(
		(acc, event) => {
			acc[event.path] = (acc[event.path] ?? 0) + 1;
			return acc;
		},
		{}
	);

	const outgoingLinks = sessions
		.slice(0, Math.ceil(eventCount / 20))
		.map((session) => ({
			id: crypto.randomUUID(),
			client_id: body.websiteId as string,
			anonymous_id: session.anonymousId,
			session_id: session.sessionId,
			href: "https://github.com/databuddy-analytics/Databuddy",
			text: "Databuddy GitHub",
			properties: "{}",
			timestamp: clickHouseDate(new Date(session.start + 45_000)),
		}));

	await Promise.all([
		clickHouse.insert({
			format: "JSONEachRow",
			table: TABLE_NAMES.events,
			values: events,
		}),
		clickHouse.insert({
			format: "JSONEachRow",
			table: TABLE_NAMES.outgoing_links,
			values: outgoingLinks,
		}),
	]);

	return Response.json({
		events: events.length,
		outgoingLinks: outgoingLinks.length,
		screenViews: screenViewEvents.length,
		screenViewsByCountry,
		screenViewsByPath,
		seeded: true,
		websiteId: body.websiteId,
	});
}
