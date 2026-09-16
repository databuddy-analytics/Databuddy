import { describe, expect, test } from "bun:test";
import type { Item } from "autumn-js";
import { renderToStaticMarkup } from "react-dom/server";
import {
	getInvestigationTerms,
	PlanComparison,
	PricingFeatures,
	PricingPlanPrice,
} from "./pricing-table";

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

describe("native plan subscription price", () => {
	test("renders the configured Hobby price without an invented first-month offer", () => {
		const markup = renderToStaticMarkup(
			<PricingPlanPrice
				plan={{
					id: "hobby",
					autoEnable: false,
					price: { amount: 9.99, interval: "month", intervalCount: 1 },
				}}
			/>
		);
		expect(markup).toContain(">$9.99</span>");
		expect(markup).toContain("/ month</p>");
		expect(markup).not.toContain(">$2</span>");
		expect(markup).not.toContain("first month");
		expect(markup).not.toContain("then ");
	});
});

describe("native plan investigation disclosures", () => {
	test("keeps short completion terms only for included, unlimited, or priced investigations", () => {
		const marker: Item = {
			...monthlyInvestigations,
			included: 0,
			reset: { interval: "one_off" },
			price: null,
		};
		expect(getInvestigationTerms([marker])).toBeUndefined();
		expect(getInvestigationTerms([events, chat])).toBeUndefined();
		for (const item of [
			{ ...marker, included: 100 },
			{ ...marker, unlimited: true },
			{ ...marker, price: monthlyInvestigations.price },
		]) {
			expect(getInvestigationTerms([item])).toBe(
				"Only completed investigations count. Clarifications and repair checks are included."
			);
		}
	});
	test("renders the real monthly allowance and usage price instead of stale provider copy", () => {
		const markup = render([monthlyInvestigations]);
		expect(markup).toContain("100 investigations / month");
		expect(markup).toContain("$1 per extra investigation");
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
			expect(markup).not.toContain("agent credits");
			expect(markup).not.toContain("1,500 AI credits / month for chat");
			expect(markup).not.toContain("2M events included / month");
		}
	});

	test("moves detailed capabilities and native credit terms into the comparison", () => {
		const plan = {
			id: "intelligence",
			name: "Business",
			items: [events, chat],
		};
		const cards = render(plan.items);
		expect(cards).not.toContain("Automatic Investigations");
		expect(cards).not.toContain("credits");
		const markup = renderToStaticMarkup(<PlanComparison plans={[plan]} />);
		expect(markup).toContain("AI credits");
		expect(markup).toContain("1,500 AI credits / month");
		const automaticRow = markup
			.split("Automatic Investigations</th>")[1]
			?.split("</tr>")[0];
		expect(automaticRow).toContain("Included");
		expect(automaticRow).not.toContain("Unlimited");
		expect(markup).toContain("Unlimited");
	});

	test("hides zero unpriced markers without inventing access or a purchase offer", () => {
		const marker = {
			...monthlyInvestigations,
			included: 0,
			reset: { interval: "one_off" },
			price: null,
		} satisfies Item;
		for (const id of ["hobby", "pro", "intelligence"]) {
			const markup = render([marker], id);
			expect(markup).not.toContain("investigations");
			expect(markup).not.toContain("$1");
			expect(markup).not.toContain("prepaid");
		}
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
		expect(markup).toContain("$1.25 per 5 extra investigations · prepaid");
		expect(markup).not.toContain("$1 per extra investigation");
	});

	test("combines separate allowance and priced items without losing either contract", () => {
		const markup = render([
			{ ...monthlyInvestigations, included: 0, reset: null },
			{ ...monthlyInvestigations, price: null },
		]);
		expect(markup.split("100 investigations / month")).toHaveLength(2);
		expect(markup).toContain("$1 per extra investigation");
		expect(markup).not.toContain(">0 investigations");
	});

	test("shows a real pay-as-you-go offer without a zero-allowance bullet", () => {
		const markup = render([{ ...monthlyInvestigations, included: 0 }]);
		expect(markup).toContain(">Investigations</span>");
		expect(markup).not.toContain("0 investigations");
		expect(markup).toContain("$1 per extra investigation");
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
		expect(markup).not.toContain("credits");
		expect(markup).not.toContain("Databunny chat included");
		expect(markup).not.toContain("additional investigation");
		expect(markup).not.toContain("investigations / month");
	});
});

describe("native pricing edge cases", () => {
	test("preserves custom zero subscription price and period", () => {
		const markup = renderToStaticMarkup(
			<PricingPlanPrice
				plan={{
					id: "pro",
					autoEnable: false,
					price: { amount: 0, interval: "month", intervalCount: 3 },
				}}
			/>
		);
		expect(markup).toContain(">$0</span>");
		expect(markup).toContain("/ 3 months");
		expect(markup).not.toContain("$49.99");
	});
	test("preserves an unpriced investigation grant and a custom zero extra rate", () => {
		const unpriced = render([{ ...monthlyInvestigations, price: null }]);
		expect(unpriced).toContain("100 investigations / month");
		expect(unpriced).not.toContain("$");
		expect(unpriced).not.toContain("prepaid");
		const zero = render([
			{
				...monthlyInvestigations,
				price: {
					...monthlyInvestigations.price,
					amount: 0,
					billingMethod: "usage_based",
					billingUnits: 1,
					interval: "month",
					maxPurchase: null,
				},
			},
		]);
		expect(zero).toContain("$0 per extra investigation");
		expect(zero).not.toContain("$1");
	});
	test("does not enable investigations on a plan without application access", () => {
		expect(render([monthlyInvestigations], "pro")).not.toContain(
			"investigations"
		);
	});
	test("keeps tiny native flat event prices readable without losing billing units", () => {
		for (const [amount, billingUnits] of [
			[0.000_03, 1],
			[0.03, 1000],
		]) {
			const markup = render([
				{
					...events,
					price: {
						amount,
						billingUnits,
						billingMethod: "usage_based",
						interval: "month",
						maxPurchase: null,
					},
				},
			]);
			expect(markup).toContain("Extra events: $0.03 per 1,000");
			expect(markup).not.toContain("$0 per");
		}
	});
});
