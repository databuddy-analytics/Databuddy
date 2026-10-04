import { clickHouse } from "@databuddy/db/clickhouse";
import {
	EVENTS_PER_SESSION,
	generateAnalytics,
	seedAnalytics,
} from "@databuddy/db/seed";
import { readBooleanEnv } from "@databuddy/env/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_KEY_HEADER = "x-e2e-test-key";

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

export async function POST(request: Request): Promise<Response> {
	const denied = assertE2EAccess(request);
	if (denied) {
		return denied;
	}

	const body = (await request.json().catch(() => ({}))) as SeedBody;
	if (typeof body.websiteId !== "string" || !body.websiteId) {
		return Response.json({ error: "websiteId is required" }, { status: 400 });
	}

	const rows = generateAnalytics({
		clientId: body.websiteId,
		dailySessions: Math.ceil(
			normalizeEventCount(body.eventCount) / EVENTS_PER_SESSION
		),
		days: 1,
		domain: "e2e.databuddy.local",
	});
	await seedAnalytics(clickHouse, rows);

	const screenViewEvents = rows.events.filter(
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

	return Response.json({
		events: rows.events.length,
		outgoingLinks: rows.outgoingLinks.length,
		screenViews: screenViewEvents.length,
		screenViewsByCountry,
		screenViewsByPath,
		seeded: true,
		websiteId: body.websiteId,
	});
}
