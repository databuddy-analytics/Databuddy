import { describe, expect, it } from "bun:test";
import dayjs from "dayjs";
import {
	type DetectSignalsParams,
	type QueryFn,
	adaptiveWowThreshold,
	assignSeverity,
	detectSignals,
	mad,
	median,
} from "./detection";

function makeDailyRows(
	values: {
		date: string;
		visitors: number;
		sessions: number;
		pageviews: number;
		bounce_rate: number;
		median_session_duration: number;
	}[]
) {
	return values.map((v) => ({
		date: v.date,
		visitors: v.visitors,
		sessions: v.sessions,
		pageviews: v.pageviews,
		bounce_rate: v.bounce_rate,
		median_session_duration: v.median_session_duration,
	}));
}

function generateStableDays(
	count: number,
	base: {
		visitors: number;
		sessions: number;
		pageviews: number;
		bounce_rate: number;
		median_session_duration: number;
	},
	startDate: dayjs.Dayjs
) {
	return Array.from({ length: count }, (_, i) => ({
		date: startDate.add(i, "day").format("YYYY-MM-DD"),
		visitors: base.visitors + (i % 3),
		sessions: base.sessions + (i % 3),
		pageviews: base.pageviews + (i % 3),
		bounce_rate: base.bounce_rate,
		median_session_duration: base.median_session_duration,
	}));
}

const BASE_PARAMS: DetectSignalsParams = {
	websiteId: "test-site",
	lookbackDays: 28,
	timezone: "UTC",
};

function createMockQueryFn(
	dailyRows: Record<string, unknown>[],
	summaryCurrentRow?: Record<string, unknown>,
	summaryPreviousRow?: Record<string, unknown>,
	extras?: Record<string, [Record<string, unknown>?, Record<string, unknown>?]>
): QueryFn {
	const callCounts = new Map<string, number>();
	return async (request: { type: string }) => {
		if (request.type === "events_by_date") {
			return dailyRows;
		}
		const count = (callCounts.get(request.type) ?? 0) + 1;
		callCounts.set(request.type, count);
		if (request.type === "summary_metrics") {
			return [
				count === 1 ? (summaryCurrentRow ?? {}) : (summaryPreviousRow ?? {}),
			];
		}
		const extra = extras?.[request.type];
		if (extra) {
			return [count === 1 ? (extra[0] ?? {}) : (extra[1] ?? {})];
		}
		return [];
	};
}

describe("median", () => {
	it("returns 0 for empty array", () => {
		expect(median([])).toBe(0);
	});

	it("returns the middle value for odd-length array", () => {
		expect(median([3, 1, 2])).toBe(2);
	});

	it("returns the average of two middle values for even-length array", () => {
		expect(median([1, 2, 3, 4])).toBe(2.5);
	});

	it("is not affected by outliers", () => {
		expect(median([100, 101, 102, 103, 500])).toBe(102);
	});
});

describe("mad", () => {
	it("returns 0 for fewer than 2 values", () => {
		expect(mad([])).toBe(0);
		expect(mad([5])).toBe(0);
	});

	it("computes median absolute deviation", () => {
		expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
	});
});

describe("assignSeverity", () => {
	it("assigns critical for z-score >= 3.5", () => {
		expect(assignSeverity(3.5, 10)).toBe("critical");
	});

	it("assigns critical for delta >= 60%", () => {
		expect(assignSeverity(1.0, 65)).toBe("critical");
	});

	it("assigns warning for z-score >= 3.0", () => {
		expect(assignSeverity(3.0, 10)).toBe("warning");
	});

	it("assigns warning for delta >= 50%", () => {
		expect(assignSeverity(1.0, 55)).toBe("warning");
	});

	it("assigns info for values at the floor", () => {
		expect(assignSeverity(2.5, 40)).toBe("info");
	});

	it("assigns info when z-score is undefined and delta is moderate", () => {
		expect(assignSeverity(undefined, 45)).toBe("info");
	});
});

describe("adaptiveWowThreshold", () => {
	it("returns the base threshold for short series", () => {
		expect(adaptiveWowThreshold([100, 110, 90], 40)).toBe(40);
	});

	it("returns the base threshold for a zero mean", () => {
		expect(adaptiveWowThreshold([0, 0, 0, 0, 0, 0, 0], 40)).toBe(40);
	});

	it("returns the base threshold for stable series", () => {
		expect(
			adaptiveWowThreshold([100, 102, 98, 101, 99, 100, 103, 97], 40)
		).toBe(40);
	});

	it("raises the threshold proportionally to volatility", () => {
		const volatile = Array.from({ length: 20 }, (_, i) =>
			i % 2 === 0 ? 40 : 200
		);
		const threshold = adaptiveWowThreshold(volatile, 40);
		expect(threshold).toBeGreaterThan(100);
	});
});

