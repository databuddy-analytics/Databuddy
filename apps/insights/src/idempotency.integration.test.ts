import "@databuddy/test/env";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { isNotNull, shutdownPostgres, sql } from "@databuddy/db";
import { analyticsInsights, insightRuns } from "@databuddy/db/schema";
import {
	closePostgres,
	db,
	hasTestDb,
	insertOrganization,
	insertWebsite,
	truncatePostgres,
} from "@databuddy/test";
import { eq } from "drizzle-orm";
import { randomUUIDv7 } from "bun";

const runIntegration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" && hasTestDb;
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration("insights idempotency integration", () => {
	beforeEach(async () => {
		await truncatePostgres();
	});

	afterAll(async () => {
		await truncatePostgres();
		await shutdownPostgres();
		await closePostgres();
	});

	it("upserts generated insights by organization dedupe key", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const firstRunId = randomUUIDv7();
		const secondRunId = randomUUIDv7();
		const dedupeKey = `integration:${randomUUIDv7()}`;

		await db().insert(insightRuns).values([
			{ id: firstRunId, organizationId: org.id, reason: "manual" },
			{ id: secondRunId, organizationId: org.id, reason: "manual" },
		]);

		await db().insert(analyticsInsights).values(
			insightRow({
				id: randomUUIDv7(),
				runId: firstRunId,
				organizationId: org.id,
				websiteId: website.id,
				dedupeKey,
				title: "Original checkout signal",
			})
		);

		await db()
			.insert(analyticsInsights)
			.values(
				insightRow({
					id: randomUUIDv7(),
					runId: secondRunId,
					organizationId: org.id,
					websiteId: website.id,
					dedupeKey,
					title: "Updated checkout signal",
				})
			)
			.onConflictDoUpdate({
				target: [analyticsInsights.organizationId, analyticsInsights.dedupeKey],
				targetWhere: isNotNull(analyticsInsights.dedupeKey),
				set: {
					runId: secondRunId,
					title: sql`excluded.title`,
				},
			});

		const rows = await db()
			.select({
				id: analyticsInsights.id,
				runId: analyticsInsights.runId,
				title: analyticsInsights.title,
			})
			.from(analyticsInsights)
			.where(eq(analyticsInsights.organizationId, org.id));

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			runId: secondRunId,
			title: "Updated checkout signal",
		});
	});
});

function insightRow(input: {
	dedupeKey: string;
	id: string;
	organizationId: string;
	runId: string;
	title: string;
	websiteId: string;
}): typeof analyticsInsights.$inferInsert {
	return {
		id: input.id,
		organizationId: input.organizationId,
		websiteId: input.websiteId,
		runId: input.runId,
		dedupeKey: input.dedupeKey,
		title: input.title,
		description: "A test insight description.",
		suggestion: "Inspect the affected flow.",
		severity: "warning",
		sentiment: "negative",
		type: "conversion_leak",
		priority: 8,
		changePercent: -12,
		subjectKey: "checkout",
		sources: ["web"],
		confidence: 0.82,
		impactSummary: "Checkout needs review.",
		metrics: [{ label: "Errors", current: 12, previous: 6, format: "number" }],
		timezone: "UTC",
		currentPeriodFrom: "2026-01-01",
		currentPeriodTo: "2026-01-08",
		previousPeriodFrom: "2025-12-25",
		previousPeriodTo: "2026-01-01",
	};
}
