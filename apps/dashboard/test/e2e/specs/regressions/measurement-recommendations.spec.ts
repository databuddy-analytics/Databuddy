import { randomUUID } from "node:crypto";
import { db } from "@databuddy/db";
import { insightObservations } from "@databuddy/db/schema";
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

		await db.insert(insightObservations).values({
			id: randomUUID(),
			organizationId: e2eSession.organizationId,
			websiteId: e2eSession.websiteId,
			insightId: null,
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
		await expect(
			authenticatedPage.getByRole("button", { name: "Review goal draft" })
		).toHaveCount(0);

		await authenticatedPage.goto("/insights/investigations");
		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toHaveCount(0);

		await authenticatedPage.goto("/insights/recommendations");
		await expect(
			authenticatedPage.getByRole("link", {
				exact: true,
				name: "Recommendations 1 current recommendation",
			})
		).toHaveAttribute("aria-current", "page");
		await expect(
			authenticatedPage.getByRole("link", {
				exact: true,
				name: "Insights 1 current recommendation",
			})
		).toBeVisible();

		await expect(
			authenticatedPage.getByText("Create goal", { exact: true })
		).toBeVisible();
		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toBeVisible();
		await authenticatedPage
			.getByRole("button", { name: "Review goal draft" })
			.click();
		const dialog = authenticatedPage.getByRole("dialog", {
			name: "Review Goal Draft",
		});
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(
			"Checkout completed"
		);
		await expect(dialog.locator('input[placeholder="event_name"]')).toHaveValue(
			"checkout_completed"
		);
	}
);
