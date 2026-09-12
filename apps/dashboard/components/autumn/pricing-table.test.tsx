import { describe, expect, test } from "bun:test";
import type { Item } from "autumn-js";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingFeatures } from "./pricing-table";

const monthlyInvestigations: Item = {
	featureId: "investigation_runs",
	included: 100,
	unlimited: false,
	reset: { interval: "month" },
	price: {
		amount: 1,
		billingMethod: "usage_based",
		billingUnits: 1,
		interval: "month",
		maxPurchase: null,
	},
	display: {
		primaryText: "1,500 investigation credits",
		secondaryText: "Stale provider description",
	},
};

const events: Item = {
	featureId: "events",
	included: 2_000_000,
	unlimited: false,
	reset: { interval: "month" },
	price: null,
	display: { primaryText: "2,000,000 events", secondaryText: "per month" },
};

const chat: Item = {
	featureId: "agent_credits",
	included: 1500,
	unlimited: false,
	reset: { interval: "month" },
	price: null,
	display: { primaryText: "1,500 agent credits", secondaryText: "per month" },
};

function render(items: Item[], id = "intelligence") {
	return renderToStaticMarkup(<PricingFeatures plan={{ id, items }} />);
}

describe("native plan investigation disclosures", () => {
	test("renders the real monthly allowance and usage price instead of stale provider copy", () => {
		const markup = render([monthlyInvestigations]);
		expect(markup).toContain("100 investigations / month");
		expect(markup).toContain(
			"$1 per additional investigation · billed by usage"
		);
		expect(markup).not.toContain("investigation credits");
		expect(markup).not.toContain("Stale provider description");
	});

	test("keeps every native item regardless of provider order, without hardcoded Business duplicates", () => {
		for (const items of [
			[monthlyInvestigations, events, chat],
			[events, chat, monthlyInvestigations],
			[chat, monthlyInvestigations, events],
		]) {
			const markup = render(items);
			expect(markup.split("100 investigations / month")).toHaveLength(2);
			expect(markup.split("2,000,000 events")).toHaveLength(2);
			expect(markup.split("1,500 agent credits")).toHaveLength(2);
			expect(markup).not.toContain("1,500 AI credits / month for chat");
			expect(markup).not.toContain("2M events included / month");
		}
	});

	test("labels scheduling as Enabled while other unlimited capabilities remain unchanged", () => {
		const markup = render([monthlyInvestigations]);
		const automaticRow = markup
			.split("Automatic Investigations</span>")[1]
			?.split("</li>")[0];
		expect(automaticRow).toContain("Enabled");
		expect(automaticRow).not.toContain("Unlimited");
		expect(markup).toContain("Unlimited");
	});

	test("shows a zero one-off entitlement without inventing a monthly allowance", () => {
		const markup = render([
			{
				...monthlyInvestigations,
				included: 0,
				reset: { interval: "one_off" },
				price: null,
			},
		]);
		expect(markup).toContain("0 investigations included");
		expect(markup).toContain("$1 per additional investigation · prepaid");
		expect(markup).not.toContain("investigations / month");
	});

	test("reads prepaid price and billing units from the native price item", () => {
		const markup = render([
			{
				...monthlyInvestigations,
				price: {
					amount: 1.25,
					billingMethod: "prepaid",
					billingUnits: 5,
					interval: "one_off",
					maxPurchase: 1000,
				},
			},
		]);
		expect(markup).toContain("$1.25 per 5 additional investigations · prepaid");
		expect(markup).not.toContain("$1 per additional investigation");
	});

	test("combines separate allowance and priced items without losing either contract", () => {
		const markup = render([
			{ ...monthlyInvestigations, included: 0, reset: null },
			{ ...monthlyInvestigations, price: null },
		]);
		expect(markup.split("100 investigations / month")).toHaveLength(2);
		expect(markup).toContain(
			"$1 per additional investigation · billed by usage"
		);
		expect(markup).not.toContain(">0 investigations");
	});

	test("preserves the monthly reset on a zero allowance", () => {
		const markup = render([{ ...monthlyInvestigations, included: 0 }]);
		expect(markup).toContain("0 investigations / month");
		expect(markup).toContain(
			"$1 per additional investigation · billed by usage"
		);
	});

	test("does not turn a multi-month grant into the same monthly allowance", () => {
		const markup = render([
			{
				...monthlyInvestigations,
				reset: { interval: "month", intervalCount: 3 },
			},
		]);
		expect(markup).toContain("100 investigations / 3 months");
		expect(markup).not.toContain("100 investigations / month");
	});

	test("does not invent an investigation grant for a legacy plan", () => {
		const markup = render([events, chat], "pro");
		expect(markup).toContain("1,500 agent credits");
		expect(markup).not.toContain("additional investigation");
		expect(markup).not.toContain("investigations / month");
	});
});
