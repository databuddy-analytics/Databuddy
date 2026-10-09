import { clickHouse } from "@databuddy/db/clickhouse";
import { generateAnalytics, seedAnalytics } from "@databuddy/db/seed";
import { readBooleanEnv } from "@databuddy/env/app";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const seedBody = z.object({
	eventCount: z.coerce.number().catch(250),
	websiteId: z.string().min(1),
});

function countBy<T>(items: T[], key: (item: T) => string) {
	const counts: Record<string, number> = {};
	for (const item of items) {
		counts[key(item)] = (counts[key(item)] ?? 0) + 1;
	}
	return counts;
}

export async function POST(request: Request): Promise<Response> {
	const key = process.env.DATABUDDY_E2E_TEST_KEY;
	if (!(readBooleanEnv("DATABUDDY_E2E_MODE") && key)) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	if (request.headers.get("x-e2e-test-key") !== key) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = seedBody.safeParse(await request.json().catch(() => null));
	if (!body.success) {
		return Response.json({ error: "websiteId is required" }, { status: 400 });
	}
	const { eventCount, websiteId } = body.data;

	const rows = generateAnalytics({
		clientId: websiteId,
		days: 1,
		domain: "e2e.databuddy.local",
		events: Math.min(Math.max(Math.floor(eventCount), 1), 5000),
	});
	await seedAnalytics(clickHouse, rows);

	const screenViews = rows.events.filter(
		(event) => event.event_name === "screen_view"
	);
	return Response.json({
		events: rows.events.length,
		outgoingLinks: rows.outgoingLinks.length,
		screenViews: screenViews.length,
		screenViewsByCountry: countBy(screenViews, (event) => event.country),
		screenViewsByPath: countBy(screenViews, (event) => event.path),
		seeded: true,
		websiteId,
	});
}
