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
	wowWindow,
} from "./detection";
import { computeResolutions } from "./resolution";

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

describe("wowWindow", () => {
	it("ends both comparison windows on complete days", () => {
		expect(wowWindow(dayjs("2026-06-15"), 7)).toEqual({
			currentFrom: "2026-06-08",
			currentTo: "2026-06-14",
			previousFrom: "2026-06-01",
			previousTo: "2026-06-07",
		});
	});
});

describe("detectSignals", () => {
	it("uses an explicit clock for historical replay windows", async () => {
		const requests: Array<{ from?: string; to?: string; type: string }> = [];
		const queryFn: QueryFn = async (request) => {
			requests.push({
				from: request.from,
				to: request.to,
				type: request.type,
			});
			return [];
		};

		await detectSignals(BASE_PARAMS, queryFn, dayjs("2025-03-15"));

		expect(requests[0]).toMatchObject({
			from: "2025-02-15",
			to: "2025-03-14",
			type: "events_by_date",
		});
		expect(
			requests.filter((request) => request.type === "summary_metrics")
		).toEqual([
			{
				from: "2025-02-15",
				to: "2025-03-14",
				type: "summary_metrics",
			},
			{
				from: "2025-01-18",
				to: "2025-02-14",
				type: "summary_metrics",
			},
		]);
	});

	it("keeps a valid traffic signal when history and revenue probes fail", async () => {
		let summaryCalls = 0;
		const diagnostics = { failedFamilies: 0 };
		const queryFn: QueryFn = async (request) => {
			if (request.type === "events_by_date") {
				throw new Error("daily history unavailable");
			}
			if (request.type === "revenue_overview") {
				throw new Error("revenue unavailable");
			}
			if (request.type === "summary_metrics") {
				summaryCalls += 1;
				return [
					{
						unique_visitors: summaryCalls === 1 ? 200 : 100,
						sessions: 100,
						pageviews: 100,
					},
				];
			}
			return [];
		};

		const signals = await detectSignals(
			BASE_PARAMS,
			queryFn,
			dayjs("2025-03-15"),
			undefined,
			diagnostics
		);

		expect(signals.map((signal) => signal.metric)).toContain("visitors");
		expect(diagnostics.failedFamilies).toBe(2);
	});

	it("detects an exact custom event disappearance", async () => {
		const queryFn = createMockQueryFn(
			[],
			{ sessions: 100 },
			{ sessions: 100 },
			{
				custom_events: [
					{ name: "checkout_completed", unique_users: 0 },
					{ name: "checkout_completed", unique_users: 30 },
				],
			}
		);

		const signals = await detectSignals(
			BASE_PARAMS,
			queryFn,
			dayjs("2025-03-15")
		);
		const signal = signals.find(
			(candidate) => candidate.metric === "custom_event:checkout_completed"
		);

		expect(signal).toMatchObject({
			current: 0,
			direction: "down",
			kind: "missing_expected_data",
		});
	});

	it("ignores small custom event changes", async () => {
		const queryFn = createMockQueryFn([], { sessions: 100 }, { sessions: 100 }, {
			custom_events: [
				{ name: "checkout_completed", unique_users: 18 },
				{ name: "checkout_completed", unique_users: 20 },
			],
		});

		const signals = await detectSignals(
			BASE_PARAMS,
			queryFn,
			dayjs("2025-03-15")
		);
		expect(
			signals.find(
				(candidate) => candidate.metric === "custom_event:checkout_completed"
			)
		).toBeUndefined();
	});

	it("returns no signals and reports an incomplete scan when one family fails", async () => {
		const diagnostics = { failedFamilies: 0 };
		const queryFn: QueryFn = async (request) => {
			if (request.type === "revenue_overview") {
				throw new Error("revenue unavailable");
			}
			if (request.type === "summary_metrics") {
				return [
					{ unique_visitors: 100, sessions: 100, pageviews: 100 },
				];
			}
			return [];
		};

		const signals = await detectSignals(
			BASE_PARAMS,
			queryFn,
			dayjs("2025-03-15"),
			undefined,
			diagnostics
		);

		expect(signals).toEqual([]);
		expect(diagnostics.failedFamilies).toBe(1);
	});

	it("recovers a detector family after one transient query failure", async () => {
		let revenueCalls = 0;
		const diagnostics = { failedFamilies: 0 };
		const queryFn: QueryFn = async (request) => {
			if (request.type === "revenue_overview") {
				revenueCalls += 1;
				if (revenueCalls === 1) {
					throw new Error("socket closed");
				}
			}
			return [];
		};

		const signals = await detectSignals(
			BASE_PARAMS,
			queryFn,
			dayjs("2025-03-15"),
			undefined,
			diagnostics
		);

		expect(signals).toEqual([]);
		expect(revenueCalls).toBe(4);
		expect(diagnostics.failedFamilies).toBe(0);
	});

	describe("z-score detection", () => {
		it("flags a spike on the latest complete day", async () => {
			const start = dayjs().subtract(28, "day");
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
			expect(visitorSignal!.baselineDates?.length).toBeGreaterThanOrEqual(6);
			expect(visitorSignal!.baselineDates).toEqual(
				[...(visitorSignal!.baselineDates ?? [])].sort()
			);
		});

		it("flags a drop on the latest complete day", async () => {
			const start = dayjs().subtract(28, "day");
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
			const start = dayjs().subtract(14, "day");
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

		it("ignores the current partial day when picking the latest", async () => {
			const start = dayjs().subtract(28, "day");
			const normal = generateStableDays(28, {
				visitors: 100,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			}, start);

			const partialToday = {
				date: dayjs().format("YYYY-MM-DD"),
				visitors: 8,
				sessions: 10,
				pageviews: 15,
				bounce_rate: 40,
				median_session_duration: 60,
			};

			const rows = makeDailyRows([...normal, partialToday]);
			const signals = await detectSignals(BASE_PARAMS, createMockQueryFn(rows));

			expect(
				signals.some(
					(s) => s.method === "zscore" && s.current === 8
				)
			).toBe(false);
			expect(signals.filter((s) => s.method === "zscore")).toHaveLength(0);
		});

		it("treats missing aggregate dates as zero-activity days", async () => {
			const start = dayjs().subtract(29, "day");
			const normal = generateStableDays(
				27,
				{
					visitors: 100,
					sessions: 120,
					pageviews: 200,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				start
			);
			const staleSpike = {
				...normal.at(-1)!,
				date: dayjs().subtract(3, "day").format("YYYY-MM-DD"),
				visitors: 500,
			};
			const rows = makeDailyRows([...normal.slice(0, -1), staleSpike]);

			const diagnostics = { failedFamilies: 0 };
			const signals = await detectSignals(
				BASE_PARAMS,
				createMockQueryFn(rows),
				undefined,
				undefined,
				diagnostics
			);

			expect(signals).toContainEqual(
				expect.objectContaining({
					current: 0,
					direction: "down",
					metric: "visitors",
					method: "zscore",
				})
			);
			expect(diagnostics.failedFamilies).toBe(0);
		});

		it("does not mark sparse successful history as incomplete", async () => {
			const diagnostics = { failedFamilies: 0 };
			const staleRows = [
				{
					date: dayjs().subtract(3, "day").format("YYYY-MM-DD"),
					pageviews: 100,
					sessions: 100,
					visitors: 100,
				},
			];

			const signals = await detectSignals(
				BASE_PARAMS,
				createMockQueryFn(
					staleRows,
					{ pageviews: 100, sessions: 100, unique_visitors: 200 },
					{ pageviews: 100, sessions: 100, unique_visitors: 100 }
				),
				undefined,
				undefined,
				diagnostics
			);

			expect(signals).toEqual([]);
			expect(diagnostics.failedFamilies).toBe(0);
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

		it("fetches enough history for z-score detection at the default lookback", async () => {
			const lastCompleteDay = dayjs().subtract(1, "day");
			const start = lastCompleteDay.subtract(21, "day");
			const rows = generateStableDays(22, {
				visitors: 100,
				sessions: 120,
				pageviews: 200,
				bounce_rate: 40,
				median_session_duration: 60,
			}, start);
			rows[21].visitors = 500;

			let requestedFrom = "";
			let requestedTo = "";
			const queryFn: QueryFn = async (request: {
				from?: string;
				to?: string;
				type: string;
			}) => {
				if (request.type !== "events_by_date") {
					return [];
				}
				requestedFrom = request.from ?? "";
				requestedTo = request.to ?? "";
				return makeDailyRows(rows).filter(
					(row) => row.date >= requestedFrom && row.date <= requestedTo
				);
			};

			const signals = await detectSignals(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				queryFn
			);

			expect(requestedFrom).toBe(start.format("YYYY-MM-DD"));
			expect(requestedTo).toBe(lastCompleteDay.format("YYYY-MM-DD"));
			expect(
				signals.some(
					(signal) => signal.metric === "visitors" && signal.method === "zscore"
				)
			).toBe(true);
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

		it("flags a complete traffic outage after a nonzero baseline", async () => {
			const queryFn = createMockQueryFn(
				[],
				{
					unique_visitors: 0,
					sessions: 0,
					pageviews: 0,
					bounce_rate: 0,
					median_session_duration: 0,
				},
				{
					unique_visitors: 200,
					sessions: 250,
					pageviews: 500,
					bounce_rate: 40,
					median_session_duration: 60,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const trafficDrop = signals.find((signal) =>
				["visitors", "sessions", "pageviews"].includes(signal.metric)
			);

			expect(trafficDrop).toBeDefined();
			expect(trafficDrop!.direction).toBe("down");
			expect(trafficDrop!.current).toBe(0);
			expect(trafficDrop!.deltaPercent).toBe(-100);
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

		it("does not let adaptive volatility hide a material volume collapse", async () => {
			const start = dayjs().subtract(27, "day");
			const volatile = generateStableDays(
				28,
				{
					visitors: 500,
					sessions: 700,
					pageviews: 1000,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				start
			);
			for (const [index, row] of volatile.entries()) {
				row.pageviews = index % 2 === 0 ? 100 : 2000;
			}
			const signals = await detectSignals(
				BASE_PARAMS,
				createMockQueryFn(
					volatile,
					{ pageviews: 1337, sessions: 2000 },
					{ pageviews: 4999, sessions: 2000 }
				)
			);

			expect(signals).toContainEqual(
				expect.objectContaining({
					current: 1337,
					direction: "down",
					metric: "pageviews",
				})
			);
		});
	});

	describe("severity tiers", () => {
		it("assigns critical for large spikes", async () => {
			const start = dayjs().subtract(28, "day");
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
			const start = dayjs().subtract(28, "day");
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
				queryFn,
				d
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
				queryFn,
				d.add(1, "day")
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
				error_summary: [
					{ totalErrors: 50, affectedUsers: 8, errorRate: 2.5 },
					{ totalErrors: 20, affectedUsers: 5, errorRate: 1.2 },
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const errorSignal = signals.find((s) => s.metric === "error_count");
			expect(errorSignal).toBeDefined();
			expect(errorSignal!.direction).toBe("up");
			expect(errorSignal!.deltaPercent).toBe(150);
			expect(errorSignal!.severity).toBe("warning");
		});

		it("suppresses a low-rate error spike affecting only three users", async () => {
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 4000 },
				{ sessions: 4000 },
				{
					error_summary: [
						{ totalErrors: 10, affectedUsers: 3, errorRate: 0.08 },
						{ totalErrors: 2, affectedUsers: 1, errorRate: 0.03 },
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "error_count")).toBeUndefined();
		});

		it("skips errors below absolute threshold", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				error_summary: [
					{ totalErrors: 3, affectedUsers: 3 },
					{ totalErrors: 1, affectedUsers: 1 },
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "error_count")).toBeUndefined();
		});

		it("suppresses a single-user error storm regardless of volume", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				error_summary: [
					{ totalErrors: 168, affectedUsers: 1 },
					{ totalErrors: 10, affectedUsers: 1 },
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "error_count")).toBeUndefined();
		});

		it("keeps an error recovery when the previous week had enough affected users", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				error_summary: [
					{ totalErrors: 12, affectedUsers: 2, errorRate: 0.4 },
					{ totalErrors: 60, affectedUsers: 15, errorRate: 3 },
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const errorSignal = signals.find((s) => s.metric === "error_count");
			expect(errorSignal).toBeDefined();
			expect(errorSignal!.direction).toBe("down");
		});

		it("suppresses a current single-user spike even when the prior week had many affected users", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				error_summary: [
					{ totalErrors: 168, affectedUsers: 1 },
					{ totalErrors: 20, affectedUsers: 8 },
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "error_count")).toBeUndefined();
		});
	});

	describe("vitals detection", () => {
		it("ignores regressions that remain within the good threshold", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				vitals_overview: [
					{ metric_name: "INP", p75: 147, samples: 100 },
					{ metric_name: "INP", p75: 104, samples: 100 },
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((signal) => signal.metric === "inp")).toBeUndefined();
		});

		it("keeps regressions that cross the good threshold", async () => {
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 1000 },
				{ sessions: 1000 },
				{
				vitals_overview: [
					{ metric_name: "INP", p75: 240, samples: 100 },
					{ metric_name: "INP", p75: 150, samples: 100 },
				],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((signal) => signal.metric === "inp")).toBeDefined();
		});

		it("ignores implausible instrumentation outliers", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				vitals_overview: [
					{ metric_name: "LCP", p75: 76_751_400, samples: 100 },
					{ metric_name: "LCP", p75: 2400, samples: 100 },
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((signal) => signal.metric === "lcp")).toBeUndefined();
		});

		it("ignores comparisons with a sparse baseline period", async () => {
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 1000 },
				{ sessions: 1000 },
				{
					vitals_overview: [
						{ metric_name: "INP", p75: 240, samples: 100 },
						{ metric_name: "INP", p75: 150, samples: 1 },
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((signal) => signal.metric === "inp")).toBeUndefined();
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

		it("evaluates each revenue currency independently", async () => {
			let revenueCalls = 0;
			const queryFn: QueryFn = async (request) => {
				if (request.type !== "revenue_overview") {
					return [];
				}
				revenueCalls += 1;
				return revenueCalls === 1
					? [
							{ currency: "USD", total_revenue: 50 },
							{ currency: "EUR", total_revenue: 200 },
						]
					: [
							{ currency: "USD", total_revenue: 100 },
							{ currency: "EUR", total_revenue: 100 },
						];
			};

			const signals = (await detectSignals(BASE_PARAMS, queryFn)).filter(
				(signal) => signal.metric === "revenue"
			);

			expect(signals).toHaveLength(2);
			expect(signals.find((signal) => signal.currency === "USD")).toMatchObject({
				current: 50,
				baseline: 100,
				direction: "down",
				label: "Revenue (USD)",
			});
			expect(signals.find((signal) => signal.currency === "EUR")).toMatchObject({
				current: 200,
				baseline: 100,
				direction: "up",
				label: "Revenue (EUR)",
			});
		});

		it("skips small revenue changes", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [{ total_revenue: 110 }, { total_revenue: 100 }],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "revenue")).toBeUndefined();
		});

		it("skips a one-transaction revenue fluctuation", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [
					{ total_revenue: 0, total_transactions: 0 },
					{ total_revenue: 4.99, total_transactions: 1 },
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "revenue")).toBeUndefined();
		});

		it("keeps a high-volume revenue change below the amount floor", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [
					{ total_revenue: 2, total_transactions: 8 },
					{ total_revenue: 10, total_transactions: 10 },
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "revenue")).toBeDefined();
		});

		it("flags a material payment failure-rate regression", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [
					{
						failed_payment_attempts: 10,
						observed_failure_event_types: 2,
						payment_failure_rate: 20,
						required_failure_event_types: 2,
						successful_payment_attempts: 40,
					},
					{
						failed_payment_attempts: 2,
						observed_failure_event_types: 2,
						payment_failure_rate: 5,
						required_failure_event_types: 2,
						successful_payment_attempts: 38,
					},
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const failureSignal = signals.find(
				(signal) => signal.metric === "payment_failure_rate"
			);
			expect(failureSignal?.direction).toBe("up");
			expect(failureSignal?.current).toBe(20);
			expect(failureSignal?.baseline).toBe(5);
		});

		it("detects a regression when only one failure event type occurs", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [
					{
						failed_payment_attempts: 10,
						observed_failure_event_types: 1,
						payment_failure_rate: 20,
						required_failure_event_types: 2,
						successful_payment_attempts: 40,
					},
					{
						failed_payment_attempts: 2,
						observed_failure_event_types: 2,
						payment_failure_rate: 5,
						required_failure_event_types: 2,
						successful_payment_attempts: 38,
					},
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(
				signals.find((signal) => signal.metric === "payment_failure_rate")
			).toMatchObject({ current: 20, baseline: 5, direction: "up" });
		});

		it("detects a failure spike against a prior zero", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [
					{
						failed_payment_attempts: 10,
						observed_failure_event_types: 1,
						payment_failure_rate: 20,
						successful_payment_attempts: 40,
					},
					{
						failed_payment_attempts: 0,
						observed_failure_event_types: 0,
						payment_failure_rate: 0,
						successful_payment_attempts: 40,
					},
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(
				signals.find((signal) => signal.metric === "payment_failure_rate")
			).toMatchObject({ current: 20, baseline: 0, direction: "up" });
		});

		it("does not claim recovery when no current failure events are observed", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [
					{
						failed_payment_attempts: 0,
						observed_failure_event_types: 0,
						payment_failure_rate: 0,
						successful_payment_attempts: 40,
					},
					{
						failed_payment_attempts: 10,
						observed_failure_event_types: 1,
						payment_failure_rate: 20,
						successful_payment_attempts: 40,
					},
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(
				signals.find((signal) => signal.metric === "payment_failure_rate")
			).toBeUndefined();
			expect(
				computeResolutions({
					canRecover: true,
					detectedSignals: signals,
					now: new Date("2026-06-01T00:00:00.000Z"),
					openInsights: [
						{
							changePercent: 300,
							createdAt: new Date("2026-05-01T00:00:00.000Z"),
							id: "open-payment-failure",
							sentiment: "negative",
							subjectKey: "payment_failure_rate",
							type: "quality_shift",
						},
					],
				})
			).toEqual([{ id: "open-payment-failure", reason: "stale" }]);
		});

		it("detects a recovery when failures occur in both periods", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [
					{
						failed_payment_attempts: 5,
						observed_failure_event_types: 1,
						payment_failure_rate: 10,
						successful_payment_attempts: 45,
					},
					{
						failed_payment_attempts: 20,
						observed_failure_event_types: 1,
						payment_failure_rate: 40,
						successful_payment_attempts: 30,
					},
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(
				signals.find((signal) => signal.metric === "payment_failure_rate")
			).toMatchObject({ current: 10, baseline: 40, direction: "down" });
		});

		it("does not confuse higher payment volume with a failure regression", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [
					{
						failed_payment_attempts: 10,
						payment_failure_rate: 10,
						successful_payment_attempts: 90,
					},
					{
						failed_payment_attempts: 5,
						payment_failure_rate: 10,
						successful_payment_attempts: 45,
					},
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(
				signals.find((signal) => signal.metric === "payment_failure_rate")
			).toBeUndefined();
		});

	it("ignores sparse payment failure samples", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				revenue_overview: [
					{
						failed_payment_attempts: 2,
						payment_failure_rate: 40,
						successful_payment_attempts: 3,
					},
					{
						failed_payment_attempts: 0,
						payment_failure_rate: 0,
						successful_payment_attempts: 4,
					},
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(
				signals.find((signal) => signal.metric === "payment_failure_rate")
		).toBeUndefined();
	});

	it("does not combine failure and volume floors from different periods", async () => {
		const queryFn = createMockQueryFn(
			[],
			{ sessions: 100 },
			{ sessions: 100 },
			{
				revenue_overview: [
					{
						failed_payment_attempts: 5,
						payment_failure_rate: 100,
						successful_payment_attempts: 0,
					},
					{
						failed_payment_attempts: 0,
						payment_failure_rate: 0,
						successful_payment_attempts: 10,
					},
				],
			}
		);

		const signals = await detectSignals(
			BASE_PARAMS,
			queryFn,
			dayjs("2025-03-15")
		);

		expect(
			signals.find((signal) => signal.metric === "payment_failure_rate")
		).toBeUndefined();
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
				},
				{
					error_summary: [
						{ totalErrors: 100, affectedUsers: 30, errorRate: 5 },
						{ totalErrors: 20, affectedUsers: 10, errorRate: 2 },
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.some((s) => s.metric === "error_count")).toBe(true);
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
