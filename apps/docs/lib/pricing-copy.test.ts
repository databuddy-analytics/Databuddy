import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { buildPricingApiPayload } from "@/app/api/pricing/build-response";
import { RAW_PLANS } from "@/app/(home)/pricing/data";
import { competitors } from "./comparison-config";

function included(
	planId: string,
	featureId: string,
	interval: "day" | "month"
): number | "inf" | undefined {
	const plan = RAW_PLANS.find((candidate) => candidate.id === planId);
	const item = plan?.items.find(
		(candidate) =>
			(candidate.type === "feature" || candidate.type === "priced_feature") &&
			candidate.feature_id === featureId &&
			candidate.interval === interval
	);
	return item?.type === "feature" || item?.type === "priced_feature"
		? item.included_usage
		: undefined;
}

describe("public pricing copy", () => {
	it("shows the completed-unit price and access gate on every investigation comparison row", () => {
		const rows = Object.values(competitors).flatMap((competitor) =>
			competitor.pricingTiers.filter(
				(row) => row.pageviews === "Automatic investigations"
			)
		);
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.databuddy).toContain(
				`$${INVESTIGATION_USAGE.priceUsd} per completed investigation`
			);
			expect(row.databuddy).toContain("Invite only");
			expect(["Free", "Included"]).not.toContain(row.databuddy);
		}
	});

	it("stays aligned with the pricing data used by the page and API", async () => {
		const markdown = await readFile(
			join(import.meta.dir, "..", "public", "pricing.md"),
			"utf8"
		);

		for (const planId of [
			"free",
			"hobby",
			"pro",
			"intelligence",
			"intelligence_scale",
		] as const) {
			expect(markdown).toContain(
				included(planId, "events", "month")?.toLocaleString() ?? ""
			);
			expect(markdown).toContain(
				`${included(planId, "agent_credits", "month")?.toLocaleString()} / month`
			);
		}

		expect(markdown).not.toContain("Assistant messages");
		expect(markdown).not.toContain("Agent credits");
		expect(markdown).not.toContain("Databunny usage");
		expect(markdown).not.toContain("usage units");
		expect(markdown).toContain("AI credits");
		expect(markdown).toContain("Invite only");
		expect(markdown).toContain("$1 per completed investigation");
		expect(markdown).toContain("prepaid investigations do not expire");
	});
	it("publishes fixed investigation pricing separately from unchanged AI credit allowances", () => {
		const response = buildPricingApiPayload(new Request("https://www.databuddy.cc/api/pricing"));
		expect(response.investigations).toMatchObject({
			featureId: "investigation_runs", pricePerInvestigation: 1,
			billingModel: "prepaid", includedPerPlan: 0, purchaseLimit: 1000, expires: false,
		});
		for (const plan of response.plans.filter((entry) => entry.id !== "enterprise")) {
			expect(plan.features.find((feature) => feature.id === "investigation_runs")).toMatchObject({ included: 0, interval: null });
		}
		expect(response.investigations.description).toContain("verification after applying a proposed repair are included");
		expect(response.notes.legacyCredits).toContain("preserved");
	});

});
