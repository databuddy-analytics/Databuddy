import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPricingApiPayload } from "@/app/api/pricing/build-response";
import { AiPricingSummary } from "@/app/(home)/pricing/_pricing/ai-pricing-summary";
import { Estimator } from "@/app/(home)/pricing/_pricing/estimator";
import { normalizePlans } from "@/app/(home)/pricing/_pricing/normalize";
import { RAW_PLANS } from "@/app/(home)/pricing/data";
import { StructuredData } from "@/components/structured-data";
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
	it("renders the visible estimator's fractional-cent rates accurately", () => {
		const plans = normalizePlans(RAW_PLANS.filter((plan) => plan.id === "hobby"));
		const markup = renderToStaticMarkup(createElement(Estimator, { plans }));
		expect(markup).toContain("Rate / 1,000 events");
		expect(markup).toContain(">$0.035</td>");
		expect(markup).toContain(">$0.015</td>");
	});

	it("renders JSON-LD event rates without rounding away half-cent increments", () => {
		const plans = RAW_PLANS.filter((plan) => plan.id === "hobby");
		const markup = renderToStaticMarkup(
			createElement(StructuredData, {
				page: { title: "Pricing", url: "/pricing" },
				elements: [{ type: "softwareOffers", plans }],
			})
		);
		expect(markup).toContain('"price":"0.035"');
		expect(markup).toContain('"price":"0.015"');
		expect(markup).toContain('"minValue":30001');
		expect(markup).toContain('"maxValue":2030000');
		expect(markup).toContain('"unitText":"total monthly events"');
	});

	it("declares the API's absolute tier basis beside its included allowance", () => {
		const response = buildPricingApiPayload(
			new Request("https://www.databuddy.cc/api/pricing")
		);
		for (const plan of response.plans) {
			for (const feature of plan.features) {
				if (feature.overageTiers) {
					expect(feature.overageTierBasis).toBe("total_monthly_events");
				}
			}
		}
		const business = response.plans.find((plan) => plan.id === "intelligence");
		expect(
			business?.features.find((feature) => feature.id === "events")
		).toMatchObject({
			included: 2_000_000,
			overageTierBasis: "total_monthly_events",
			overageTiers: [
				{ upTo: 10_000_000, pricePerUnit: 0.00003 },
				{ upTo: 50_000_000, pricePerUnit: 0.00002 },
				{ upTo: 250_000_000, pricePerUnit: 0.000015 },
				{ upTo: "unlimited", pricePerUnit: 0.00001 },
			],
		});
	});

	it.each([
		["hobby", "30,001–2,030,000: $0.035 per 1,000 events"],
		["pro", "1,000,001–2,000,000: $0.035 per 1,000 events"],
		["intelligence", "2,000,001–10,000,000: $0.03 per 1,000 events"],
		["intelligence_scale", "10,000,001–50,000,000: $0.02 per 1,000 events"],
	] as const)("renders %s paid ranges as total monthly event counts with exact rates", (id, firstRange) => {
		const plan = RAW_PLANS.find((entry) => entry.id === id);
		if (!plan) throw new Error(`Missing pricing plan ${id}`);
		const markup = renderToStaticMarkup(
			createElement(AiPricingSummary, { plans: [plan] })
		);
		expect(markup).toContain("Overage tiers (total monthly event counts):");
		expect(markup).toContain(`\n  ${firstRange}\n`);
		expect(markup).not.toContain("\n  0–");
		expect(markup).toContain("$0.015 per 1,000 events");
		expect(markup).toContain("$0.01 per 1,000 events");
	});

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
