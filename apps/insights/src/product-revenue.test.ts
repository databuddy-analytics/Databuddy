import { describe, expect, it } from "bun:test";
import dayjs from "dayjs";
import { planCoveragePortfolio } from "./coverage-planner";
import {
	detectSignals,
	remeasureMetricSignal,
	wowWindow,
	type QueryFn,
} from "./detection";
import { prepareInvestigation } from "./investigation";
import { eligibleSignalsForInvestigation } from "./observations";

const params = {
	websiteId: "synthetic-products",
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
const product = (
	product_id: string,
	revenue: number,
	overrides: Record<string, unknown> = {}
) => ({
	product_id,
	name: product_id,
	provider: "stripe",
	currency: "USD",
	revenue,
	transactions: revenue / 100,
	customers: revenue / 100,
	percentage: revenue / 400,
	...overrides,
});
const before = [product("team", 30_000), product("solo", 10_000)];
const after = [product("team", 15_000), product("solo", 25_000)];

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
		if (request.type === "revenue_by_product")
			return isCurrent ? current : previous;
		if (request.type !== "revenue_overview") return [];
		const productId = request.filters?.find(
			(filter) => filter.field === "product_id"
		)?.value;
		const rows = productId
			? (isCurrent ? current : previous)
					.filter((row) => row.product_id === productId)
					.map((row) => ({
						...whole,
						currency: row.currency,
						provider: row.provider,
						total_revenue: row.revenue,
						total_transactions: row.transactions,
					}))
			: isCurrent
				? currentWhole
				: previousWhole;
		return rows.filter(
			(row) =>
				request.filters?.every(
					(filter) =>
						filter.field === "product_id" || row[filter.field] === filter.value
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
		products: detected.filter((signal) => signal.metric === "product_revenue"),
	};
}

describe("product revenue discovery without funnels", () => {
	it("finds opposing product shifts behind flat gross, selects the decline once, and remeasures the exact identity", async () => {
		const { detected, products, calls, query } = await signals();
		expect(products.map((signal) => signal.subjectKey).sort()).toEqual([
			"product_revenue:USD:stripe:solo",
			"product_revenue:USD:stripe:team",
		]);
		expect(detected.some((signal) => signal.metric === "revenue")).toBe(false);
		expect(
			calls
				.filter((call) => call.type === "revenue_by_product")
				.map((call) => call.limit)
		).toEqual([20, 20]);
		const selected = planCoveragePortfolio(products, { reason: "scheduled" });
		expect(selected).toHaveLength(1);
		const [team] = selected;
		expect(team).toMatchObject({
			current: 15_000,
			baseline: 30_000,
			deltaPercent: -50,
			entityId: "team",
		});
		const prepared = prepareInvestigation(team, 7);
		expect(prepared.signal.entity.id).toBe("team");
		expect(prepared.evidence.join(" ")).toContain(
			"Whole-currency gross: 40000 → 40000"
		);
		expect(prepared.evidence.join(" ")).toContain(
			"Remaining gross: 10000 → 25000"
		);
		expect(
			await remeasureMetricSignal(params, prepared.signal, query, today)
		).toMatchObject({
			subjectKey: team.subjectKey,
			current: 15_000,
			baseline: 30_000,
		});
		expect(
			calls
				.slice(-4)
				.filter((call) =>
					call.filters?.some((filter) => filter.field === "product_id")
				)
				.map((call) => call.filters)
		).toEqual(
			Array(2).fill([
				{ field: "currency", op: "eq", value: "USD" },
				{ field: "provider", op: "eq", value: "stripe" },
				{ field: "product_id", op: "eq", value: "team" },
			])
		);
		const observations = new Map([
			[
				prepared.signal.signalKey,
				{
					signal: prepared.signal,
					recheckAt: new Date("2026-10-07T12:00:00Z"),
					outcome: {
						title: "Team receipts fell",
						summary: "Solo receipts offset the change.",
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
			eligibleSignalsForInvestigation([team], observations, today.toDate())
		).toEqual([]);
	});

	it("does not infer zero when a product falls out of a truncated top table", async () => {
		const { products } = await signals([product("solo", 40_000)]);
		expect(products.some((signal) => signal.entityId === "team")).toBe(false);
		const [team] = (await signals()).products.filter(
			(signal) => signal.entityId === "team"
		);
		expect(
			await remeasureMetricSignal(
				params,
				prepareInvestigation(team, 7).signal,
				queries([product("solo", 40_000)]).query,
				today
			)
		).toBeNull();
	});

	it("accepts an explicit measured zero with a real product row and keeps a zero recheck", async () => {
		const { products, query } = await signals([
			product("team", 0),
			product("solo", 40_000),
		]);
		const team = products.find((signal) => signal.entityId === "team");
		expect(team?.current).toBe(0);
		if (!team) throw new Error("Expected team");
		expect(
			await remeasureMetricSignal(
				params,
				prepareInvestigation(team, 7).signal,
				query,
				today
			)
		).toMatchObject({ current: 0, baseline: 30_000 });
	});

	it("does not confuse a rename with an absent product or accept split duplicate IDs", async () => {
		expect(
			(
				await signals([
					product("team", 15_000, { name: "Team Plus" }),
					after[1],
				])
			).products.find((signal) => signal.entityId === "team")?.entityLabel
		).toBe("Team Plus");
		expect(
			(
				await signals([
					product("team", 10_000),
					product("team", 5_000, { name: "Team Plus" }),
					after[1],
				])
			).products.some((signal) => signal.entityId === "team")
		).toBe(false);
	});

	it("does not merge matching product IDs across currency or provider", async () => {
		const { products } = await signals(
			[
				...after,
				product("team", 15_000, { currency: "EUR" }),
				product("team", 30_000, { provider: "paddle" }),
			],
			[
				...before,
				product("team", 15_000, { currency: "EUR" }),
				product("team", 30_000, { provider: "paddle" }),
			],
			[
				{ ...whole, total_revenue: 70_000, total_transactions: 700 },
				{ ...whole, currency: "EUR" },
			],
			[
				{ ...whole, total_revenue: 70_000, total_transactions: 700 },
				{ ...whole, currency: "EUR" },
			]
		);
		expect(products.map((signal) => signal.subjectKey).sort()).toEqual([
			"product_revenue:USD:stripe:solo",
			"product_revenue:USD:stripe:team",
		]);
	});

	it("keeps proportional whole growth quiet and ignores null identities and invalid amounts", async () => {
		const growth = after.map((row, i) => ({
			...row,
			revenue: before[i].revenue * 2,
			transactions: before[i].transactions * 2,
		}));
		expect(
			(
				await signals(growth, before, [
					{ ...whole, total_revenue: 80_000, total_transactions: 800 },
				])
			).products
		).toEqual([]);
		for (const overrides of [
			{ product_id: null },
			{ revenue: null },
			{ revenue: -1 },
			{ transactions: -1 },
			{ currency: "usd" },
		]) {
			expect(
				(await signals([product("team", 15_000, overrides)], [before[0]]))
					.products
			).toEqual([]);
		}
	});

	it("preserves full long and delimiter-bearing product IDs through recheck", async () => {
		const id = `team:/ ${"long".repeat(70)}`;
		const { products, query } = await signals(
			[product(id, 15_000)],
			[product(id, 30_000)]
		);
		const prepared = prepareInvestigation(products[0], 7);
		expect(prepared.signal.signalKey.length).toBeLessThanOrEqual(160);
		expect(prepared.signal.entity.id).toBe(id);
		expect(
			await remeasureMetricSignal(params, prepared.signal, query, today)
		).toMatchObject({ entityId: id });
	});
});
