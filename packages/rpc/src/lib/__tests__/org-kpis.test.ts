import { describe, expect, test } from "bun:test";
import {
	aggregateKpiSeries,
	type DailyKpiRow,
} from "../org-kpis";

describe("aggregateKpiSeries", () => {
	test("returns zeros for empty input", () => {
		const result = aggregateKpiSeries([], {
			rangeDays: 7,
			metric: "visitors",
		});
		expect(result.current).toBe(0);
		expect(result.previous).toBe(0);
		expect(result.change).toBe(0);
		expect(result.sparkline).toHaveLength(7);
		expect(result.sparkline.every((p) => p.value === 0)).toBe(true);
	});

	test("sums visitors across websites per day", () => {
		const rows: DailyKpiRow[] = [
			{ date: "2026-04-01", website_id: "a", visitors: 100, sessions: 120, bounces: 40, errors: 2, lcp_p75_ms: 2000 },
			{ date: "2026-04-01", website_id: "b", visitors: 50,  sessions: 60,  bounces: 20, errors: 1, lcp_p75_ms: 2500 },
			{ date: "2026-04-02", website_id: "a", visitors: 200, sessions: 240, bounces: 80, errors: 4, lcp_p75_ms: 2100 },
		];

		const result = aggregateKpiSeries(rows, { rangeDays: 2, metric: "visitors" });

		expect(result.sparkline).toHaveLength(2);
		const byDate = Object.fromEntries(result.sparkline.map((p) => [p.date, p.value]));
		expect(byDate["2026-04-01"]).toBe(150);
		expect(byDate["2026-04-02"]).toBe(200);
	});

	test("bounce metric returns percent (bounces / sessions) not raw sum", () => {
		const rows: DailyKpiRow[] = [
			{ date: "2026-04-01", website_id: "a", visitors: 0, sessions: 100, bounces: 40, errors: 0, lcp_p75_ms: 0 },
			{ date: "2026-04-01", website_id: "b", visitors: 0, sessions: 100, bounces: 20, errors: 0, lcp_p75_ms: 0 },
		];
		const result = aggregateKpiSeries(rows, { rangeDays: 1, metric: "bounce" });
		expect(result.sparkline[0].value).toBeCloseTo(30, 1);
	});

	test("lcp metric returns visitor-weighted average within input range", () => {
		const rows: DailyKpiRow[] = [
			{ date: "2026-04-01", website_id: "a", visitors: 100, sessions: 0, bounces: 0, errors: 0, lcp_p75_ms: 1800 },
			{ date: "2026-04-01", website_id: "b", visitors: 100, sessions: 0, bounces: 0, errors: 0, lcp_p75_ms: 2600 },
		];
		const result = aggregateKpiSeries(rows, { rangeDays: 1, metric: "lcp" });
		expect(result.sparkline[0].value).toBeGreaterThanOrEqual(1800);
		expect(result.sparkline[0].value).toBeLessThanOrEqual(2600);
	});

	test("errors metric sums across websites per day", () => {
		const rows: DailyKpiRow[] = [
			{ date: "2026-04-01", website_id: "a", visitors: 0, sessions: 0, bounces: 0, errors: 5, lcp_p75_ms: 0 },
			{ date: "2026-04-01", website_id: "b", visitors: 0, sessions: 0, bounces: 0, errors: 3, lcp_p75_ms: 0 },
		];
		const result = aggregateKpiSeries(rows, { rangeDays: 1, metric: "errors" });
		expect(result.sparkline[0].value).toBe(8);
	});

	test("missing days are filled with zeros up to rangeDays", () => {
		const rows: DailyKpiRow[] = [
			{ date: "2026-04-03", website_id: "a", visitors: 100, sessions: 0, bounces: 0, errors: 0, lcp_p75_ms: 0 },
		];
		const result = aggregateKpiSeries(rows, { rangeDays: 5, metric: "visitors" });
		expect(result.sparkline).toHaveLength(5);
		expect(result.sparkline.filter((p) => p.value > 0)).toHaveLength(1);
		expect(result.sparkline.filter((p) => p.value === 0)).toHaveLength(4);
	});

	test("change is signed percent current vs previous window", () => {
		const rows: DailyKpiRow[] = [
			{ date: "2026-04-01", website_id: "a", visitors: 100, sessions: 0, bounces: 0, errors: 0, lcp_p75_ms: 0 },
			{ date: "2026-04-02", website_id: "a", visitors: 200, sessions: 0, bounces: 0, errors: 0, lcp_p75_ms: 0 },
		];
		const result = aggregateKpiSeries(rows, { rangeDays: 1, metric: "visitors" });
		expect(result.current).toBe(200);
		expect(result.previous).toBe(100);
		expect(result.change).toBeCloseTo(100, 0);
	});

	test("change is 0 when previous window is 0", () => {
		const rows: DailyKpiRow[] = [
			{ date: "2026-04-02", website_id: "a", visitors: 200, sessions: 0, bounces: 0, errors: 0, lcp_p75_ms: 0 },
		];
		const result = aggregateKpiSeries(rows, { rangeDays: 1, metric: "visitors" });
		expect(result.current).toBe(200);
		expect(result.previous).toBe(0);
		expect(result.change).toBe(0);
	});
});
