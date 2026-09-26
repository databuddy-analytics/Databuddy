import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import {
	INVESTIGATION_ALLOWANCES,
	INVESTIGATION_USAGE,
} from "@databuddy/shared/billing";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPricingApiPayload } from "@/app/api/pricing/build-response";
import { Estimator } from "@/app/(home)/pricing/_pricing/estimator";
import {
	calculateTotalCost,
	selectBestPlan,
} from "@/app/(home)/pricing/_pricing/best-plan";
import { PlansComparisonTable } from "@/app/(home)/pricing/_pricing/table";
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
		const plans = normalizePlans(
			RAW_PLANS.filter((plan) => plan.id === "hobby")
		);
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
				{ upTo: 10_000_000, pricePerUnit: 0.000_03 },
				{ upTo: 50_000_000, pricePerUnit: 0.000_02 },
				{ upTo: 250_000_000, pricePerUnit: 0.000_015 },
				{ upTo: "unlimited", pricePerUnit: 0.000_01 },
			],
		});
	});

	it.each([
		["hobby", 30_001, 2_030_000, "0.035"],
		["pro", 1_000_001, 2_000_000, "0.035"],
		["intelligence", 2_000_001, 10_000_000, "0.03"],
		["intelligence_scale", 6_000_001, 10_000_000, "0.03"],
	] as const)("keeps %s structured event ranges and API ceilings aligned", (id, from, to, rate) => {
		const plans = RAW_PLANS.filter((plan) => plan.id === id);
		const markup = renderToStaticMarkup(
			createElement(StructuredData, {
				page: { title: "Pricing", url: "/pricing" },
				elements: [{ type: "softwareOffers", plans }],
			})
		);
		expect(markup).toContain(`"minValue":${from},"maxValue":${to}`);
		expect(markup).toContain(`"price":"${Number(rate).toFixed(3)}"`);
		const payload = buildPricingApiPayload(
			new Request("https://www.databuddy.cc/api/pricing")
		);
		const events = payload.plans
			.find((plan) => plan.id === id)
			?.features.find((feature) => feature.id === "events");
		expect(events?.included).toBe(from - 1);
		expect(events?.overageTiers?.[0]?.upTo).toBe(to);
		expect(events?.overageTiers?.[0]?.pricePerUnit).toBeCloseTo(
			Number(rate) / 1000,
			10
		);
	});

	it("shows the completed-unit price on every investigation comparison row", () => {
		const rows = Object.values(competitors).flatMap((competitor) =>
			competitor.pricingTiers.filter(
				(row) => row.pageviews === "Automatic investigations"
			)
		);
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.databuddy).toContain(
				`$${INVESTIGATION_USAGE.priceUsd} per additional investigation`
			);
			expect(row.databuddy).toContain("100/month on Business");
			expect(row.databuddy).toContain("250/month on Scale");
			expect(row.databuddy).toContain("billed monthly");
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
		}

		expect(markdown).not.toContain("Assistant messages");
		expect(markdown).not.toContain("Agent credits");
		expect(markdown).not.toContain("Databunny usage");
		expect(markdown).not.toContain("usage units");
		expect(markdown).toContain("AI credits");
		expect(markdown).not.toContain("investigation credits");
		expect(markdown).toContain("Databunny chat");
		expect(markdown).toContain(
			"$1 per additional investigation, billed monthly"
		);
		expect(markdown).toContain(
			"125 completed investigations on Business use the 100 included investigations and add $25"
		);
		expect(markdown).not.toContain("no bundled investigations");
	});
	it("publishes monthly allowances and the flat extra price without event-tier or prepaid semantics", () => {
		const response = buildPricingApiPayload(
			new Request("https://www.databuddy.cc/api/pricing")
		);
		expect(response.schemaVersion).toBe(3);
		expect(response.investigations).toMatchObject({
			featureId: "investigation_runs",
			pricePerAdditionalInvestigation: 1,
			billingModel: "usage_based",
			interval: "month",
			includedByPlan: { intelligence: 100, intelligence_scale: 250 },
		});
		expect(response.investigations).not.toHaveProperty("purchaseLimit");
		for (const entitlement of Object.values(response.entitlements)) {
			expect(entitlement.limits).not.toHaveProperty("investigations");
		}
		for (const [id, allowance] of Object.entries(INVESTIGATION_ALLOWANCES)) {
			const plan = response.plans.find((entry) => entry.id === id);
			const feature = plan?.features.find(
				(entry) => entry.id === "investigation_runs"
			);
			expect(feature).toMatchObject({
				included: allowance,
				interval: "month",
				overagePricePerUnit: 1,
				overageBillingInterval: "month",
			});
			expect(feature).not.toHaveProperty("overageTiers");
			expect(feature).not.toHaveProperty("overageTierBasis");
		}
		for (const id of ["free", "hobby", "pro"]) {
			expect(
				response.plans
					.find((plan) => plan.id === id)
					?.features.find((feature) => feature.id === "investigation_runs")
			).toBeUndefined();
		}
		expect(response.investigations.description).toContain(
			"Extras cost $1 per completed investigation."
		);
	});

	it.each([
		["intelligence", 2_000_000, 99, 299],
		["intelligence", 2_000_000, 100, 299],
		["intelligence", 2_000_000, 101, 300],
		["intelligence", 2_001_000, 125, 324.03],
		["intelligence_scale", 6_000_000, 250, 799],
		["intelligence_scale", 6_001_000, 251, 800.03],
	] as const)("calculates %s at %i events and %i completed investigations", (id, events, investigations, total) => {
		const plan = normalizePlans(RAW_PLANS).find((entry) => entry.id === id);
		if (!plan) {
			throw new Error(`Missing pricing plan ${id}`);
		}
		expect(calculateTotalCost(plan, events, investigations)).toBeCloseTo(
			total,
			6
		);
	});

	it("selects an eligible investigation plan instead of treating access as a zero-price add-on", () => {
		const plans = normalizePlans(RAW_PLANS);
		expect(selectBestPlan(0, plans, 0)?.id).toBe("free");
		expect(selectBestPlan(25_000, plans, 1)?.id).toBe("intelligence");
		const highVolume = selectBestPlan(10_000_001, plans, 100);
		expect(highVolume?.id).toBe("intelligence");
		if (!highVolume) {
			throw new Error("Missing high-volume plan");
		}
		expect(calculateTotalCost(highVolume, 10_000_001, 100)).toBeCloseTo(
			539.000_02,
			6
		);
		const hobby = plans.find((plan) => plan.id === "hobby");
		if (!hobby) {
			throw new Error("Missing Hobby plan");
		}
		expect(calculateTotalCost(hobby, 25_000, 1)).toBeNull();
		expect(calculateTotalCost(hobby, 25_000, 0)).toBe(9.99);
	});

	it("renders the same monthly allowance in the table, calculator, and structured offers", () => {
		const cards = renderToStaticMarkup(
			createElement(PlansComparisonTable, { plans: normalizePlans(RAW_PLANS) })
		);
		for (const [id, allowance] of Object.entries(INVESTIGATION_ALLOWANCES)) {
			const plans = RAW_PLANS.filter((plan) => plan.id === id);
			expect(cards).toContain(`>${allowance}</td>`);
			const estimator = renderToStaticMarkup(
				createElement(Estimator, { plans: normalizePlans(plans) })
			);
			expect(estimator).toContain("Investigations included / month");
			expect(estimator).toContain(`>${allowance}</span>`);
			expect(estimator).toContain(
				`href="https://app.databuddy.cc/register?plan=${id}"`
			);
			const structured = renderToStaticMarkup(
				createElement(StructuredData, {
					page: { title: "Pricing", url: "/pricing" },
					elements: [{ type: "softwareOffers", plans }],
				})
			);
			expect(structured).toContain(
				`"name":"Investigations","value":"${allowance}","unitText":"per month"`
			);
			expect(structured).toContain(
				`"minValue":${allowance + 1},"unitText":"total monthly completed investigations"`
			);
			expect(structured).toContain(
				'"unitText":"per additional completed investigation (billed monthly)"'
			);
		}
		expect(cards).toContain("$1.00 per extra");
		expect(cards).not.toContain("purchased separately");
		expect(cards).not.toContain("no investigations are bundled");
		expect(cards).not.toContain("Clarifications");
	});

	it("publishes AI credit allowances as a metered capability", () => {
		const response = buildPricingApiPayload(
			new Request("https://www.databuddy.cc/api/pricing")
		);
		for (const plan of response.plans.filter(
			(entry) => entry.id !== "enterprise"
		)) {
			const credits = plan.features.find(
				(feature) => feature.id === "agent_credits"
			);
			expect(credits).toMatchObject({
				id: "agent_credits",
				name: "AI credits",
				type: "metered",
				interval: "month",
			});
			expect(credits?.included).toBeGreaterThan(0);
			expect(
				plan.features.some((feature) => feature.id === "databunny_chat")
			).toBe(false);
		}
		expect(response).not.toHaveProperty("notes.legacyCredits");
		const structured = renderToStaticMarkup(
			createElement(StructuredData, {
				page: { title: "Pricing", url: "/pricing" },
				elements: [{ type: "softwareOffers", plans: RAW_PLANS }],
			})
		);
		expect(structured).toContain('"name":"AI credits"');
		const table = renderToStaticMarkup(
			createElement(PlansComparisonTable, { plans: normalizePlans(RAW_PLANS) })
		);
		expect(table).toContain("AI credits");
		expect(table).toContain("$9.99");
		expect(table).toContain("$49.99");
		expect(table).not.toContain("first month $2");
		for (const output of [structured, table]) {
			expect(output).not.toContain("databunny_chat");
			expect(output).not.toContain("investigation credits");
			expect(output).not.toContain("prepaid");
			expect(output).not.toContain("legacy billing");
		}
	});
	it("restores a visible comparison table with all six plans and accurate get-started links", () => {
		const plans = normalizePlans(RAW_PLANS);
		const markup = renderToStaticMarkup(
			createElement(PlansComparisonTable, { plans })
		);
		expect(markup).not.toContain("<article");
		expect(markup).not.toContain("<details");
		for (const plan of plans) {
			expect(markup).toContain(`id="${plan.id}"`);
		}
		for (const id of ["hobby", "pro", "intelligence", "intelligence_scale"]) {
			expect(markup).toContain(
				`href="https://app.databuddy.cc/register?plan=${id}"`
			);
		}
		expect(markup).not.toContain("Most popular");
		const comparison = markup;
		expect(comparison).toStartWith("<section ");
		expect(comparison).not.toContain(" open=");
		for (const plan of plans) {
			expect(comparison).toContain(`>${plan.name}</span>`);
		}
		expect(comparison).toContain("Investigations / month");
		const investigationRow = comparison
			.split("Investigations / month")[1]
			?.split("</tr>")[0];
		expect(investigationRow).toContain(">100</td>");
		expect(investigationRow).toContain(">250</td>");
		expect(comparison).toContain("Priority email + Slack");
		expect(comparison).not.toContain("Automatic investigations");
	});

	it("anchors columns high-to-low and marks the recommended tier", () => {
		const markup = renderToStaticMarkup(
			createElement(PlansComparisonTable, { plans: normalizePlans(RAW_PLANS) })
		);
		const header = (id: string) => {
			const anchor = markup.indexOf(`id="${id}"`);
			return markup.slice(
				markup.lastIndexOf("<th ", anchor),
				markup.indexOf("</th>", anchor)
			);
		};
		const order = [
			"enterprise",
			"intelligence_scale",
			"intelligence",
			"pro",
			"hobby",
			"free",
		].map((id) => markup.indexOf(`id="${id}"`));
		expect(order).not.toContain(-1);
		expect(order).toEqual([...order].sort((a, b) => a - b));
		expect(header("intelligence")).toContain("bg-primary/10");
		expect(header("pro")).not.toContain("bg-primary/10");
		expect(header("intelligence")).toContain("Recommended");
		expect(header("intelligence")).toContain(
			"An always-on product investigator"
		);
		for (const plan of normalizePlans(RAW_PLANS)) {
			expect(plan.description).toBeTruthy();
			expect(header(plan.id)).toContain(plan.description ?? "");
		}
	});

	it("gives Scale upgrade reasons that investigation top-ups cannot buy", () => {
		const plans = normalizePlans(RAW_PLANS);
		const markup = renderToStaticMarkup(
			createElement(PlansComparisonTable, { plans })
		);
		const business = plans.find((plan) => plan.id === "intelligence");
		const scale = plans.find((plan) => plan.id === "intelligence_scale");
		if (!(business && scale)) {
			throw new Error("Missing Intelligence plans");
		}
		const perInvestigation = (plan: typeof business) =>
			plan.priceMonthly / (plan.includedInvestigationsMonthly ?? 1);
		expect(perInvestigation(business)).toBeLessThan(perInvestigation(scale));
		for (const row of ["SSO (SAML/OIDC)", "Audit logs", "Guided onboarding"]) {
			const cells = markup.split(row)[1]?.split("</tr>")[0] ?? "";
			expect(cells.indexOf("Included")).toBeGreaterThan(-1);
			expect(cells.split("Included").length - 1).toBe(2);
		}
	});

	it("renders table price and investigation allowance from the supplied plan terms", () => {
		const plans = normalizePlans(RAW_PLANS).map((plan) =>
			plan.id === "intelligence"
				? {
						...plan,
						priceMonthly: 123,
						includedInvestigationsMonthly: 42,
						investigationPrice: 0.5,
					}
				: plan
		);
		const markup = renderToStaticMarkup(
			createElement(PlansComparisonTable, { plans })
		);
		expect(markup).toContain("$123");
		expect(markup).toContain(">42</td>");
		expect(markup).toContain("$0.50 per extra");
		expect(markup).not.toContain(">100</td>");
	});
	it("does not invent chat inclusion or a price for grant-only investigation terms", () => {
		const plans = normalizePlans(RAW_PLANS)
			.filter(
				(plan) => plan.id === "intelligence" || plan.id === "intelligence_scale"
			)
			.map((plan) => ({
				...plan,
				chatIncluded: false,
				investigationPrice: null,
			}));
		const markup = renderToStaticMarkup(
			createElement(PlansComparisonTable, { plans })
		);
		expect(markup).toContain(">100</td>");
		expect(markup).toContain(">250</td>");
		expect(markup).not.toContain("Databunny chat included");
		expect(markup).not.toContain("per extra");
		expect(markup).not.toContain("$null");
		expect(markup).toContain('href="#event-rates"');
	});
});
