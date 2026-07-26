import { describe, expect, it } from "bun:test";
import dayjs from "dayjs";
import {
	type DetectSignalsParams,
	type QueryFn,
	assignSeverity,
	detectSignals,
	remeasureMetricSignal,
	wowWindow,
} from "./detection";
import { prepareInvestigation } from "./investigation";

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
	extras?: Record<
		string,
		[
			Record<string, unknown> | Record<string, unknown>[] | undefined,
			Record<string, unknown> | Record<string, unknown>[] | undefined,
		]
	>
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
			const rows = count === 1 ? extra[0] : extra[1];
			return Array.isArray(rows) ? rows : [rows ?? {}];
		}
		return [];
	};
}

function errorRow(
	count: number,
	users: number,
	overrides: Record<string, unknown> = {}
) {
	return {
		count,
		name: "cart is undefined",
		sessions: users,
		users,
		...overrides,
	};
}

function customEventRow(
	name: string,
	totalEvents: number,
	uniqueUsers: number
) {
	return {
		name,
		total_events: totalEvents,
		unique_sessions: uniqueUsers,
		unique_users: uniqueUsers,
	};
}

describe("assignSeverity", () => {
	for (const [name, zScore, delta, expected] of [
		["critical for z-score >= 3.5", 3.5, 10, "critical"],
		["critical for delta >= 60%", 1, 65, "critical"],
		["warning for z-score >= 3.0", 3, 10, "warning"],
		["warning for delta >= 50%", 1, 55, "warning"],
		["info for values at the floor", 2.5, 40, "info"],
		["info when z-score is undefined and delta is moderate", undefined, 45, "info"],
	] as const) {
		it(`assigns ${name}`, () => {
			expect(assignSeverity(zScore, delta)).toBe(expected);
		});
	}
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

	it("does not infer event changes when summary detection fails", async () => {
		const diagnostics = { failedFamilies: 0 };
		let customEventCalls = 0;
		const queryFn: QueryFn = async (request) => {
			if (request.type === "summary_metrics") {
				throw new Error("summary unavailable");
			}
			if (request.type === "custom_events") {
				customEventCalls += 1;
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
		expect(customEventCalls).toBe(0);
	});

	it("retries only the failed period after a transient query failure", async () => {
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
		expect(revenueCalls).toBe(3);
		expect(diagnostics.failedFamilies).toBe(0);
	});

	it("limits metric probes to one current and previous pair", async () => {
		let active = 0;
		let peak = 0;
		const queryFn: QueryFn = async (request) => {
			if (request.type === "events_by_date") {
				return [];
			}
			active += 1;
			peak = Math.max(peak, active);
			await Bun.sleep(5);
			active -= 1;
			return [];
		};

		await detectSignals(BASE_PARAMS, queryFn, dayjs("2025-03-15"));

		expect(peak).toBe(2);
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
					bounce_rate: 100,
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
			expect(
				signals.filter((signal) =>
					["bounce_rate", "session_duration"].includes(signal.metric)
				)
			).toEqual([]);
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

	describe("traffic floors", () => {
		for (const { name, current, previous, metrics, detected } of [
			{
				name: "filters out volume metrics when max(current, baseline) < 80",
				current: { unique_visitors: 50, sessions: 60, pageviews: 70 },
				previous: { unique_visitors: 20, sessions: 25, pageviews: 30 },
				metrics: ["visitors", "sessions", "pageviews"],
				detected: false,
			},
			{
				name: "filters rate metrics when the comparison has too few sessions",
				current: { sessions: 10, bounce_rate: 60, median_session_duration: 120 },
				previous: { sessions: 5, bounce_rate: 30, median_session_duration: 60 },
				metrics: ["bounce_rate", "session_duration"],
				detected: false,
			},
			{
				name: "filters rate metrics with less than 10pp absolute change",
				current: { sessions: 200, bounce_rate: 52, median_session_duration: 67 },
				previous: { sessions: 200, bounce_rate: 45, median_session_duration: 60 },
				metrics: ["bounce_rate", "session_duration"],
				detected: false,
			},
			{
				name: "filters count metrics with impact below 50",
				current: { unique_visitors: 110 },
				previous: { unique_visitors: 80 },
				metrics: ["visitors"],
				detected: false,
			},
			{
				name: "keeps count metrics with impact at or above 50",
				current: { unique_visitors: 200 },
				previous: { unique_visitors: 100 },
				metrics: ["visitors"],
				detected: true,
			},
		] as const) {
			it(name, async () => {
				const signals = await detectSignals(
					BASE_PARAMS,
					createMockQueryFn([], current, previous)
				);
				expect(
					signals.some((signal) =>
						metrics.some((metric) => metric === signal.metric)
					)
				).toBe(detected);
			});
		}
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
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 320 },
				{ sessions: 400 },
				{
					error_fingerprints: [
						errorRow(50, 8, {
							error_type: "TypeError",
							filename: "checkout.ts",
							line: 42,
						}),
						errorRow(20, 5, {
							error_type: "TypeError",
							filename: "checkout.ts",
							line: 42,
						}),
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const errorSignal = signals.find((s) => s.metric === "error_count");
			expect(errorSignal).toBeDefined();
			expect(errorSignal!.direction).toBe("up");
			expect(errorSignal!.deltaPercent).toBe(150);
			expect(errorSignal!.severity).toBe("warning");
			expect(errorSignal!.subjectKey).toBe("error:cart is undefined");
		});

		it("keeps distinct error fingerprints as distinct signals", async () => {
			const queryFn = createMockQueryFn([], { sessions: 200 }, { sessions: 200 }, {
				error_fingerprints: [
					[
						errorRow(60, 12, {
							error_type: "TypeError",
							path: "/checkout",
						}),
						errorRow(40, 8, {
							error_type: "ChunkLoadError",
							name: "checkout chunk failed",
							path: "/checkout",
						}),
					],
					[
						errorRow(10, 5, {
							error_type: "TypeError",
							path: "/checkout",
						}),
						errorRow(5, 5, {
							error_type: "ChunkLoadError",
							name: "checkout chunk failed",
							path: "/checkout",
						}),
					],
				],
			});

			const errors = (await detectSignals(BASE_PARAMS, queryFn)).filter(
				(signal) => signal.metric === "error_count"
			);

			expect(errors).toHaveLength(2);
			expect(new Set(errors.map((signal) => signal.subjectKey)).size).toBe(2);
		});

		it("suppresses a low-rate error spike affecting only three users", async () => {
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 4000 },
				{ sessions: 4000 },
				{
					error_fingerprints: [
						errorRow(10, 3, { name: "Noisy error" }),
						errorRow(2, 1, { name: "Noisy error" }),
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "error_count")).toBeUndefined();
		});

		it("skips errors below absolute threshold", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				error_fingerprints: [
					errorRow(3, 3, { name: "Small error" }),
					errorRow(1, 1, { name: "Small error" }),
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "error_count")).toBeUndefined();
		});

		it("suppresses a single-user error storm regardless of volume", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				error_fingerprints: [
					errorRow(168, 1, { name: "Looping error" }),
					errorRow(10, 1, { name: "Looping error" }),
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "error_count")).toBeUndefined();
		});

		it("keeps an error recovery when the previous week had enough affected users", async () => {
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 500 },
				{ sessions: 500 },
				{
					error_fingerprints: [
						errorRow(12, 2, {
							error_type: "TypeError",
							path: "/checkout",
						}),
						errorRow(60, 15, {
							error_type: "TypeError",
							path: "/checkout",
						}),
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const errorSignal = signals.find((s) => s.metric === "error_count");
			expect(errorSignal).toBeDefined();
			expect(errorSignal!.direction).toBe("down");
		});

		it("suppresses a current single-user spike even when the prior week had many affected users", async () => {
			const queryFn = createMockQueryFn([], {}, {}, {
				error_fingerprints: [
					errorRow(168, 1, { name: "Looping error" }),
					errorRow(20, 8, { name: "Looping error" }),
				],
			});

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "error_count")).toBeUndefined();
		});
	});

	describe("custom event regressions", () => {
		it("detects and remeasures exact event drops", async () => {
			const disappeared = "checkout:".repeat(25);
			const requests: Parameters<QueryFn>[0][] = [];
			const mockQuery = createMockQueryFn(
				[],
				{ sessions: 500 },
				{ sessions: 500 },
				{
					custom_events: [
						[
							customEventRow(disappeared, 40, 25),
							customEventRow("checkout_completed", 80, 45),
						],
						[customEventRow("checkout_completed", 30, 20)],
					],
				}
			);
			const queryFn: QueryFn = async (request) => {
				requests.push(request);
				return mockQuery(request);
			};

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const eventSignal = signals.find(
				(signal) => signal.entityId === disappeared
			);

			expect(eventSignal).toMatchObject({
				baseline: 40,
				current: 0,
				deltaPercent: -100,
				direction: "down",
				entityId: disappeared,
				label: disappeared,
				metric: "custom_event_count",
			});
			expect(
				signals.find((signal) => signal.entityId === "checkout_completed")
			).toMatchObject({ baseline: 80, current: 30, deltaPercent: -62.5 });
			expect(
				requests.find((request) => request.filters)?.filters
			).toEqual([
				{
					field: "event_name",
					op: "in",
					value: [disappeared, "checkout_completed"],
				},
			]);
			if (!eventSignal) {
				throw new Error("Expected custom event regression");
			}
			expect(eventSignal.definitionEvidence).toContain("occurred 0 times");
			const prior = prepareInvestigation(eventSignal, 7).signal;
			expect(prior).toMatchObject({
				entity: { id: disappeared, type: "event" },
			});
			expect(prior.signalKey).toHaveLength(160);

			const remeasureRequests: Parameters<QueryFn>[0][] = [];
			const current = await remeasureMetricSignal(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				prior,
				async (request) => {
					remeasureRequests.push(request);
					return remeasureRequests.length === 1
						? []
						: [customEventRow(disappeared, 30, 20)];
				},
				dayjs("2026-07-20")
			);
			expect(current).toMatchObject({
				baseline: 30,
				current: 0,
				subjectKey: prior.signalKey,
			});
			expect(remeasureRequests[0]?.filters).toEqual([
				{ field: "event_name", op: "eq", value: disappeared },
			]);
		});

		it("suppresses new, low-reach, and traffic-proportional event changes", async () => {
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 400 },
				{ sessions: 1000 },
				{
					custom_events: [
						[
							customEventRow("low_volume_event", 8, 8),
							customEventRow("single_user_loop", 100, 1),
							customEventRow("tracks_with_traffic", 100, 50),
						],
						[
							customEventRow("new_experiment_event", 100, 50),
							customEventRow("tracks_with_traffic", 40, 20),
						],
					],
				}
			);

			const customSignals = (await detectSignals(BASE_PARAMS, queryFn)).filter(
				(signal) => signal.metric === "custom_event_count"
			);

			expect(customSignals).toEqual([]);
		});
	});

	describe("low-traffic floor", () => {
		it("keeps rate changes when the site has enough sessions", async () => {
			const start = dayjs().subtract(27, "day");
			const rows = makeDailyRows(
				generateStableDays(
					28,
					{
						visitors: 100,
						sessions: 120,
						pageviews: 200,
						bounce_rate: 40,
						median_session_duration: 60,
					},
					start
				)
			);
			const queryFn = createMockQueryFn(
				rows,
				{
					bounce_rate: 60,
					median_session_duration: 120,
					sessions: 120,
				},
				{
					bounce_rate: 30,
					median_session_duration: 60,
					sessions: 120,
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "bounce_rate")).toBeDefined();
			expect(signals.find((s) => s.metric === "session_duration")).toMatchObject(
				{ label: "Median session duration" }
			);
		});
	});

	describe("vitals detection", () => {
		for (const [metricName, current, previous] of [
			["LCP", 4000, 2000],
			["INP", 300, 150],
		] as const) {
			it(`requires enough previous-period samples for ${metricName}`, async () => {
				const withPreviousSamples = createMockQueryFn(
					[],
					{ sessions: 1000 },
					{ sessions: 1000 },
					{
						vitals_overview: [
							{ metric_name: metricName, p75: current, samples: 100 },
							{ metric_name: metricName, p75: previous, samples: 10 },
						],
					}
				);
				const withoutPreviousSamples = createMockQueryFn(
					[],
					{ sessions: 1000 },
					{ sessions: 1000 },
					{
						vitals_overview: [
							{ metric_name: metricName, p75: current, samples: 100 },
							{ metric_name: metricName, p75: previous, samples: 9 },
						],
					}
				);

				const sufficient = await detectSignals(BASE_PARAMS, withPreviousSamples);
				const sparse = await detectSignals(BASE_PARAMS, withoutPreviousSamples);

				expect(
					sufficient.find(
						(signal) => signal.metric === metricName.toLowerCase()
					)
				).toBeDefined();
				expect(
					sparse.find((signal) => signal.metric === metricName.toLowerCase())
				).toBeUndefined();
			});
		}

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
	});

	describe("revenue detection", () => {
		for (const { name, current, previous, expected } of [
			{
				name: "flags new revenue appearing",
				current: { total_revenue: 100 },
				previous: { total_revenue: 0 },
				expected: { direction: "up" },
			},
			{
				name: "flags revenue drop above 30%",
				current: { total_revenue: 50 },
				previous: { total_revenue: 100 },
				expected: { direction: "down", deltaPercent: -50 },
			},
			{
				name: "skips small revenue changes",
				current: { total_revenue: 110 },
				previous: { total_revenue: 100 },
				expected: undefined,
			},
			{
				name: "skips a one-transaction revenue fluctuation",
				current: { total_revenue: 0, total_transactions: 0 },
				previous: { total_revenue: 4.99, total_transactions: 1 },
				expected: undefined,
			},
			{
				name: "keeps a high-volume revenue change below the amount floor",
				current: { total_revenue: 2, total_transactions: 8 },
				previous: { total_revenue: 10, total_transactions: 10 },
				expected: {},
			},
		] as const) {
			it(name, async () => {
				const signals = await detectSignals(
					BASE_PARAMS,
					createMockQueryFn([], {}, {}, {
						revenue_overview: [current, previous],
					})
				);
				const revenue = signals.find((signal) => signal.metric === "revenue");
				if (expected) {
					expect(revenue).toMatchObject(expected);
				} else {
					expect(revenue).toBeUndefined();
				}
			});
		}
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
	});

	describe("exact remeasurement", () => {
		it("returns the same error subject at zero after the fingerprint disappears", async () => {
			const prior = prepareInvestigation(
				{
					baseline: 5,
					current: 20,
					deltaPercent: 300,
					detectedAt: "2026-07-12",
					direction: "up",
					entityLabel: "TypeError: cart is undefined",
					label: "TypeError: cart is undefined",
					method: "wow",
					metric: "error_count",
					severity: "critical",
					subjectKey: "error:cart is undefined",
				},
				7
			).signal;
			const requests: Array<{
				filters?: unknown;
				from: string;
				to: string;
				type: string;
			}> = [];
			let calls = 0;
			const queryFn: QueryFn = async (request) => {
				requests.push(request);
				calls += 1;
				return calls === 1
					? []
					: [errorRow(20, 8, { name: "cart is undefined" })];
			};

			const current = await remeasureMetricSignal(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				prior,
				queryFn,
				dayjs("2026-07-20")
			);

			expect(current).toMatchObject({
				baseline: 20,
				current: 0,
				detectedAt: "2026-07-19",
				direction: "down",
				subjectKey: prior.signalKey,
			});
			expect(requests).toHaveLength(2);
			expect(requests.every((request) => request.type === "error_fingerprints")).toBe(
				true
			);
			expect(requests[0]?.filters).toEqual([
				{ field: "message", op: "eq", value: "cart is undefined" },
			]);
		});

		it("remeasures a long error by its full stored fingerprint", async () => {
			const fingerprint = "checkout failed: ".repeat(20);
			const prior = prepareInvestigation(
				{
					baseline: 5,
					current: 20,
					deltaPercent: 300,
					detectedAt: "2026-07-12",
					direction: "up",
					entityLabel: "Checkout error",
					label: "Checkout error",
					method: "wow",
					metric: "error_count",
					severity: "critical",
					subjectKey: `error:${fingerprint}`,
				},
				7
			).signal;
			const requests: Array<{ filters?: unknown }> = [];
			const queryFn: QueryFn = async (request) => {
				requests.push(request);
				return [];
			};

			const first = await remeasureMetricSignal(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				prior,
				queryFn,
				dayjs("2026-07-20")
			);

			expect(prior.signalKey).toHaveLength(160);
			expect(prior.entity.id).toBe(fingerprint);
			expect(first).toMatchObject({ deltaPercent: 0, severity: "info" });
			expect(requests[0]?.filters).toEqual([
				{ field: "message", op: "eq", value: fingerprint },
			]);

			if (!first) {
				throw new Error("Expected a remeasured error");
			}
			const nextPrior = prepareInvestigation(first, 7).signal;
			requests.length = 0;
			await remeasureMetricSignal(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				nextPrior,
				queryFn,
				dayjs("2026-07-27")
			);
			expect(nextPrior.entity.id).toBe(fingerprint);
			expect(requests[0]?.filters).toEqual([
				{ field: "message", op: "eq", value: fingerprint },
			]);
		});
	});
});
