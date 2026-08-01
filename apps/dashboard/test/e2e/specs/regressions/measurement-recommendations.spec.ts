import { randomUUID } from "node:crypto";
import { db } from "@databuddy/db";
import { analyticsInsights, insightObservations } from "@databuddy/db/schema";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { expect, test } from "@/test/e2e/fixtures";

test(
	"opens an editable goal draft from an insight recommendation",
	{ tag: ["@regression"] },
	async ({ authenticatedPage, e2eSession }) => {
		expect(e2eSession.websiteId).toBeTruthy();
		if (!e2eSession.websiteId) {
			throw new Error("Expected the E2E session to include a website");
		}

		const insightId = randomUUID();
		const signalKey = "measurement:conversion-coverage";
		const createdAt = new Date();
		const signal: InvestigationSignal = {
			signalKey,
			entity: {
				type: "website",
				id: e2eSession.websiteId,
				label: "E2E Website",
			},
			metric: {
				label: "Conversion measurement coverage",
				current: 0,
				format: "number",
			},
			changePercent: null,
			severity: "info",
			sentiment: "neutral",
			period: {
				current: { from: "2026-07-25", to: "2026-07-31" },
				previous: { from: "2026-07-18", to: "2026-07-24" },
			},
		};
		const outcome: InvestigationOutcome = {
			title: "Checkout completion needs a measurable goal",
			summary:
				"The site has active traffic but no configured conversion measurement.",
			impact:
				"The team cannot see whether people complete checkout from the current analytics setup.",
			rootCause: null,
			evidence: [
				"The completed period recorded 68 sessions and 142 pageviews without an active goal or funnel.",
			],
			publish: true,
			recommendation: {
				kind: "goal_draft",
				action: "Review a goal for completed checkout.",
				draft: {
					name: "Checkout completed",
					description: "Measure completed checkout events.",
					type: "EVENT",
					target: "checkout_completed",
					filters: [],
					ignoreHistoricData: false,
				},
			},
			next: {
				type: "resolve",
				reason: "This proposed goal is ready for teammate review.",
			},
		};

		await db.insert(analyticsInsights).values({
			id: insightId,
			organizationId: e2eSession.organizationId,
			websiteId: e2eSession.websiteId,
			title: outcome.title,
			description: outcome.summary,
			severity: "info",
			sentiment: "neutral",
			changePercent: null,
			dedupeKey: `${e2eSession.websiteId}|${signalKey}`,
			subjectKey: signalKey,
			timezone: "UTC",
			status: "resolved",
			createdAt,
		});
		await db.insert(insightObservations).values({
			id: randomUUID(),
			organizationId: e2eSession.organizationId,
			websiteId: e2eSession.websiteId,
			insightId,
			signalKey,
			asOf: createdAt,
			signal,
			evidence: outcome.evidence,
			outcome,
			recheckAt: createdAt,
			createdAt,
		});

		await authenticatedPage.goto("/insights");

		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toBeVisible();
		await authenticatedPage
			.getByRole("button", { name: "Review goal draft" })
			.click();
		await expect(
			authenticatedPage.getByText("Review Goal Draft", { exact: true })
		).toBeVisible();
		await expect(
			authenticatedPage.getByDisplayValue("Checkout completed")
		).toBeVisible();
		await expect(
			authenticatedPage.getByDisplayValue("checkout_completed")
		).toBeVisible();
	}
);
