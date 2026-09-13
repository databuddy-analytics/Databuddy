import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InvestigationBalanceDetails } from "../app/(main)/billing/components/investigation-topup-card";
import { summarizeInvestigationBalance } from "./investigation-usage";

type Balance = NonNullable<Parameters<typeof summarizeInvestigationBalance>[0]>;
type Breakdown = NonNullable<Balance["breakdown"]>[number];

const resetsAt = Date.parse("2026-10-01T00:00:00Z");

function monthly(included: number, usage: number): Breakdown {
	return {
		id: "synthetic-monthly",
		planId: "synthetic-plan",
		includedGrant: included,
		prepaidGrant: 0,
		remaining: included - usage,
		usage,
		unlimited: false,
		reset: { interval: "month", resetsAt },
		price: {
			amount: 1,
			billingUnits: 1,
			billingMethod: "usage_based",
			maxPurchase: null,
		},
		expiresAt: null,
	};
}

const purchased: Breakdown = {
	id: "synthetic-purchased",
	planId: "synthetic-topup",
	includedGrant: 0,
	prepaidGrant: 20,
	remaining: 17,
	usage: 3,
	unlimited: false,
	reset: null,
	price: {
		amount: 1,
		billingUnits: 1,
		billingMethod: "prepaid",
		maxPurchase: 1000,
	},
	expiresAt: null,
};

function balance(breakdown: Breakdown[], overageAllowed = true): Balance {
	return {
		featureId: "investigation_runs",
		granted: breakdown.reduce(
			(total, entry) => total + entry.includedGrant + entry.prepaidGrant,
			0
		),
		remaining: breakdown.reduce((total, entry) => total + entry.remaining, 0),
		usage: breakdown.reduce((total, entry) => total + entry.usage, 0),
		unlimited: false,
		overageAllowed,
		maxPurchase: null,
		nextResetAt: resetsAt,
		breakdown,
	};
}

describe("native investigation balances", () => {
	test.each([
		100, 500,
	])("keeps %i monthly units usable at and after exhaustion when Autumn allows overage", (included) => {
		const exhausted = summarizeInvestigationBalance(
			balance([monthly(included, included)])
		);
		expect(exhausted).toMatchObject({
			canUse: true,
			payAsYouGo: true,
			overage: 0,
		});
		expect(exhausted.monthly).toEqual([
			{
				id: "synthetic-monthly",
				included,
				used: included,
				remaining: 0,
				resetsAt,
			},
		]);
		const overage = summarizeInvestigationBalance(
			balance([monthly(included, included + 1)])
		);
		expect(overage).toMatchObject({
			canUse: true,
			payAsYouGo: true,
			overage: 1,
		});
		expect(overage.monthly[0]).toMatchObject({
			included,
			used: included,
			remaining: 0,
		});
	});

	test("respects Autumn's overage denial while any full available unit remains usable", () => {
		expect(
			summarizeInvestigationBalance(balance([monthly(100, 99)], false)).canUse
		).toBe(true);
		expect(
			summarizeInvestigationBalance(balance([monthly(100, 100)], false))
		).toMatchObject({ canUse: false, overageAllowed: false, payAsYouGo: true });
		expect(
			summarizeInvestigationBalance(balance([monthly(100, 101)], false)).canUse
		).toBe(false);
	});

	test("keeps purchased units separate from monthly usage and restores only the monthly allowance", () => {
		const before = summarizeInvestigationBalance(
			balance([monthly(100, 100), purchased])
		);
		const after = summarizeInvestigationBalance(
			balance([
				{
					...monthly(100, 0),
					reset: {
						interval: "month",
						resetsAt: Date.parse("2026-11-01T00:00:00Z"),
					},
				},
				purchased,
			])
		);
		expect(before.monthly[0]).toMatchObject({
			included: 100,
			used: 100,
			remaining: 0,
		});
		expect(after.monthly[0]).toMatchObject({
			included: 100,
			used: 0,
			remaining: 100,
		});
		expect(before.prepaid).toEqual([
			{ id: "synthetic-purchased", remaining: 17, expiresAt: null },
		]);
		expect(after.prepaid).toEqual(before.prepaid);
		expect(before.overage).toBe(0);
		expect(after.overage).toBe(0);
	});

	test("does not convert prepaid usage or an unpaid prepaid deficit into invoiced overage", () => {
		const prepaid = summarizeInvestigationBalance(balance([purchased], false));
		expect(prepaid).toMatchObject({
			canUse: true,
			payAsYouGo: false,
			overage: 0,
			monthly: [],
		});
		const exhausted = summarizeInvestigationBalance(
			balance([{ ...purchased, remaining: -1, usage: 21 }], false)
		);
		expect(exhausted).toMatchObject({
			canUse: false,
			payAsYouGo: false,
			overage: 0,
		});
	});

	test("uses aggregate provider authority without inventing missing allowance details", () => {
		const aggregate = { ...balance([monthly(100, 101)]), breakdown: undefined };
		expect(summarizeInvestigationBalance(aggregate)).toMatchObject({
			canUse: true,
			payAsYouGo: true,
			overage: 1,
			monthly: [],
			prepaid: [],
		});
		expect(summarizeInvestigationBalance(null).canUse).toBe(false);
		expect(
			summarizeInvestigationBalance({
				...aggregate,
				unlimited: true,
				overageAllowed: false,
			}).canUse
		).toBe(true);
	});

	test("requires a whole fixed-price unit if overage is unavailable", () => {
		expect(
			summarizeInvestigationBalance({ ...balance([], false), remaining: 0.5 })
				.canUse
		).toBe(false);
	});

	test("renders separate monthly, purchased and additional usage with native reset and expiry dates", () => {
		const markup = renderToStaticMarkup(
			<InvestigationBalanceDetails
				usage={summarizeInvestigationBalance(
					balance([monthly(100, 101), purchased])
				)}
			/>
		);
		expect(markup).toContain("Monthly allowance");
		expect(markup).toContain("100 included · 100 used · 0 remaining");
		expect(markup).toContain("Resets Oct 1, 2026");
		expect(markup).toContain("Purchased balance");
		expect(markup).toContain("17 remaining · Does not expire");
		expect(markup).toContain("Estimated additional usage");
		expect(markup).toContain("1 additional investigation this billing period");
	});

	test("does not label a native expiring purchase as nonexpiring", () => {
		const markup = renderToStaticMarkup(
			<InvestigationBalanceDetails
				usage={summarizeInvestigationBalance(
					balance([{ ...purchased, expiresAt: resetsAt }], false)
				)}
			/>
		);
		expect(markup).toContain("Expires Oct 1, 2026");
		expect(markup).not.toContain("Does not expire");
	});
});
