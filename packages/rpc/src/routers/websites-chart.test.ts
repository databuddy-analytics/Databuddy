import { describe, expect, it } from "bun:test";
import { type ChartDataRow, calculateTrend, processChartData } from "./websites-chart";

function makeRows(
	websiteId: string,
	days: { date: string; value: number; hasData: boolean }[]
): ChartDataRow[] {
	return days.map((d) => ({
		websiteId,
		date: d.date,
		value: d.value,
		hasAnyData: d.hasData ? 1 : 0,
	}));
}

const DATES_7D = [
	"2026-05-12",
	"2026-05-13",
	"2026-05-14",
	"2026-05-15",
	"2026-05-16",
	"2026-05-17",
	"2026-05-18",
];

function emptyRows(websiteId: string) {
	return makeRows(
		websiteId,
		DATES_7D.map((d) => ({ date: d, value: 0, hasData: false }))
	);
}

function activeRows(websiteId: string) {
	return makeRows(
		websiteId,
		DATES_7D.map((d, i) => ({ date: d, value: (i + 1) * 10, hasData: true }))
	);
}

describe("processChartData", () => {
	it("returns hasAnyData=true and hasHistoricalData=true for a website with recent pageviews", () => {
		const result = processChartData(
			["site-a"],
			activeRows("site-a"),
			[{ websiteId: "site-a" }]
		);

		expect(result["site-a"].hasAnyData).toBe(true);
		expect(result["site-a"].hasHistoricalData).toBe(true);
		expect(result["site-a"].totalViews).toBeGreaterThan(0);
		expect(result["site-a"].data).toHaveLength(7);
	});

	it("returns hasAnyData=false and hasHistoricalData=true for a website with only historical data", () => {
		const result = processChartData(
			["site-b"],
			emptyRows("site-b"),
			[{ websiteId: "site-b" }]
		);

		expect(result["site-b"].hasAnyData).toBe(false);
		expect(result["site-b"].hasHistoricalData).toBe(true);
		expect(result["site-b"].totalViews).toBe(0);
	});

	it("returns hasAnyData=false and hasHistoricalData=false for a website that never had data", () => {
		const result = processChartData(
			["site-c"],
			emptyRows("site-c"),
			[]
		);

		expect(result["site-c"].hasAnyData).toBe(false);
		expect(result["site-c"].hasHistoricalData).toBe(false);
		expect(result["site-c"].totalViews).toBe(0);
	});

	it("handles multiple websites in different states", () => {
		const result = processChartData(
			["active", "dormant", "new"],
			[...activeRows("active"), ...emptyRows("dormant"), ...emptyRows("new")],
			[{ websiteId: "active" }, { websiteId: "dormant" }]
		);

		expect(result["active"].hasAnyData).toBe(true);
		expect(result["active"].hasHistoricalData).toBe(true);

		expect(result["dormant"].hasAnyData).toBe(false);
		expect(result["dormant"].hasHistoricalData).toBe(true);

		expect(result["new"].hasAnyData).toBe(false);
		expect(result["new"].hasHistoricalData).toBe(false);
	});

	it("returns an empty record when no website IDs are provided", () => {
		const result = processChartData([], [], []);
		expect(result).toEqual({});
	});

	it("sets hasAnyData=true when even a single day has data", () => {
		const rows = makeRows(
			"site-d",
			DATES_7D.map((d, i) => ({
				date: d,
				value: i === 6 ? 1 : 0,
				hasData: i === 6,
			}))
		);

		const result = processChartData(
			["site-d"],
			rows,
			[{ websiteId: "site-d" }]
		);

		expect(result["site-d"].hasAnyData).toBe(true);
		expect(result["site-d"].totalViews).toBe(1);
	});

	it("computes totalViews as the sum of all data points", () => {
		const rows = makeRows("site-e", [
			{ date: "2026-05-12", value: 100, hasData: true },
			{ date: "2026-05-13", value: 200, hasData: true },
			{ date: "2026-05-14", value: 50, hasData: true },
		]);

		const result = processChartData(
			["site-e"],
			rows,
			[{ websiteId: "site-e" }]
		);

		expect(result["site-e"].totalViews).toBe(350);
	});

	it("ignores chart rows for unknown website IDs", () => {
		const result = processChartData(
			["site-f"],
			[...emptyRows("site-f"), ...activeRows("unknown-site")],
			[]
		);

		expect(Object.keys(result)).toEqual(["site-f"]);
		expect(result["site-f"].totalViews).toBe(0);
	});
});

describe("calculateTrend", () => {
	it("returns null for fewer than 4 data points", () => {
		expect(calculateTrend([])).toBeNull();
		expect(
			calculateTrend([
				{ date: "2026-05-16", value: 10 },
				{ date: "2026-05-17", value: 20 },
				{ date: "2026-05-18", value: 30 },
			])
		).toBeNull();
	});

	it("returns up trend when second half average is significantly higher", () => {
		const result = calculateTrend([
			{ date: "2026-05-12", value: 10 },
			{ date: "2026-05-13", value: 10 },
			{ date: "2026-05-14", value: 10 },
			{ date: "2026-05-15", value: 10 },
			{ date: "2026-05-16", value: 50 },
			{ date: "2026-05-17", value: 50 },
			{ date: "2026-05-18", value: 50 },
		]);

		expect(result).not.toBeNull();
		expect(result!.type).toBe("up");
		expect(result!.value).toBeGreaterThan(0);
	});

	it("returns down trend when second half average is significantly lower", () => {
		const result = calculateTrend([
			{ date: "2026-05-12", value: 50 },
			{ date: "2026-05-13", value: 50 },
			{ date: "2026-05-14", value: 50 },
			{ date: "2026-05-15", value: 50 },
			{ date: "2026-05-16", value: 10 },
			{ date: "2026-05-17", value: 10 },
			{ date: "2026-05-18", value: 10 },
		]);

		expect(result).not.toBeNull();
		expect(result!.type).toBe("down");
		expect(result!.value).toBeGreaterThan(0);
	});

	it("returns neutral trend when the change is within threshold", () => {
		const result = calculateTrend([
			{ date: "2026-05-12", value: 100 },
			{ date: "2026-05-13", value: 100 },
			{ date: "2026-05-14", value: 100 },
			{ date: "2026-05-15", value: 100 },
			{ date: "2026-05-16", value: 101 },
			{ date: "2026-05-17", value: 101 },
			{ date: "2026-05-18", value: 101 },
		]);

		expect(result).not.toBeNull();
		expect(result!.type).toBe("neutral");
	});

	it("returns up with value 100 when previous average is zero but current has traffic", () => {
		const result = calculateTrend([
			{ date: "2026-05-12", value: 0 },
			{ date: "2026-05-13", value: 0 },
			{ date: "2026-05-14", value: 0 },
			{ date: "2026-05-15", value: 0 },
			{ date: "2026-05-16", value: 10 },
			{ date: "2026-05-17", value: 10 },
			{ date: "2026-05-18", value: 10 },
		]);

		expect(result).toEqual({ type: "up", value: 100 });
	});

	it("returns neutral when both halves are zero", () => {
		const result = calculateTrend([
			{ date: "2026-05-12", value: 0 },
			{ date: "2026-05-13", value: 0 },
			{ date: "2026-05-14", value: 0 },
			{ date: "2026-05-15", value: 0 },
			{ date: "2026-05-16", value: 0 },
			{ date: "2026-05-17", value: 0 },
			{ date: "2026-05-18", value: 0 },
		]);

		expect(result).toEqual({ type: "neutral", value: 0 });
	});
});
