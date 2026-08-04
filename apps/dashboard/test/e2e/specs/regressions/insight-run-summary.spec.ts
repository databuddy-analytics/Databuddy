import { randomUUID } from "node:crypto";
import { db } from "@databuddy/db";
import { insightObservations, insightRuns } from "@databuddy/db/schema";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { expect, test } from "@/test/e2e/fixtures";

function signal(
	websiteId: string,
	signalKey: string
): InvestigationSignal {
	return {
		signalKey,
		entity: { type: "website", id: websiteId, label: "E2E Website" },
		metric: { label: "Signup conversion", current: 20, format: "percent" },
		changePercent: -50,
		severity: "warning",
		sentiment: "negative",
		period: {
			current: { from: "2026-07-25", to: "2026-07-31" },
			previous: { from: "2026-07-18", to: "2026-07-24" },
		},
	};
}

function outcome(
	type: InvestigationOutcome["next"]["type"],
	{
		publish = false,
		recommendation = null,
		title = `E2E ${type} outcome`,
	}: {
		publish?: boolean;
		recommendation?: InvestigationOutcome["recommendation"];
		title?: string;
	} = {}
): InvestigationOutcome {
	const next: InvestigationOutcome["next"] =
		type === "act"
			? {
					action: "Restore the missing signup event.",
					target: "Signup submit handler",
					type,
					verification: "Signup conversion recovers for 24 hours.",
				}
			: type === "ask"
				? { question: "Did the signup release change?", type }
				: type === "watch"
					? {
						escalation: "Escalate if signup conversion falls another 10%.",
						type,
					}
					: { reason: "The measured change recovered.", type };

	return {
		evidence: ["Signup conversion changed in the measured window."],
		impact: type === "act" ? "Signup completion is affected." : null,
		next,
		publish,
		recommendation,
		rootCause:
			type === "act"
				? "The signup submit handler stopped emitting completions."
				: null,
		summary: `E2E ${type} outcome.`,
		title,
	};
}

test(
	"keeps completed insight outcomes compact on Latest",
	{ tag: ["@regression"] },
	async ({ authenticatedPage, e2eSession }) => {
		if (!e2eSession.websiteId) {
			throw new Error("Expected the E2E session to include a website");
		}

		const createdAt = new Date();
		const runId = randomUUID();
		await db.insert(insightRuns).values({
			completedItems: 1,
			createdAt,
			finishedAt: createdAt,
			id: runId,
			organizationId: e2eSession.organizationId,
			status: "succeeded",
			totalItems: 1,
		});
		await db.insert(insightObservations).values(
			(["act", "ask", "watch", "resolve", "resolve"] as const).map(
				(type, index) => {
					const signalKey = `e2e:run-summary:${index}`;
					return {
						asOf: createdAt,
						createdAt,
						id: randomUUID(),
						organizationId: e2eSession.organizationId,
						outcome:
							index === 4
								? outcome(type, {
										publish: true,
										recommendation: {
											action: "Review a signup goal.",
											changes: null,
											operation: null,
										},
										title: "E2E recommendation outcome",
									})
								: outcome(type, {
										publish: type === "act" || type === "ask",
									}),
						recheckAt: createdAt,
						runId,
						signal: signal(e2eSession.websiteId, signalKey),
						signalKey,
						websiteId: e2eSession.websiteId,
					};
				}
			)
		);

		await authenticatedPage.goto("/insights");
		const results = authenticatedPage.getByLabel(/Analysis results/);
		await expect(results).toContainText("5 changes analyzed · 3 findings published");
		await expect(results).toContainText("2 awaiting input");
		await expect(results).toContainText("1 under watch");
		await expect(results).toContainText("2 no follow-up");
		await expect(results).toContainText("1 recommendation published");
		await expect(
			results.getByRole("link", { name: "2 awaiting input" })
		).toHaveAttribute("href", "/insights/investigations");

		await expect(
			authenticatedPage.getByText("E2E watch outcome", { exact: true })
		).toHaveCount(0);
		await expect(
			authenticatedPage.getByText("E2E resolve outcome", { exact: true })
		).toHaveCount(0);
		await expect(
			authenticatedPage.getByText("E2E recommendation outcome", { exact: true })
		).toBeVisible();
	}
);
