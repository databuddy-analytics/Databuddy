import { describe, expect, it } from "bun:test";
import dayjs from "dayjs";
import {
	detectSignals,
	remeasureMetricSignal,
	wowWindow,
	type QueryFn,
} from "./detection";
import { prepareInvestigation } from "./investigation";
import { eligibleSignalsForInvestigation } from "./observations";

const params = {
	websiteId: "synthetic-receipts",
	timezone: "UTC",
	lookbackDays: 7,
};
const today = dayjs("2026-09-07T12:00:00Z");
const windows = wowWindow(today, 7);
const whole = {
	currency: "USD",
	total_revenue: 40_000,
	total_transactions: 400,
	refund_amount: 0,
	refund_count: 0,
	attributed_revenue: 40_000,
};
const receipt = (
	name: string,
	revenue: number,
	overrides: Record<string, unknown> = {}
) => ({
	product_id: null,
	name,
	provider: "stripe",
	currency: "USD",
	revenue,
	transactions: revenue / 100,
	customers: revenue / 100,
	percentage: revenue / 400,
	...overrides,
});
const before = [receipt("Team", 30_000), receipt("Solo", 10_000)];
const after = [receipt("Team", 15_000), receipt("Solo", 25_000)];

function queries(
	current: Record<string, unknown>[] = after,
	previous: Record<string, unknown>[] = before,
	currentWhole: Record<string, unknown>[] = [whole],
	previousWhole: Record<string, unknown>[] = [whole]
) {
	const calls: Parameters<QueryFn>[0][] = [];
	const query: QueryFn = async (request) => {
		calls.push(request);
		const isCurrent = request.from === windows.currentFrom;
		const selected = (isCurrent ? current : previous).filter(
			(row) =>
				request.filters?.every((filter) => {
					const actual =
						filter.field === "product_id"
							? (row.product_id ?? "")
							: filter.field === "product_name"
								? row.name
								: row[filter.field];
					return actual === filter.value;
				}) ?? true
		);
		if (request.type === "revenue_by_product") return selected;
		if (request.type !== "revenue_overview") return [];
		if (request.filters?.some((filter) => filter.field === "product_name")) {
			return selected.map((row) => ({
				currency: row.currency,
				total_revenue: row.revenue,
				total_transactions: row.transactions,
			}));
		}
		return (isCurrent ? currentWhole : previousWhole).filter(
			(row) =>
				request.filters?.every(
					(filter) => row[filter.field] === filter.value
				) ?? true
		);
	};
	return { calls, query };
}
async function signals(...args: Parameters<typeof queries>) {
	const mock = queries(...args);
	const detected = await detectSignals(params, mock.query, today);
	return {
		...mock,
		detected,
		descriptions: detected.filter(
			(signal) => signal.metric === "product_revenue"
		),
	};
}