describe("detectSignals", () => {
	describe("z-score detection", () => {
		it("flags a spike on the latest day", async () => {
			const start = dayjs().subtract(27, "day");
			const normal = generateStableDays(27, {
				visitors: 100,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			}, start);

			const spikeDay = {
				date: start.add(27, "day").format("YYYY-MM-DD"),
				visitors: 350,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			};

			const rows = makeDailyRows([...normal, spikeDay]);
			const queryFn = createMockQueryFn(rows);

			const signals = await detectSignals(BASE_PARAMS, queryFn);

			const visitorSignal = signals.find(
				(s) => s.metric === "visitors" && s.method === "zscore"
			);
			expect(visitorSignal).toBeDefined();
			expect(visitorSignal!.direction).toBe("up");
			expect(visitorSignal!.current).toBe(350);
			expect(visitorSignal!.zScore).toBeDefined();
			expect(Math.abs(visitorSignal!.zScore!)).toBeGreaterThanOrEqual(2.5);
		});

		it("flags a drop on the latest day", async () => {
			const start = dayjs().subtract(27, "day");
			const normal = generateStableDays(27, {
				visitors: 200,
				sessions: 250,
				pageviews: 400,
				bounce_rate: 35,
				median_session_duration: 90,
			}, start);

			const dropDay = {
				date: start.add(27, "day").format("YYYY-MM-DD"),
				visitors: 30,
				sessions: 250,
				pageviews: 400,
				bounce_rate: 35,
				median_session_duration: 90,
			};

			const rows = makeDailyRows([...normal, dropDay]);
			const queryFn = createMockQueryFn(rows);

			const signals = await detectSignals(BASE_PARAMS, queryFn);

			const visitorSignal = signals.find(
				(s) => s.metric === "visitors" && s.method === "zscore"
			);
			expect(visitorSignal).toBeDefined();
			expect(visitorSignal!.direction).toBe("down");
		});

		it("ignores normal variation below threshold", async () => {
			const start = dayjs().subtract(27, "day");
			const stable = generateStableDays(14, {
				visitors: 100,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			}, start);

			const rows = makeDailyRows(stable);
			const queryFn = createMockQueryFn(rows);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const zscoreSignals = signals.filter((s) => s.method === "zscore");
			expect(zscoreSignals.length).toBe(0);
		});

		it("is not fooled by outlier days in the baseline", async () => {
			const start = dayjs().subtract(27, "day");
			const normal = generateStableDays(24, {
				visitors: 150,
				sessions: 170,
				pageviews: 300,
				bounce_rate: 40,
				median_session_duration: 60,
			}, start);

			normal[20].visitors = 450;
			normal[21].visitors = 400;
			normal[22].visitors = 380;

			const latestDay = {
				date: start.add(27, "day").format("YYYY-MM-DD"),
				visitors: 155,
				sessions: 170,
				pageviews: 300,
				bounce_rate: 40,
				median_session_duration: 60,
			};

			const rows = makeDailyRows([...normal, ...generateStableDays(3, {
				visitors: 150,
				sessions: 170,
				pageviews: 300,
				bounce_rate: 40,
				median_session_duration: 60,
			}, start.add(24, "day")), latestDay]);
			const queryFn = createMockQueryFn(rows);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const visitorSignal = signals.find(
				(s) => s.metric === "visitors" && s.method === "zscore"
			);
			expect(visitorSignal).toBeUndefined();
		});

		it("requires at least 7 days of data", async () => {
			const start = dayjs().subtract(4, "day");
			const days = generateStableDays(5, {
				visitors: 100,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			}, start);
			days[4].visitors = 500;

			const rows = makeDailyRows(days);
			const queryFn = createMockQueryFn(rows);

			const signals = await detectSignals(
				{ ...BASE_PARAMS, lookbackDays: 5 },
				queryFn
			);
			const zscoreSignals = signals.filter((s) => s.method === "zscore");
			expect(zscoreSignals.length).toBe(0);
		});
	});

	describe("WoW detection", () => {
		it("flags period-over-period changes", async () => {
			const queryFn = createMockQueryFn(
				[],
				{
					unique_visitors: 200,
					sessions: 250,
					pageviews: 500,
					bounce_rate: 30,
					median_session_duration: 120,
				},
				{
					unique_visitors: 100,
					sessions: 130,
					pageviews: 250,
					bounce_rate: 30,
					median_session_duration: 120,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const wowSignals = signals.filter((s) => s.method === "wow");
			expect(wowSignals.length).toBeGreaterThan(0);

			const visitorWow = wowSignals.find((s) => s.metric === "visitors");
			expect(visitorWow).toBeDefined();
			expect(visitorWow!.direction).toBe("up");
			expect(visitorWow!.deltaPercent).toBe(100);
		});

		it("does not flag changes below 40%", async () => {
			const queryFn = createMockQueryFn(
				[],
				{
					unique_visitors: 130,
					sessions: 130,
					pageviews: 130,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				{
					unique_visitors: 100,
					sessions: 100,
					pageviews: 100,
					bounce_rate: 40,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const wowSignals = signals.filter((s) => s.method === "wow");
			expect(wowSignals.length).toBe(0);
		});

		it("suppresses WoW changes within a volatile site's normal range", async () => {
			const start = dayjs().subtract(27, "day");
			const volatileDays = Array.from({ length: 28 }, (_, i) => ({
				date: start.add(i, "day").format("YYYY-MM-DD"),
				visitors: i % 2 === 0 ? 40 : 200,
				sessions: 100,
				pageviews: 100,
				bounce_rate: 40,
				median_session_duration: 60,
			}));
			const queryFn = createMockQueryFn(
				makeDailyRows(volatileDays),
				{
					unique_visitors: 200,
					sessions: 100,
					pageviews: 100,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				{
					unique_visitors: 100,
					sessions: 100,
					pageviews: 100,
					bounce_rate: 40,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const visitorWow = signals.filter(
				(s) => s.method === "wow" && s.metric === "visitors"
			);
			expect(visitorWow.length).toBe(0);
		});
	});

	describe("severity tiers", () => {
		it("assigns critical for large spikes", async () => {
			const start = dayjs().subtract(27, "day");
			const normal = generateStableDays(27, {
				visitors: 100,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			}, start);

			const spikeDay = {
				date: start.add(27, "day").format("YYYY-MM-DD"),
				visitors: 500,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			};

			const rows = makeDailyRows([...normal, spikeDay]);
			const queryFn = createMockQueryFn(rows);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const visitorSignal = signals.find((s) => s.metric === "visitors");
			expect(visitorSignal).toBeDefined();
			expect(visitorSignal!.severity).toBe("critical");
		});

		it("assigns appropriate severity based on thresholds", async () => {
			expect(assignSeverity(4.0, 70)).toBe("critical");
			expect(assignSeverity(3.2, 55)).toBe("warning");
			expect(assignSeverity(2.5, 40)).toBe("info");
		});
	});

	describe("deduplication", () => {
		it("keeps highest delta per metric when both methods fire", async () => {
			const start = dayjs().subtract(27, "day");
			const normal = generateStableDays(27, {
				visitors: 100,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			}, start);

			const spikeDay = {
				date: start.add(27, "day").format("YYYY-MM-DD"),
				visitors: 400,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			};

			const rows = makeDailyRows([...normal, spikeDay]);

			const queryFn = createMockQueryFn(
				rows,
				{
					unique_visitors: 150,
					sessions: 120,
					pageviews: 200,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				{
					unique_visitors: 100,
					sessions: 120,
					pageviews: 200,
					bounce_rate: 40,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const visitorSignals = signals.filter((s) => s.metric === "visitors");
			expect(visitorSignals.length).toBe(1);
			expect(Math.abs(visitorSignals[0].deltaPercent)).toBeGreaterThan(50);
		});
	});

	describe("weekday/weekend awareness", () => {
		it("compares weekday data against weekday baseline only", async () => {
			const rows: ReturnType<typeof makeDailyRows> = [];

			let d = dayjs("2026-05-04");
			for (let i = 0; i < 14; i++) {
				const dateStr = d.format("YYYY-MM-DD");
				const dayOfWeek = d.day();
				const isWkend = dayOfWeek === 0 || dayOfWeek === 6;

				rows.push({
					date: dateStr,
					visitors: isWkend ? 30 : 100 + (i % 3),
					sessions: isWkend ? 35 : 120 + (i % 3),
					pageviews: isWkend ? 50 : 200 + (i % 3),
					bounce_rate: 40,
					median_session_duration: 60,
				});
				d = d.add(1, "day");
			}

			const lastRow = rows[rows.length - 1];
			const lastDate = dayjs(lastRow.date as string);
			const lastIsWeekend = lastDate.day() === 0 || lastDate.day() === 6;

			if (lastIsWeekend) {
				lastRow.visitors = 30;
			} else {
				lastRow.visitors = 101;
			}

			const queryFn = createMockQueryFn(rows);
			const signals = await detectSignals(
				{ ...BASE_PARAMS, lookbackDays: 14 },
				queryFn
			);

			const zscoreVisitors = signals.find(
				(s) => s.metric === "visitors" && s.method === "zscore"
			);
			expect(zscoreVisitors).toBeUndefined();
		});

		it("detects anomaly on a weekday when a spike deviates from weekday baseline", async () => {
			const rows: ReturnType<typeof makeDailyRows> = [];

			let d = dayjs("2026-05-07");
			for (let i = 0; i < 13; i++) {
				const dateStr = d.format("YYYY-MM-DD");
				const dayOfWeek = d.day();
				const isWkend = dayOfWeek === 0 || dayOfWeek === 6;

				rows.push({
					date: dateStr,
					visitors: isWkend ? 30 : 100 + (i % 3),
					sessions: 120 + (i % 3),
					pageviews: 200 + (i % 3),
					bounce_rate: 40,
					median_session_duration: 60,
				});
				d = d.add(1, "day");
			}

			rows.push({
				date: d.format("YYYY-MM-DD"),
				visitors: 400,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			});

			const queryFn = createMockQueryFn(rows);
			const signals = await detectSignals(
				{ ...BASE_PARAMS, lookbackDays: 14 },
				queryFn
			);

			const zscoreVisitors = signals.find(
				(s) => s.metric === "visitors" && s.method === "zscore"
			);
			expect(zscoreVisitors).toBeDefined();
			expect(zscoreVisitors!.direction).toBe("up");
		});
	});

	describe("low-traffic filter", () => {
		it("filters out volume metrics when max(current, baseline) < 80", async () => {
			const queryFn = createMockQueryFn(
				[],
				{
					unique_visitors: 50,
					sessions: 60,
					pageviews: 70,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				{
					unique_visitors: 20,
					sessions: 25,
					pageviews: 30,
					bounce_rate: 40,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const volumeSignals = signals.filter(
				(s) =>
					s.metric === "visitors" ||
					s.metric === "sessions" ||
					s.metric === "pageviews"
			);
			expect(volumeSignals.length).toBe(0);
		});

		it("does not filter rate metrics by traffic volume", async () => {
			const queryFn = createMockQueryFn(
				[],
				{
					unique_visitors: 10,
					sessions: 10,
					pageviews: 10,
					bounce_rate: 60,
					median_session_duration: 120,
				},
				{
					unique_visitors: 5,
					sessions: 5,
					pageviews: 5,
					bounce_rate: 30,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const rateSignals = signals.filter(
				(s) =>
					s.metric === "bounce_rate" || s.metric === "session_duration"
			);
			expect(rateSignals.length).toBeGreaterThan(0);
		});
	});

	describe("rate metric absolute delta filter", () => {
		it("filters rate metrics with less than 10pp absolute change", async () => {
			const queryFn = createMockQueryFn(
				[],
				{
					unique_visitors: 200,
					sessions: 200,
					pageviews: 200,
					bounce_rate: 52,
					median_session_duration: 67,
				},
				{
					unique_visitors: 200,
					sessions: 200,
					pageviews: 200,
					bounce_rate: 45,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const rateSignals = signals.filter(
				(s) =>
					s.metric === "bounce_rate" || s.metric === "session_duration"
			);
			expect(rateSignals.length).toBe(0);
		});
	});

	describe("impact floor filter", () => {
		it("filters count metrics with impact below 50", async () => {
			const queryFn = createMockQueryFn(
				[],
				{
					unique_visitors: 110,
					sessions: 110,
					pageviews: 110,
					bounce_rate: 30,
					median_session_duration: 60,
				},
				{
					unique_visitors: 80,
					sessions: 80,
					pageviews: 80,
					bounce_rate: 30,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.filter((s) => s.metric === "visitors").length).toBe(0);
		});

		it("keeps count metrics with impact at or above 50", async () => {
			const queryFn = createMockQueryFn(
				[],
				{
					unique_visitors: 200,
					sessions: 200,
					pageviews: 200,
					bounce_rate: 30,
					median_session_duration: 60,
				},
				{
					unique_visitors: 100,
					sessions: 100,
					pageviews: 100,
					bounce_rate: 30,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(
				signals.some((s) => s.metric === "visitors")
			).toBe(true);
		});
	});

	describe("z-score vs WoW conflict resolution", () => {
		it("drops z-score signal when WoW shows the opposite direction", async () => {
			const start = dayjs().subtract(27, "day");
			const normal = generateStableDays(27, {
				visitors: 100,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			}, start);

			const latestDay = {
				date: start.add(27, "day").format("YYYY-MM-DD"),
				visitors: 50,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			};

			const rows = makeDailyRows([...normal, latestDay]);

			const queryFn = createMockQueryFn(
				rows,
				{ unique_visitors: 200, sessions: 240, pageviews: 400, bounce_rate: 40, median_session_duration: 60 },
				{ unique_visitors: 100, sessions: 120, pageviews: 200, bounce_rate: 40, median_session_duration: 60 },
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const visitorSignal = signals.find((s) => s.metric === "visitors");
			if (visitorSignal) {
				expect(visitorSignal.direction).toBe("up");
			}
		});
	});

	describe("error detection", () => {
		it("flags error count spike above 40%", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				error_summary: [{ totalErrors: 50 }, { totalErrors: 20 }],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const errorSignal = signals.find((s) => s.metric === "error_count");
			expect(errorSignal).toBeDefined();
			expect(errorSignal!.direction).toBe("up");
			expect(errorSignal!.deltaPercent).toBe(150);
		});

		it("skips errors below absolute threshold", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				error_summary: [{ totalErrors: 3 }, { totalErrors: 1 }],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "error_count")).toBeUndefined();
		});
	});

	describe("revenue detection", () => {
		it("flags new revenue appearing", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [{ total_revenue: 100 }, { total_revenue: 0 }],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const revSignal = signals.find((s) => s.metric === "revenue");
			expect(revSignal).toBeDefined();
			expect(revSignal!.direction).toBe("up");
		});

		it("flags revenue drop above 30%", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [{ total_revenue: 50 }, { total_revenue: 100 }],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const revSignal = signals.find((s) => s.metric === "revenue");
			expect(revSignal).toBeDefined();
			expect(revSignal!.direction).toBe("down");
			expect(revSignal!.deltaPercent).toBe(-50);
		});

		it("skips small revenue changes", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [{ total_revenue: 110 }, { total_revenue: 100 }],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "revenue")).toBeUndefined();
		});
	});

	describe("correlated signal collapsing", () => {
		it("collapses 2+ same-direction traffic metrics to the strongest", async () => {
			const queryFn = createMockQueryFn(
				[],
				{
					unique_visitors: 200,
					sessions: 240,
					pageviews: 420,
					bounce_rate: 10,
					median_session_duration: 120,
				},
				{
					unique_visitors: 100,
					sessions: 120,
					pageviews: 200,
					bounce_rate: 25,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const upTraffic = signals.filter(
				(s) =>
					s.direction === "up" &&
					["visitors", "sessions", "pageviews"].includes(s.metric)
			);
			expect(upTraffic.length).toBe(1);
		});

		it("preserves non-traffic metrics alongside collapsed traffic", async () => {
			const queryFn = createMockQueryFn(
				[],
				{
					unique_visitors: 200,
					sessions: 240,
					pageviews: 420,
					bounce_rate: 10,
					median_session_duration: 120,
				},
				{
					unique_visitors: 100,
					sessions: 120,
					pageviews: 200,
					bounce_rate: 25,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const downSignals = signals.filter((s) => s.direction === "down");
			expect(downSignals.some((s) => s.metric === "bounce_rate")).toBe(true);
		});

		it("does not collapse a single traffic metric", async () => {
			const queryFn = createMockQueryFn(
				[],
				{
					unique_visitors: 200,
					sessions: 120,
					pageviews: 200,
					bounce_rate: 30,
					median_session_duration: 60,
				},
				{
					unique_visitors: 100,
					sessions: 120,
					pageviews: 200,
					bounce_rate: 30,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const upTraffic = signals.filter(
				(s) =>
					s.direction === "up" &&
					["visitors", "sessions", "pageviews"].includes(s.metric)
			);
			expect(upTraffic.length).toBe(1);
		});
	});
});
