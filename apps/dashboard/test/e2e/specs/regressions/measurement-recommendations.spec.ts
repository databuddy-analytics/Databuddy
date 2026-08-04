import { randomUUID } from "node:crypto";
import { db } from "@databuddy/db";
import { goals, insightObservations } from "@databuddy/db/schema";
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

test(
	"reviews and completes a goal change recommendation in place",
	{ tag: ["@regression"] },
	async ({ authenticatedPage, e2eSession }) => {
		if (!e2eSession.websiteId) {
			throw new Error("Expected the E2E session to include a website");
		}

		const goalId = randomUUID();
		const signalKey = `goal:${goalId}`;
		const createdAt = new Date();
		const outcome: InvestigationOutcome = {
			title: "Checkout goal needs a clearer definition",
			summary:
				"The current checkout goal does not explain which completed purchase it measures.",
			impact:
				"The team cannot distinguish checkout completions from other conversion activity.",
			rootCause: "The goal does not have a business description.",
			evidence: [
				"The configured checkout_completed event has no goal description for the team to review.",
			],
			publish: true,
			recommendation: {
				action: "Review the checkout goal definition.",
				changes: {
					description: "Measures completed checkout events.",
					name: "Checkout completed",
				},
				operation: "edit",
			},
			next: {
				reason: "This proposed definition is ready for teammate review.",
				type: "resolve",
			},
		};

		await db.insert(goals).values({
			createdBy: e2eSession.userId,
			id: goalId,
			name: "Checkout",
			target: "checkout_completed",
			type: "EVENT",
			websiteId: e2eSession.websiteId,
		});
		await db.insert(insightObservations).values({
			id: randomUUID(),
			organizationId: e2eSession.organizationId,
			websiteId: e2eSession.websiteId,
			insightId: null,
			signalKey,
			asOf: createdAt,
			signal: {
				signalKey,
				entity: {
					type: "goal",
					id: goalId,
					label: "Checkout",
				},
				metric: {
					label: "Checkout conversion",
					current: 20,
					previous: 10,
					format: "percent",
				},
				changePercent: 100,
				severity: "info",
				sentiment: "neutral",
				period: {
					current: { from: "2026-07-25", to: "2026-07-31" },
					previous: { from: "2026-07-18", to: "2026-07-24" },
				},
			},
			evidence: outcome.evidence,
			outcome,
			recheckAt: createdAt,
			createdAt,
		});

		await authenticatedPage.goto("/insights/recommendations");
		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toBeVisible();
		await authenticatedPage
			.getByRole("button", { name: "Review goal changes" })
			.click();

		const dialog = authenticatedPage.getByRole("dialog", {
			name: "Checkout completed",
		});
		await expect(dialog).toBeVisible();
		await expect(authenticatedPage).toHaveURL(/\/insights\/recommendations$/);
		await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(
			"Checkout completed"
		);
		await expect(
			dialog.getByRole("textbox", { name: "Business meaning (optional)" })
		).toHaveValue("Measures completed checkout events.");

		await dialog.getByRole("button", { name: "Save Changes" }).click();
		await expect(dialog).toBeHidden();
		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toBeHidden();
		await expect(
			authenticatedPage.getByRole("heading", { name: "No recommendations" })
		).toBeVisible();
		await authenticatedPage.reload();
		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toBeHidden();
		await expect(
			authenticatedPage.getByRole("heading", { name: "No recommendations" })
		).toBeVisible();
	}
);