describe("native unidentified payment-description discovery", () => {
	it("selects the hidden receipt decline and stays quiet on the entire identical next detector run", async () => {
		const { detected, descriptions, calls, query } = await signals();
		expect(descriptions.map((signal) => signal.subjectKey)).toEqual([
			"product_revenue:USD:stripe:product_name:Team",
		]);
		expect(detected.some((signal) => signal.metric === "revenue")).toBe(false);
		expect(
			calls
				.filter((call) => call.type === "revenue_by_product")
				.map((call) => call.limit)
		).toEqual([20, 20]);
		const [team] = descriptions;
		expect(team).toMatchObject({
			current: 15000,
			baseline: 30000,
			entityId: "Team",
		});
		const prepared = prepareInvestigation(team, 7);
		expect(prepared.evidence.join(" ")).toContain(
			"Whole-currency gross: 40000 → 40000"
		);
		expect(prepared.evidence.join(" ")).toContain(
			"Remaining gross: 10000 → 25000"
		);
		expect(prepared.investigationObjective).toContain(
			"payment descriptions, not verified catalog products"
		);
		expect(
			await remeasureMetricSignal(params, prepared.signal, query, today)
		).toMatchObject({
			subjectKey: team.subjectKey,
			current: 15000,
			baseline: 30000,
		});
		expect(
			calls
				.slice(-4)
				.filter((call) => call.type === "revenue_by_product")
				.map((call) => call.filters)
		).toEqual(
			Array(2).fill([
				{ field: "currency", op: "eq", value: "USD" },
				{ field: "provider", op: "eq", value: "stripe" },
				{ field: "product_name", op: "eq", value: "Team" },
				{ field: "product_id", op: "eq", value: "" },
			])
		);
		const observations = new Map([
			[
				prepared.signal.signalKey,
				{
					signal: prepared.signal,
					recheckAt: new Date("2026-10-07T12:00:00Z"),
					outcome: {
						title: "Team-described receipts fell",
						summary: "Other receipts offset the change.",
						evidence: [],
						rootCause: null,
						next: {
							type: "resolve" as const,
							reason: "The cause is unmeasured.",
						},
					},
				},
			],
		]);
		expect(
			eligibleSignalsForInvestigation(
				(await signals()).detected,
				observations,
				today.toDate()
			)
		).toEqual([]);
		expect(
			(await signals([...after].reverse(), [...before].reverse())).descriptions
		).toEqual(descriptions);
	});
	it("keeps renamed and missing labels unknown instead of substituting zero", async () => {
		const [team] = (await signals()).descriptions;
		for (const current of [
			[after[1]],
			[receipt("Team Plus", 15000), after[1]],
		]) {
			expect(
				(await signals(current)).descriptions.some(
					(signal) => signal.entityId === "Team"
				)
			).toBe(false);
			expect(
				await remeasureMetricSignal(
					params,
					prepareInvestigation(team, 7).signal,
					queries(current).query,
					today
				)
			).toBeNull();
		}
		const measured = await signals([
			receipt("Team", 0),
			receipt("Solo", 40000),
		]);
		expect(measured.descriptions[0].current).toBe(0);
	});
	it("does not mix the same label from identified receipts, another provider or another currency", async () => {
		const other = [
			receipt("Team", 40000, { product_id: "identified-team" }),
			receipt("Team", 10000, { provider: "paddle" }),
			receipt("Team", 10000, { currency: "EUR" }),
		];
		const totals = [
			{ ...whole, total_revenue: 90000, total_transactions: 900 },
			{
				...whole,
				currency: "EUR",
				total_revenue: 10000,
				total_transactions: 100,
			},
		];
		const { descriptions, query } = await signals(
			[...after, ...other],
			[...before, ...other],
			totals,
			totals
		);
		expect(descriptions).toHaveLength(1);
		expect(descriptions[0]).toMatchObject({
			entityId: "Team",
			current: 15000,
			baseline: 30000,
		});
		expect(
			await remeasureMetricSignal(
				params,
				prepareInvestigation(descriptions[0], 7).signal,
				query,
				today
			)
		).toMatchObject({ current: 15000, baseline: 30000 });
	});
	it("does not fabricate label meaning or accept invalid, ambiguous and unidentified source fields", async () => {
		for (const override of [
			{ product_id: "catalog-team" },
			{ product_id: undefined },
			{ name: "Unknown" },
			{ name: " " },
			{ revenue: null },
			{ revenue: -1 },
			{ transactions: -1 },
			{ currency: "usd" },
		]) {
			expect(
				(await signals([receipt("Team", 15000, override)], [before[0]]))
					.descriptions
			).toEqual([]);
		}
		expect(
			(
				await signals(
					[receipt("Team", 10000), receipt("Team", 5000)],
					[before[0]]
				)
			).descriptions
		).toEqual([]);
		expect(
			(
				await signals(
					[receipt("Team", 60000), receipt("Solo", 20000)],
					before,
					[{ ...whole, total_revenue: 80000, total_transactions: 800 }]
				)
			).descriptions
		).toEqual([]);
	});
	it("preserves full labels with delimiters across the bounded subject key and exact recheck", async () => {
		const label = `Team:/ ${"long".repeat(70)}`;
		const { descriptions, query } = await signals(
			[receipt(label, 15000)],
			[receipt(label, 30000)]
		);
		const prepared = prepareInvestigation(descriptions[0], 7);
		expect(prepared.signal.signalKey.length).toBeLessThanOrEqual(160);
		expect(prepared.signal.entity.id).toBe(label);
		expect(
			await remeasureMetricSignal(params, prepared.signal, query, today)
		).toMatchObject({ entityId: label });
	});
});