test(
	"creates a funnel recommendation in place and retires it durably",
	{ tag: ["@regression"] },
	async ({ authenticatedPage, e2eSession }) => {
		if (!e2eSession.websiteId) {
			throw new Error("Expected the E2E session to include a website");
		}

		const signalKey = "measurement:checkout-funnel";
		const createdAt = new Date();
		const outcome: InvestigationOutcome = {
			title: "Checkout needs a measurable funnel",
			summary:
				"The site cannot show where visitors abandon the checkout journey.",
			impact:
				"The team cannot distinguish checkout drop-off from a lack of purchase intent.",
			rootCause: null,
			evidence: [
				"Checkout start and completion events are present without a configured funnel.",
			],
			publish: true,
			recommendation: {
				action: "Review a funnel from checkout start to completion.",
				nativeAction: {
					draft: {
						description: "Measure the checkout journey from start to completion.",
						filters: [],
						ignoreHistoricData: false,
						name: "Checkout funnel",
						steps: [
							{
								name: "Checkout started",
								target: "checkout_started",
								type: "EVENT",
							},
							{
								name: "Checkout completed",
								target: "checkout_completed",
								type: "EVENT",
							},
						],
					},
					type: "funnel.create",
				},
			},
			next: {
				reason: "This proposed funnel is ready for teammate review.",
				type: "resolve",
			},
		};

		await db.insert(insightObservations).values({
			id: randomUUID(),
			organizationId: e2eSession.organizationId,
			websiteId: e2eSession.websiteId,
			insightId: null,
			signalKey,
			asOf: createdAt,
			signal: {
				signalKey,
				entity: {
					type: "website",
					id: e2eSession.websiteId,
					label: "E2E Website",
				},
				metric: {
					label: "Checkout measurement coverage",
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
			},
			evidence: outcome.evidence,
			outcome,
			recheckAt: createdAt,
			createdAt,
		});

		await authenticatedPage.goto("/insights/recommendations");
		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toBeVisible();
		await authenticatedPage
			.getByRole("button", { name: "Review funnel draft" })
			.click();

		const dialog = authenticatedPage.getByRole("dialog", {
			name: "Review Funnel Draft",
		});
		await expect(dialog).toBeVisible();
		await expect(
			dialog.getByRole("textbox", { exact: true, name: "Name" })
		).toHaveValue("Checkout funnel");
		await expect(
			dialog.locator('input[placeholder="event_name"]').first()
		).toHaveValue("checkout_started");
		await dialog.getByRole("button", { name: "Create Funnel" }).click();
		await expect(dialog).toBeHidden();
		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toBeHidden();
		await authenticatedPage.reload();
		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toBeHidden();
	}
);

test(
	"creates a feature flag recommendation in place and retires it durably",
	{ tag: ["@regression"] },
	async ({ authenticatedPage, e2eSession }) => {
		if (!e2eSession.websiteId) {
			throw new Error("Expected the E2E session to include a website");
		}

		const signalKey = "measurement:checkout-release-control";
		const createdAt = new Date();
		const outcome: InvestigationOutcome = {
			title: "Checkout needs a controlled release",
			summary:
				"The new checkout cannot be enabled gradually for a measured audience.",
			impact:
				"The team cannot limit exposure while validating the updated checkout journey.",
			rootCause: null,
			evidence: [
				"The checkout flow has no feature flag configured for a controlled rollout.",
			],
			publish: true,
			recommendation: {
				action: "Create a release flag for the new checkout.",
				nativeAction: {
					draft: {
						defaultValue: false,
						description: "Controls the new checkout experience.",
						key: "checkout-rollout",
						name: "Checkout rollout",
					},
					type: "feature_flag.create",
				},
			},
			next: {
				reason: "This release control is ready for teammate review.",
				type: "resolve",
			},
		};

		await db.insert(insightObservations).values({
			id: randomUUID(),
			organizationId: e2eSession.organizationId,
			websiteId: e2eSession.websiteId,
			insightId: null,
			signalKey,
			asOf: createdAt,
			signal: {
				signalKey,
				entity: {
					type: "website",
					id: e2eSession.websiteId,
					label: "E2E Website",
				},
				metric: {
					label: "Checkout release coverage",
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
			},
			evidence: outcome.evidence,
			outcome,
			recheckAt: createdAt,
			createdAt,
		});

		await authenticatedPage.goto("/insights/recommendations");
		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toBeVisible();
		await authenticatedPage
			.getByRole("button", { name: "Review flag draft" })
			.click();

		const dialog = authenticatedPage.getByRole("dialog", {
			name: "Create Flag",
		});
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(
			"Checkout rollout"
		);
		await expect(dialog.getByRole("textbox", { name: "Key" })).toHaveValue(
			"checkout-rollout"
		);
		await dialog.getByRole("button", { name: "Create Flag" }).click();
		await expect(dialog).toBeHidden();
		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toBeHidden();
		await authenticatedPage.reload();
		await expect(
			authenticatedPage.getByText(outcome.title, { exact: true })
		).toBeHidden();
	}
);
