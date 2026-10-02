import { describe, expect, it } from "bun:test";
import dayjs from "dayjs";
import {
	changeOnsetEvidence,
	concentratedSegment,
	type DetectedSignal,
	type DetectSignalsParams,
	type QueryFn,
	detectSignals,
	estimateChangeOnset,
	estimateRecovery,
	freshCustomEventSignals,
	freshRevenueSignals,
	loadChangeOnset,
	loadRecovery,
	loadSegmentFinding,
	remeasureMetricSignal,
	segmentEvidence,
	segmentTable,
	shiftedSegment,
	wowWindow,
} from "./detection";
import { MAX_QUERY_ROWS } from "@databuddy/ai/query";
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

function routeContinuationRow(overrides: Record<string, unknown> = {}) {
	return {
		candidate_control_sessions: 72,
		candidate_exposed_sessions: 42,
		control_continued_sessions: 28,
		control_continuation_percent: 66.7,
		exposed_continued_sessions: 7,
		exposed_continuation_percent: 16.7,
		matched_control_sessions: 42,
		matched_exposed_sessions: 42,
		unmatched_control_sessions: 30,
		unmatched_exposed_sessions: 0,
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

		it.each([
			75, 150,
		])("needs a real sample before flagging a one-day bounce spike: %i sessions", async (sessions) => {
			const start = dayjs().subtract(28, "day");
			const rows = Array.from({ length: 28 }, (_, i) => ({
				date: start.add(i, "day").format("YYYY-MM-DD"),
				visitors: 100,
				sessions: i === 27 ? sessions : 120,
				pageviews: 200,
				bounce_rate: i === 27 ? 80 : 38 + (i % 3) * 2,
				median_session_duration: 60,
			}));

			const signals = await detectSignals(BASE_PARAMS, createMockQueryFn(rows));

			expect(
				signals.some((s) => s.metric === "bounce_rate" && s.method === "zscore")
			).toBe(sessions >= 100);
		});

		it("ignores normal variation below threshold", async () => {
			const start = dayjs().subtract(14, "day");
			const stable = generateStableDays(
				14,
				{
					visitors: 100,
					sessions: 120,
					pageviews: 200,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				start
			);

			const rows = makeDailyRows(stable);
			const queryFn = createMockQueryFn(rows);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const zscoreSignals = signals.filter((s) => s.method === "zscore");
			expect(zscoreSignals.length).toBe(0);
		});

		it("is not fooled by outlier days in the baseline", async () => {
			const start = dayjs().subtract(27, "day");
			const normal = generateStableDays(
				24,
				{
					visitors: 150,
					sessions: 170,
					pageviews: 300,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				start
			);

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

			const rows = makeDailyRows([
				...normal,
				...generateStableDays(
					3,
					{
						visitors: 150,
						sessions: 170,
						pageviews: 300,
						bounce_rate: 40,
						median_session_duration: 60,
					},
					start.add(24, "day")
				),
				latestDay,
			]);
			const queryFn = createMockQueryFn(rows);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			const visitorSignal = signals.find(
				(s) => s.metric === "visitors" && s.method === "zscore"
			);
			expect(visitorSignal).toBeUndefined();
		});

		it("ignores the current partial day when picking the latest", async () => {
			const start = dayjs().subtract(28, "day");
			const normal = generateStableDays(
				28,
				{
					visitors: 100,
					sessions: 120,
					pageviews: 200,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				start
			);

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
			const days = generateStableDays(
				5,
				{
					visitors: 100,
					sessions: 120,
					pageviews: 200,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				start
			);
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
			const rows = generateStableDays(
				22,
				{
					visitors: 100,
					sessions: 120,
					pageviews: 200,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				start
			);
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
		it("keeps the weekly comparison when a drop is sustained", async () => {
			const start = dayjs().subtract(28, "day");
			const rows = makeDailyRows(
				Array.from({ length: 28 }, (_, i) => ({
					date: start.add(i, "day").format("YYYY-MM-DD"),
					visitors: i < 20 ? 150 + (i % 3) : 5,
					sessions: i < 20 ? 170 + (i % 3) : 6,
					pageviews: i < 20 ? 300 + (i % 3) : 8,
					bounce_rate: 40,
					median_session_duration: 60,
				}))
			);
			const queryFn = createMockQueryFn(
				rows,
				{
					unique_visitors: 35,
					sessions: 42,
					pageviews: 56,
					bounce_rate: 40,
					median_session_duration: 60,
				},
				{
					unique_visitors: 1050,
					sessions: 1190,
					pageviews: 2100,
					bounce_rate: 40,
					median_session_duration: 60,
				}
			);

			const traffic = (await detectSignals(BASE_PARAMS, queryFn)).filter((s) =>
				["visitors", "sessions", "pageviews"].includes(s.metric)
			);

			expect(traffic).toHaveLength(1);
			expect(traffic[0]?.method).toBe("wow");
		});

		it("keeps highest delta per metric when both methods fire", async () => {
			const start = dayjs().subtract(28, "day");
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

			const lastRow = rows.at(-1);
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
				current: {
					sessions: 10,
					bounce_rate: 60,
					median_session_duration: 120,
				},
				previous: { sessions: 5, bounce_rate: 30, median_session_duration: 60 },
				metrics: ["bounce_rate", "session_duration"],
				detected: false,
			},
			{
				name: "filters rate metrics with less than 10pp absolute change",
				current: {
					sessions: 200,
					bounce_rate: 52,
					median_session_duration: 67,
				},
				previous: {
					sessions: 200,
					bounce_rate: 45,
					median_session_duration: 60,
				},
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
				{
					unique_visitors: 200,
					sessions: 240,
					pageviews: 400,
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
			expect(visitorSignals).toHaveLength(1);
			expect(visitorSignals[0]).toMatchObject({
				direction: "up",
				method: "wow",
			});
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
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 200 },
				{ sessions: 200 },
				{
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
				}
			);

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
			const queryFn = createMockQueryFn(
				[],
				{},
				{},
				{
					error_fingerprints: [
						errorRow(3, 3, { name: "Small error" }),
						errorRow(1, 1, { name: "Small error" }),
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "error_count")).toBeUndefined();
		});

		it("keeps a recovery measurement when the prior error reach was material", async () => {
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
			expect(
				signals.find((signal) => signal.metric === "error_count")
			).toMatchObject({ direction: "down" });
		});

		it("suppresses a current single-user spike even when the prior week had many affected users", async () => {
			const queryFn = createMockQueryFn(
				[],
				{},
				{},
				{
					error_fingerprints: [
						errorRow(168, 1, { name: "Looping error" }),
						errorRow(20, 8, { name: "Looping error" }),
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((s) => s.metric === "error_count")).toBeUndefined();
		});

		it("finds a stable error only when matched continuation shows material harm", async () => {
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 500 },
				{ sessions: 500 },
				{
					error_fingerprints: [
						errorRow(48, 36, { name: "Stable checkout error" }),
						errorRow(47, 35, { name: "Stable checkout error" }),
					],
					error_route_continuation_comparison: [
						routeContinuationRow(),
						routeContinuationRow(),
					],
				}
			);

			const signal = (await detectSignals(BASE_PARAMS, queryFn)).find(
				(candidate) => candidate.subjectKey === "error:Stable checkout error"
			);

			expect(signal).toMatchObject({
				baseline: 47,
				current: 48,
				deltaPercent: 0,
				direction: "up",
				method: "behavior",
				severity: "warning",
			});
			if (!signal) {
				throw new Error("Expected matched-continuation signal");
			}
			expect(prepareInvestigation(signal, 7).signal).toMatchObject({
				cohortMeasurement: {
					type: "matched_error_continuation",
				},
				sentiment: "negative",
			});
		});

		it("rotates bounded continuation probes weekly across stable errors", async () => {
			const requests: Parameters<QueryFn>[0][] = [];
			const errors = Array.from({ length: 7 }, (_, index) =>
				errorRow(40 + index, 30, { name: `Stable error ${index}` })
			);
			const queryFn: QueryFn = async (request) => {
				requests.push(request);
				if (request.type === "error_fingerprints") {
					return errors;
				}
				if (request.type === "summary_metrics") {
					return [{ sessions: 500 }];
				}
				if (request.type === "error_route_continuation_comparison") {
					return [routeContinuationRow()];
				}
				return [];
			};

			await detectSignals(BASE_PARAMS, queryFn, dayjs("2026-08-12"));
			await detectSignals(BASE_PARAMS, queryFn, dayjs("2026-08-19"));

			const fingerprintRequests = requests.filter(
				(request) => request.type === "error_fingerprints"
			);
			expect(fingerprintRequests).toHaveLength(4);
			expect(fingerprintRequests.every((request) => request.limit === 50)).toBe(
				true
			);
			const probes = requests
				.filter(
					(request) => request.type === "error_route_continuation_comparison"
				)
				.map((request) => request.filters?.[0]?.value);
			expect(probes).toHaveLength(6);
			expect(probes.slice(0, 3)).not.toEqual(probes.slice(3));
			expect(probes.slice(0, 2)).toEqual(probes.slice(3, 5));
		});

		it("always probes the highest-reach stable cohorts before rotating the tail", async () => {
			const requests: Parameters<QueryFn>[0][] = [];
			const errors = Array.from({ length: 11 }, (_, index) =>
				errorRow(100 - index, 100 - index, {
					name: `Stable error ${index}`,
				})
			);
			const materialFingerprint = "Stable error 1";
			const queryFn: QueryFn = async (request) => {
				requests.push(request);
				if (request.type === "error_fingerprints") {
					return errors;
				}
				if (request.type === "summary_metrics") {
					return [{ sessions: 500 }];
				}
				if (request.type === "error_route_continuation_comparison") {
					return [
						request.filters?.[0]?.value === materialFingerprint
							? routeContinuationRow()
							: routeContinuationRow({
									control_continued_sessions: 26,
									control_continuation_percent: 61.9,
									exposed_continued_sessions: 24,
									exposed_continuation_percent: 57.1,
								}),
					];
				}
				return [];
			};

			const signals = await detectSignals(
				BASE_PARAMS,
				queryFn,
				dayjs("2026-08-12")
			);

			expect(
				signals.find(
					(signal) => signal.subjectKey === `error:${materialFingerprint}`
				)
			).toMatchObject({ method: "behavior" });
			const probes = requests
				.filter(
					(request) => request.type === "error_route_continuation_comparison"
				)
				.map((request) => request.filters?.[0]?.value);
			expect(probes).toContain("Stable error 0");
			expect(probes).toContain(materialFingerprint);
			expect(probes).toHaveLength(3);
		});

		it("replaces a raw-count trend with material continuation evidence for the same error", async () => {
			const requests: Parameters<QueryFn>[0][] = [];
			let errorCalls = 0;
			const queryFn: QueryFn = async (request) => {
				requests.push(request);
				if (request.type === "error_fingerprints") {
					errorCalls += 1;
					return [
						errorCalls === 1
							? errorRow(60, 40, { name: "Trending checkout error" })
							: errorRow(20, 30, { name: "Trending checkout error" }),
					];
				}
				if (request.type === "summary_metrics") {
					return [{ sessions: 500 }];
				}
				if (request.type === "error_route_continuation_comparison") {
					return [routeContinuationRow()];
				}
				return [];
			};

			const signals = await detectSignals(BASE_PARAMS, queryFn);

			expect(
				signals.find(
					(signal) => signal.subjectKey === "error:Trending checkout error"
				)
			).toMatchObject({
				method: "behavior",
				severity: "warning",
			});
			expect(
				requests.some(
					(request) => request.type === "error_route_continuation_comparison"
				)
			).toBe(true);
		});

		it("keeps ordinary findings when an optional behavior probe fails", async () => {
			let summaryCalls = 0;
			const queryFn: QueryFn = async (request) => {
				if (request.type === "events_by_date") {
					return [];
				}
				if (request.type === "summary_metrics") {
					summaryCalls += 1;
					return [
						{
							pageviews: 100,
							sessions: 500,
							unique_visitors: summaryCalls === 1 ? 200 : 100,
						},
					];
				}
				if (request.type === "error_fingerprints") {
					return [errorRow(48, 36, { name: "Stable checkout error" })];
				}
				if (request.type === "error_route_continuation_comparison") {
					throw new Error("comparison unavailable");
				}
				return [];
			};

			const signals = await detectSignals(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				queryFn,
				dayjs("2026-07-23")
			);

			expect(signals.some((signal) => signal.metric === "visitors")).toBe(true);
			expect(signals.some((signal) => signal.method === "behavior")).toBe(
				false
			);
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
							customEventRow("comparison_viewed", 20, 12),
						],
						[
							customEventRow("checkout_completed", 30, 20),
							customEventRow("comparison_viewed", 10, 9),
						],
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
				signals.some((signal) => signal.entityId === "comparison_viewed")
			).toBe(false);
			expect(requests.find((request) => request.filters)?.filters).toEqual([
				{
					field: "event_name",
					op: "in",
					value: [disappeared, "checkout_completed", "comparison_viewed"],
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
			expect(
				signals.find((s) => s.metric === "session_duration")
			).toMatchObject({ label: "Median session duration" });
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

				const sufficient = await detectSignals(
					BASE_PARAMS,
					withPreviousSamples
				);
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

		it("ignores healthy vital movement in either direction", async () => {
			const queryFn = createMockQueryFn(
				[],
				{},
				{},
				{
					vitals_overview: [
						{ metric_name: "INP", p75: 147, samples: 100 },
						{ metric_name: "INP", p75: 104, samples: 100 },
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((signal) => signal.metric === "inp")).toBeUndefined();
		});

		it("keeps an improvement that remains above the health threshold", async () => {
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 1000 },
				{ sessions: 1000 },
				{
					vitals_overview: [
						[{ metric_name: "LCP", p75: 3000, samples: 100 }],
						[{ metric_name: "LCP", p75: 5000, samples: 100 }],
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((signal) => signal.metric === "lcp")).toMatchObject({
				direction: "down",
			});
		});

		it("finds persistently poor high-sample LCP even when it is flat", async () => {
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 1000 },
				{ sessions: 1000 },
				{
					vitals_overview: [
						[{ metric_name: "LCP", p75: 4984, samples: 5129 }],
						[{ metric_name: "LCP", p75: 5020, samples: 5000 }],
					],
				}
			);

			const signal = (await detectSignals(BASE_PARAMS, queryFn)).find(
				(candidate) => candidate.metric === "lcp"
			);

			expect(signal).toMatchObject({
				baseline: 5020,
				current: 4984,
				direction: "down",
				severity: "warning",
			});
			expect(signal?.definitionEvidence).toContain(
				"remained above the 4,000 ms poor threshold"
			);
		});

		it("requires a substantial sample on both periods for persistent LCP", async () => {
			const queryFn = createMockQueryFn(
				[],
				{ sessions: 1000 },
				{ sessions: 1000 },
				{
					vitals_overview: [
						[{ metric_name: "LCP", p75: 4984, samples: 100 }],
						[{ metric_name: "LCP", p75: 5020, samples: 99 }],
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((signal) => signal.metric === "lcp")).toBeUndefined();
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
			const queryFn = createMockQueryFn(
				[],
				{},
				{},
				{
					vitals_overview: [
						{ metric_name: "LCP", p75: 76_751_400, samples: 100 },
						{ metric_name: "LCP", p75: 2400, samples: 100 },
					],
				}
			);

			const signals = await detectSignals(BASE_PARAMS, queryFn);
			expect(signals.find((signal) => signal.metric === "lcp")).toBeUndefined();
		});
	});

	describe("revenue detection", () => {
		it("matches unchanged currencies regardless of row order", async () => {
			const usd = {
				currency: "USD",
				total_revenue: 10_000,
				total_transactions: 100,
			};
			const eur = {
				currency: "EUR",
				total_revenue: 15_000,
				total_transactions: 100,
			};
			const signals = await detectSignals(
				BASE_PARAMS,
				createMockQueryFn(
					[],
					{},
					{},
					{
						revenue_overview: [
							[eur, usd],
							[usd, eur],
						],
					}
				)
			);
			expect(signals.filter((signal) => signal.metric === "revenue")).toEqual(
				[]
			);
		});
		it("keeps separate currency identities through preparation and exact remeasurement", async () => {
			const params = { ...BASE_PARAMS, lookbackDays: 7 };
			const today = dayjs.utc("2026-09-05");
			const before = [
				{ currency: "USD", total_revenue: 10_000, total_transactions: 100 },
				{ currency: "EUR", total_revenue: 15_000, total_transactions: 100 },
			];
			const after = [
				{ ...before[1], total_revenue: 6000 },
				{ ...before[0], total_revenue: 6000 },
			];
			const signals = (
				await detectSignals(
					params,
					createMockQueryFn([], {}, {}, { revenue_overview: [after, before] }),
					today
				)
			).filter((signal) => signal.metric === "revenue");
			expect(signals.map((signal) => signal.subjectKey).sort()).toEqual([
				"revenue:EUR",
				"revenue:USD",
			]);
			expect(
				Object.fromEntries(
					signals.map((signal) => [signal.subjectKey, signal.severity])
				)
			).toEqual({ "revenue:EUR": "critical", "revenue:USD": "warning" });
			for (const candidate of signals) {
				const prepared = prepareInvestigation(candidate, 7);
				expect(prepared.signal.signalKey).toBe(candidate.subjectKey);
				expect(prepared.signal.entity.label).toBe(candidate.label);
				expect(prepared.evidence.join(" ")).toContain(
					"gross revenue from completed payments"
				);
				const calls: Parameters<QueryFn>[0][] = [];
				const response = createMockQueryFn(
					[],
					{},
					{},
					{ revenue_overview: [after, before] }
				);
				const query: QueryFn = (request, ...args) => {
					calls.push(request);
					return response(request, ...args);
				};
				const measured = await remeasureMetricSignal(
					params,
					prepared.signal,
					query,
					today
				);
				expect(measured).toMatchObject({
					subjectKey: candidate.subjectKey,
					current: 6000,
					baseline: candidate.baseline,
				});
				expect(calls.map(({ from, to }) => ({ from, to }))).toEqual([
					{ from: "2026-08-29", to: "2026-09-04" },
					{ from: "2026-08-22", to: "2026-08-28" },
				]);
				expect(calls.map((call) => call.filters)).toEqual(
					Array.from({ length: 2 }, () => [
						{
							field: "currency",
							op: "eq",
							value: prepared.signal.signalKey.slice(8),
						},
					])
				);
			}
		});
		it.each([
			"missing current",
			"missing previous",
		])("does not invent a zero for %s", async (scenario) => {
			const row = {
				currency: "USD",
				total_revenue: 10_000,
				total_transactions: 100,
			};
			const before = scenario === "missing previous" ? [] : [row];
			const after =
				scenario === "missing current" ? [] : [{ ...row, total_revenue: 1000 }];
			const signals = await detectSignals(
				BASE_PARAMS,
				createMockQueryFn([], {}, {}, { revenue_overview: [after, before] })
			);
			expect(signals.filter((signal) => signal.metric === "revenue")).toEqual(
				[]
			);
		});
		it.each([
			"revenue",
			"revenue:USD",
			"revenue:invalid",
		])("leaves unbound or missing-currency rechecks inconclusive: %s", async (signalKey) => {
			const signal = prepareInvestigation(
				{
					metric: "revenue",
					label: "USD revenue",
					current: 6000,
					baseline: 10_000,
					deltaPercent: -40,
					direction: "down",
					method: "wow",
					severity: "warning",
					detectedAt: "2026-09-04",
				},
				7
			).signal;
			const query = createMockQueryFn(
				[],
				{},
				{},
				{
					revenue_overview: [
						[{ currency: "EUR", total_revenue: 5000 }],
						[{ currency: "USD", total_revenue: 10_000 }],
					],
				}
			);
			expect(
				await remeasureMetricSignal(
					BASE_PARAMS,
					{ ...signal, signalKey },
					query
				)
			).toBeNull();
		});

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
					createMockQueryFn(
						[],
						{},
						{},
						{
							revenue_overview: [
								{ currency: "USD", ...current },
								{ currency: "USD", ...previous },
							],
						}
					)
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
	});

	describe("exact remeasurement", () => {
		function vitalPrior(metric: "lcp" | "inp") {
			const isLcp = metric === "lcp";
			return prepareInvestigation(
				{
					baseline: isLcp ? 5020 : 250,
					current: isLcp ? 4984 : 250,
					deltaPercent: isLcp ? -0.72 : 0,
					detectedAt: "2026-08-11",
					direction: isLcp ? "down" : "up",
					label: isLcp ? "Page load time (LCP)" : "Interaction speed (INP)",
					method: "wow",
					metric,
					severity: "warning",
				},
				7
			).signal;
		}

		it("does not reopen a persistent LCP recheck from flat low-sample data", async () => {
			const remeasured = await remeasureMetricSignal(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				vitalPrior("lcp"),
				createMockQueryFn(
					[],
					{},
					{},
					{
						vitals_overview: [
							[{ metric_name: "LCP", p75: 4500, samples: 10 }],
							[{ metric_name: "LCP", p75: 4450, samples: 10 }],
						],
					}
				),
				dayjs("2026-08-12")
			);

			expect(remeasured).toBeNull();
		});

		it("remeasures a persistently poor LCP when both periods have enough samples", async () => {
			const remeasured = await remeasureMetricSignal(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				vitalPrior("lcp"),
				createMockQueryFn(
					[],
					{},
					{},
					{
						vitals_overview: [
							[{ metric_name: "LCP", p75: 4984, samples: 5129 }],
							[{ metric_name: "LCP", p75: 5020, samples: 5000 }],
						],
					}
				),
				dayjs("2026-08-12")
			);

			expect(remeasured).toMatchObject({
				baseline: 5020,
				current: 4984,
				metric: "lcp",
			});
		});

		it("keeps materially worsening LCP rechecks at the normal sample floor", async () => {
			const remeasured = await remeasureMetricSignal(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				vitalPrior("lcp"),
				createMockQueryFn(
					[],
					{},
					{},
					{
						vitals_overview: [
							[{ metric_name: "LCP", p75: 3900, samples: 10 }],
							[{ metric_name: "LCP", p75: 2500, samples: 10 }],
						],
					}
				),
				dayjs("2026-08-12")
			);

			expect(remeasured).toMatchObject({
				direction: "up",
				metric: "lcp",
			});
		});

		it("keeps INP remeasurements at the existing minimum sample floor", async () => {
			const remeasured = await remeasureMetricSignal(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				vitalPrior("inp"),
				createMockQueryFn(
					[],
					{},
					{},
					{
						vitals_overview: [
							[{ metric_name: "INP", p75: 250, samples: 10 }],
							[{ metric_name: "INP", p75: 250, samples: 10 }],
						],
					}
				),
				dayjs("2026-08-12")
			);

			expect(remeasured).toMatchObject({
				baseline: 250,
				current: 250,
				metric: "inp",
			});
		});

		it("remeasures a matched-continuation error with its exact fingerprint", async () => {
			const prior = prepareInvestigation(
				{
					baseline: 47,
					current: 48,
					deltaPercent: 2.13,
					detectedAt: "2026-08-11",
					direction: "up",
					entityLabel: "Stable checkout error",
					label: "Stable checkout error",
					method: "behavior",
					metric: "error_count",
					cohortMeasurement: {
						type: "matched_error_continuation",
						controlContinuationPercent: 66.7,
						exposedContinuationPercent: 16.7,
						matchedSessions: 42,
					},
					severity: "warning",
					subjectKey: "error:Stable checkout error",
				},
				7
			).signal;
			const requests: Parameters<QueryFn>[0][] = [];
			let errorCalls = 0;
			const queryFn: QueryFn = async (request) => {
				requests.push(request);
				if (request.type === "error_fingerprints") {
					errorCalls += 1;
					return [
						errorCalls === 1
							? errorRow(48, 36, { name: "Stable checkout error" })
							: errorRow(47, 35, { name: "Stable checkout error" }),
					];
				}
				if (request.type === "error_route_continuation_comparison") {
					return [
						routeContinuationRow({
							control_continued_sessions: 9,
							control_continuation_percent: 21.4,
							exposed_continued_sessions: 8,
							exposed_continuation_percent: 19,
						}),
					];
				}
				return [];
			};

			const remeasured = await remeasureMetricSignal(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				prior,
				queryFn,
				dayjs("2026-08-12")
			);

			expect(remeasured).toMatchObject({
				direction: "down",
				method: "behavior",
				severity: "info",
				subjectKey: prior.signalKey,
			});
			if (!remeasured) {
				throw new Error("Expected matched-continuation remeasurement");
			}
			expect(prepareInvestigation(remeasured, 7).signal).toMatchObject({
				cohortMeasurement: { type: "matched_error_continuation" },
				sentiment: "neutral",
			});
			expect(requests.map((request) => request.type)).toEqual([
				"error_fingerprints",
				"error_fingerprints",
				"error_route_continuation_comparison",
			]);
			expect(requests.every((request) => request.filters)).toBe(true);
		});

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
					method: "behavior",
					metric: "error_count",
					cohortMeasurement: {
						type: "matched_error_continuation",
						controlContinuationPercent: 60,
						exposedContinuationPercent: 20,
						matchedSessions: 40,
					},
					severity: "warning",
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
			expect(
				requests.every((request) => request.type === "error_fingerprints")
			).toBe(true);
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

describe("independent commercial discovery", () => {
	const previous = {
		currency: "USD",
		total_revenue: 40_000,
		total_transactions: 400,
		refund_amount: -500,
		refund_count: 5,
		attributed_revenue: 38_000,
	};
	const changed = {
		...previous,
		refund_amount: -2500,
		refund_count: 25,
		attributed_revenue: 20_000,
	};
	const keys = ["attribution_rate:USD", "refund_amount:USD"];
	for (const [name, current, before, expected] of [
		[
			"flat gross does not hide refunds or attribution",
			changed,
			previous,
			keys,
		],
		[
			"material refund amounts are independent of unchanged refund counts",
			{
				...changed,
				refund_count: 5,
				attributed_revenue: previous.attributed_revenue,
			},
			previous,
			["refund_amount:USD"],
		],
		[
			"positive refund magnitudes retain compatibility",
			{ ...changed, refund_amount: 2500 },
			{ ...previous, refund_amount: 500 },
			keys,
		],
		[
			"invalid optional refunds do not suppress valid attribution",
			{ ...changed, refund_amount: Number.POSITIVE_INFINITY },
			previous,
			["attribution_rate:USD"],
		],
		[
			"invalid optional attribution does not suppress valid refunds",
			{ ...changed, attributed_revenue: "not measured" },
			previous,
			["refund_amount:USD"],
		],
		[
			"negative counts cannot create a refund finding",
			{ ...changed, refund_count: -25 },
			previous,
			["attribution_rate:USD"],
		],
		[
			"invalid gross suppresses ratios and relative materiality",
			{ ...changed, total_revenue: Number.NaN },
			previous,
			[],
		],
		["unchanged commercial activity stays quiet", previous, previous, []],
		[
			"sparse settlements do not establish a commercial alert",
			{ ...changed, total_transactions: 3 },
			{ ...previous, total_transactions: 3 },
			[],
		],
		[
			"missing refund counts preserve the independent attribution alert",
			{ ...changed, refund_count: null },
			previous,
			["attribution_rate:USD"],
		],
		[
			"missing attribution preserves the independent refund alert",
			{ ...changed, attributed_revenue: null },
			previous,
			["refund_amount:USD"],
		],
		[
			"absent measurements are not zero",
			{
				...changed,
				refund_amount: null,
				refund_count: null,
				attributed_revenue: null,
			},
			previous,
			[],
		],
		[
			"small refund movement stays quiet",
			{ ...previous, refund_amount: -520 },
			previous,
			[],
		],
		[
			"invalid attribution cannot become a coverage alert",
			{ ...changed, attributed_revenue: 50_000 },
			previous,
			["refund_amount:USD"],
		],
	] as const) {
		it(name, async () => {
			const signals = await detectSignals(
				{ ...BASE_PARAMS, lookbackDays: 7 },
				createMockQueryFn(
					[],
					{ sessions: 0 },
					{ sessions: 0 },
					{ revenue_overview: [current, before] }
				),
				dayjs("2026-09-07")
			);
			expect(signals.map((signal) => signal.subjectKey).sort()).toEqual(
				expected
			);
		});
	}
	it("matches currency rows and native numeric strings without inventing website traffic", async () => {
		const strings = (row: Record<string, unknown>) =>
			Object.fromEntries(
				Object.entries(row).map(([key, value]) => [
					key,
					typeof value === "number" ? String(value) : value,
				])
			);
		const euro = {
			...previous,
			currency: "EUR",
			total_revenue: 100_000,
			attributed_revenue: 90_000,
		};
		const signals = await detectSignals(
			{ ...BASE_PARAMS, lookbackDays: 7 },
			createMockQueryFn(
				[],
				{ sessions: 0 },
				{ sessions: 0 },
				{
					revenue_overview: [
						[euro, strings(changed)],
						[strings(previous), euro],
					],
				}
			),
			dayjs("2026-09-07")
		);
		expect(signals.map((signal) => signal.subjectKey).sort()).toEqual(keys);
		const prepared = signals.map((signal) => prepareInvestigation(signal, 7));
		expect(prepared.every((item) => item.investigationObjective)).toBe(true);
		expect(
			prepared.every((item) =>
				item.evidence.every(
					(value) => !value.includes("Machine-selected investigation objective")
				)
			)
		).toBe(true);
	});
	for (const [
		name,
		current,
		before,
		currentMagnitude,
		previousMagnitude,
		sentiment,
	] of [
		["worsening", changed, previous, 2500, 500, "negative"],
		["improving", previous, changed, 500, 2500, "positive"],
		["unchanged recheck", previous, previous, 500, 500, "neutral"],
	] as const) {
		it(`signed refund ${name} preserves amount, identity and sentiment on recheck`, async () => {
			const params = { ...BASE_PARAMS, lookbackDays: 7 };
			const detected = await detectSignals(
				params,
				createMockQueryFn(
					[],
					{},
					{},
					{ revenue_overview: [changed, previous] }
				),
				dayjs("2026-09-07")
			);
			const refund = detected.find(
				(signal) => signal.subjectKey === "refund_amount:USD"
			);
			if (!refund) {
				throw new Error("Missing signed refund candidate");
			}
			const prior = prepareInvestigation(refund, 7).signal;
			expect(prior.sentiment).toBe("negative");
			expect(prior.metric.current).toBe(2500);
			const measured = await remeasureMetricSignal(
				params,
				prior,
				createMockQueryFn([], {}, {}, { revenue_overview: [current, before] }),
				dayjs("2026-09-08")
			);
			if (!measured) {
				throw new Error("Missing exact refund remeasurement");
			}
			expect(measured.subjectKey).toBe("refund_amount:USD");
			expect(measured.current).toBe(currentMagnitude);
			expect(measured.baseline).toBe(previousMagnitude);
			expect(prepareInvestigation(measured, 7).signal.sentiment).toBe(
				sentiment
			);
		});
	}
});

function freshDates(lastDay: string, count = 28) {
	const end = dayjs.utc(lastDay);
	return Array.from({ length: count }, (_, index) =>
		end.subtract(count - 1 - index, "day").format("YYYY-MM-DD")
	);
}

function isWeekendDate(date: string) {
	const day = dayjs.utc(date).day();
	return day === 0 || day === 6;
}

function revenueDays(
	dates: string[],
	latest: { revenue: number; transactions: number },
	currency = "USD"
) {
	return dates.map((date, index) => {
		const weekend = isWeekendDate(date);
		return index === dates.length - 1
			? { date, currency, ...latest }
			: {
					date,
					currency,
					revenue: (weekend ? 400 : 1000) + (index % 3) * 20,
					transactions: (weekend ? 8 : 20) + (index % 2),
				};
	});
}

describe("next-day breaks", () => {
	const dates = freshDates("2026-09-29");

	it("flags a weekday revenue drop against comparable weekdays only", () => {
		const [signal] = freshRevenueSignals(
			revenueDays(dates, { revenue: 300, transactions: 6 }),
			dates
		);
		expect(signal).toMatchObject({
			current: 300,
			detectedAt: "2026-09-29",
			direction: "down",
			method: "zscore",
			metric: "revenue",
			subjectKey: "revenue:USD",
		});
		expect(signal?.baseline).toBeGreaterThanOrEqual(1000);
		expect(signal?.baselineDates?.some(isWeekendDate)).toBe(false);
		expect(signal?.baselineDates?.at(-1)).toBe("2026-09-28");
	});

	it("ignores one large order when payment volume is normal", () => {
		expect(
			freshRevenueSignals(
				revenueDays(dates, { revenue: 4000, transactions: 21 }),
				dates
			)
		).toEqual([]);
	});

	it("needs enough daily payments to call a break", () => {
		const sparse = revenueDays(dates, { revenue: 0, transactions: 0 }).map(
			(row, index) =>
				index === dates.length - 1 ? row : { ...row, transactions: 2 }
		);
		expect(freshRevenueSignals(sparse, dates)).toEqual([]);
	});

	it("never treats an unreadable currency row as a missing day", () => {
		const rows = revenueDays(dates, { revenue: 300, transactions: 6 });
		rows[5] = { ...rows[5], revenue: Number.NaN };
		expect(freshRevenueSignals(rows, dates)).toEqual([]);
	});

	const sessions = dates.map(() => 500);
	const eventDays = (latest: number) =>
		dates.map((date, index) => ({
			date,
			event_name: "checkout_completed",
			total_events: index === dates.length - 1 ? latest : 60 + (index % 4),
		}));

	it("flags an event that stops firing while traffic holds", () => {
		const [signal] = freshCustomEventSignals(eventDays(0), dates, sessions);
		expect(signal).toMatchObject({
			current: 0,
			deltaPercent: -100,
			direction: "down",
			entityId: "checkout_completed",
			method: "zscore",
			metric: "custom_event_count",
			subjectKey: "custom_event:checkout_completed",
		});
	});

	it("explains an event drop by a matching traffic drop", () => {
		const quiet = [...sessions.slice(0, -1), 100];
		expect(freshCustomEventSignals(eventDays(12), dates, quiet)).toEqual([]);
	});

	it("skips events too small to judge from one day", () => {
		const rows = eventDays(0).map((row) => ({
			...row,
			total_events: row.total_events === 0 ? 0 : 5,
		}));
		expect(freshCustomEventSignals(rows, dates, sessions)).toEqual([]);
	});

	function history() {
		return dates.map((date) => ({
			date,
			visitors: 400,
			sessions: 500,
			pageviews: 900,
			bounce_rate: 40,
			median_session_duration: 60,
		}));
	}

	it("reaches investigation from the full detector with its baseline envelope", async () => {
		const signals = await detectSignals(
			BASE_PARAMS,
			createMockQueryFn(
				history(),
				{ sessions: 3500 },
				{ sessions: 3500 },
				{
					revenue_time_series: [
						revenueDays(dates, { revenue: 300, transactions: 6 }),
						undefined,
					],
				}
			),
			dayjs.utc("2026-09-30")
		);
		const revenue = signals.find(
			(signal) => signal.subjectKey === "revenue:USD"
		);
		if (!revenue) {
			throw new Error("Missing next-day revenue break");
		}
		const prepared = prepareInvestigation(revenue, 7).signal;
		expect(prepared.period.current).toEqual({
			from: "2026-09-29",
			to: "2026-09-29",
		});
		expect(prepared.baselineDates?.[0]).toBe(prepared.period.previous.from);
	});

	it("drops a next-day break that contradicts the weekly direction for the same currency", async () => {
		const signals = await detectSignals(
			BASE_PARAMS,
			createMockQueryFn(
				history(),
				{ sessions: 3500 },
				{ sessions: 3500 },
				{
					revenue_overview: [
						[
							{
								currency: "USD",
								total_revenue: 20_000,
								total_transactions: 200,
							},
						],
						[
							{
								currency: "USD",
								total_revenue: 10_000,
								total_transactions: 100,
							},
						],
					],
					revenue_time_series: [
						revenueDays(dates, { revenue: 300, transactions: 6 }),
						undefined,
					],
				}
			),
			dayjs.utc("2026-09-30")
		);
		expect(
			signals.filter((signal) => signal.subjectKey === "revenue:USD")
		).toMatchObject([{ direction: "up", method: "wow" }]);
	});

	it("keeps the daily event read within the query row cap for a full baseline", async () => {
		const baseline = Array.from({ length: 200 }, (_, index) => ({
			name: `event_${index}`,
			total_events: 1000 - index,
			unique_users: 500,
			unique_sessions: 500,
		}));
		const requests: Parameters<QueryFn>[0][] = [];
		const mockQuery = createMockQueryFn(
			history(),
			{ sessions: 3500 },
			{ sessions: 3500 },
			{ custom_events: [baseline, baseline] }
		);
		await detectSignals(
			BASE_PARAMS,
			async (request) => {
				requests.push(request);
				return mockQuery(request);
			},
			dayjs.utc("2026-09-30")
		);
		const daily = requests.find(
			(request) => request.type === "custom_events_trends_by_event"
		);
		expect(daily?.limit).toBeLessThanOrEqual(MAX_QUERY_ROWS);
		expect(daily?.filters?.[0]?.value).toContain("event_0");
	});

	it("skips custom event breaks when the daily read was truncated", async () => {
		const baseline = [
			{
				name: "checkout_completed",
				total_events: 420,
				unique_users: 300,
				unique_sessions: 320,
			},
		];
		const detect = (rows: Record<string, unknown>[]) =>
			detectSignals(
				BASE_PARAMS,
				createMockQueryFn(
					history(),
					{ sessions: 3500 },
					{ sessions: 3500 },
					{
						custom_events: [baseline, baseline],
						custom_events_trends_by_event: [rows, undefined],
					}
				),
				dayjs.utc("2026-09-30")
			);
		const hasBreak = (signals: Awaited<ReturnType<typeof detect>>) =>
			signals.some(
				(signal) =>
					signal.subjectKey === "custom_event:checkout_completed" &&
					signal.method === "zscore"
			);
		expect(hasBreak(await detect(eventDays(0)))).toBe(true);
		expect(hasBreak(await detect(eventDays(0).concat(eventDays(0))))).toBe(
			false
		);
	});
});

function hourlyCounts(
	from: string,
	days: number,
	mean: (hour: string, index: number) => number
) {
	let seed = 7;
	return Array.from({ length: days * 24 }, (_, index) => {
		seed = (seed * 48_271) % 2_147_483_647;
		const hour = dayjs
			.utc(from)
			.add(index, "hour")
			.format("YYYY-MM-DD HH:00:00");
		const level = mean(hour, index);
		const jitter = (seed / 2_147_483_647 - 0.5) * 2 * Math.sqrt(level);
		return { hour, value: Math.max(0, Math.round(level + jitter)) };
	});
}

function diurnal(hour: string): number {
	return (
		30 + 20 * Math.sin(((Number(hour.slice(11, 13)) - 6) / 24) * 2 * Math.PI)
	);
}

describe("change onset", () => {
	const baseline = hourlyCounts("2026-08-17", 14, diurnal);

	it("places a stop at the hour it began", () => {
		const window = hourlyCounts("2026-08-31", 2, (hour, index) =>
			index >= 20 ? 0 : diurnal(hour)
		);
		const onset = estimateChangeOnset({
			baseline,
			direction: "down",
			flaggedFrom: 24,
			window,
		});
		expect(onset).not.toBeNull();
		expect(onset?.earliest).toBeLessThanOrEqual(20);
		expect(onset?.latest).toBeGreaterThanOrEqual(20);
		expect((onset?.latest ?? 0) - (onset?.earliest ?? 0)).toBeLessThanOrEqual(
			2
		);
		expect(onset?.ongoing).toBe(true);
		expect(onset?.observed).toBe(0);
	});

	it("bounds a spike that recovered", () => {
		const quiet = hourlyCounts("2026-08-17", 14, () => 0.3);
		const window = hourlyCounts("2026-08-31", 2, (_hour, index) =>
			index >= 31 && index < 35 ? 30 : 0.3
		);
		const onset = estimateChangeOnset({
			baseline: quiet,
			direction: "up",
			flaggedFrom: 24,
			window,
		});
		expect(onset?.earliest).toBeLessThanOrEqual(31);
		expect(onset?.latest).toBeGreaterThanOrEqual(31);
		expect(onset?.recoveredBy).toBeGreaterThanOrEqual(35);
		expect(onset?.recoveredBy).toBeLessThanOrEqual(37);
		expect(onset?.ongoing).toBe(false);
	});

	it("reports no onset for a gradual decline", () => {
		const window = hourlyCounts(
			"2026-08-31",
			2,
			(hour, index) => diurnal(hour) * (1 - (0.6 * index) / 47)
		);
		expect(
			estimateChangeOnset({
				baseline,
				direction: "down",
				flaggedFrom: 24,
				window,
			})
		).toBeNull();
	});

	it("does not read the end of a burst as a drop", () => {
		const window = hourlyCounts("2026-08-31", 2, (hour, index) =>
			index >= 4 && index < 13 ? diurnal(hour) * 5 : diurnal(hour)
		);
		expect(
			estimateChangeOnset({
				baseline,
				direction: "down",
				flaggedFrom: 24,
				window,
			})
		).toBeNull();
	});

	it("does not read recovery from an outage as a rise", () => {
		const window = hourlyCounts("2026-08-31", 2, (hour, index) =>
			index < 20 ? 0 : diurnal(hour)
		);
		expect(
			estimateChangeOnset({
				baseline,
				direction: "up",
				flaggedFrom: 24,
				window,
			})
		).toBeNull();
	});

	it("keeps the weekend's lower traffic out of the onset", () => {
		const weekly = (hour: string) =>
			[0, 6].includes(dayjs.utc(hour).day()) ? 12 : 40;
		const window = hourlyCounts("2026-09-04", 2, weekly);
		expect(
			estimateChangeOnset({
				baseline: hourlyCounts("2026-08-21", 14, weekly),
				direction: "down",
				flaggedFrom: 24,
				window,
			})
		).toBeNull();
	});

	const stoppedEvent: DetectedSignal = {
		baseline: 6400,
		baselineDates: [
			"2026-08-21",
			"2026-08-24",
			"2026-08-25",
			"2026-08-26",
			"2026-08-27",
			"2026-08-28",
		],
		current: 0,
		deltaPercent: -100,
		detectedAt: "2026-09-01",
		direction: "down",
		entityId: "link_created",
		entityLabel: "link_created",
		label: "link_created events",
		method: "zscore",
		metric: "custom_event_count",
		severity: "critical",
		subjectKey: "custom_event:link_created",
	};

	it("reads the subject hourly in the site's timezone", async () => {
		const timezone = "America/New_York";
		const requests: Parameters<QueryFn>[0][] = [];
		const query: QueryFn = async (request) => {
			requests.push(request);
			const rows: Record<string, unknown>[] = [];
			for (
				let instant = dayjs.tz(`${request.from} 00:00`, timezone);
				instant.isBefore(dayjs.tz(`${request.to} 23:59`, timezone));
				instant = instant.add(1, "hour")
			) {
				const date = instant.tz(timezone).format("YYYY-MM-DD HH:00:00");
				if (date < "2026-08-31 20:00:00") {
					rows.push({
						date,
						event_name: "link_created",
						total_events: Math.round(diurnal(date) * 10),
					});
				}
			}
			return rows;
		};
		const { signal } = prepareInvestigation(stoppedEvent, 7);

		const onset = await loadChangeOnset(
			{ signal, timezone, websiteId: "site-1" },
			query
		);

		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			filters: [{ field: "event_name", op: "eq", value: "link_created" }],
			from: "2026-08-17",
			timeUnit: "hour",
			to: "2026-09-01",
			type: "custom_events_trends_by_event",
		});
		expect(onset).toMatchObject({
			earliest: "2026-08-31 20:00:00",
			latest: "2026-08-31 20:00:00",
			ongoingThrough: "2026-09-01",
			observed: 0,
		});
		expect(onset ? changeOnsetEvidence(onset) : "").toContain(
			"between 20:00 and 21:00 on 2026-08-31 (America/New_York)"
		);
	});

	it("reads payments hourly in the break's currency", async () => {
		const requests: Parameters<QueryFn>[0][] = [];
		const query: QueryFn = async (request) => {
			requests.push(request);
			const rows: Record<string, unknown>[] = [];
			for (
				let instant = dayjs.utc(`${request.from} 00:00`);
				instant.isBefore(dayjs.utc(`${request.to} 23:59`));
				instant = instant.add(1, "hour")
			) {
				const date = instant.format("YYYY-MM-DD HH:00:00");
				if (date < "2026-08-31 20:00:00") {
					rows.push({
						currency: "EUR",
						date,
						transactions: Math.round(diurnal(date) / 3),
					});
				}
			}
			return rows;
		};
		const { signal } = prepareInvestigation(
			{
				...stoppedEvent,
				baseline: 4200,
				current: 0,
				entityId: undefined,
				entityLabel: undefined,
				label: "Revenue",
				metric: "revenue",
				subjectKey: "revenue:EUR",
			},
			7
		);

		const onset = await loadChangeOnset(
			{ signal, timezone: "UTC", websiteId: "site-1" },
			query
		);

		expect(requests[0]).toMatchObject({
			filters: [{ field: "currency", op: "eq", value: "EUR" }],
			timeUnit: "hour",
			type: "revenue_time_series",
		});
		expect(onset).toMatchObject({
			earliest: "2026-08-31 20:00:00",
			noun: "payments",
		});
	});

	it("skips subjects without an hourly count", async () => {
		const { signal } = prepareInvestigation(
			{
				...stoppedEvent,
				baseline: 40,
				current: 62,
				deltaPercent: 55,
				direction: "up",
				label: "Bounce rate",
				metric: "bounce_rate",
				subjectKey: undefined,
			},
			7
		);
		const query: QueryFn = async () => {
			throw new Error("Unexpected hourly read");
		};
		expect(
			await loadChangeOnset(
				{ signal, timezone: "UTC", websiteId: "site-1" },
				query
			)
		).toBeNull();
	});
});

function segmentRows(
	countField: string,
	rows: [dimension: string, value: string, count: number, sessions?: number][]
) {
	return rows.map(([dimension, value, count, sessions]) => ({
		dimension,
		value,
		[countField]: count,
		sessions: sessions ?? count,
	}));
}

const steadyTraffic = segmentRows("pageviews", [
	["browser", "Chrome", 6000],
	["browser", "Safari", 1200],
	["browser", "Firefox", 800],
	["browser_version", "Chrome 153", 6000],
	["browser_version", "Safari 18", 700],
	["browser_version", "Safari 17", 500],
	["browser_version", "Firefox 155", 800],
	["os", "Windows", 4000],
	["os", "macOS", 2800],
	["os", "iOS", 1200],
	["device", "Desktop", 6800],
	["device", "Mobile", 1200],
	["country", "US", 3000],
	["country", "Germany", 5000],
]);

describe("segment localization", () => {
	it("names the narrowest segment that holds an error", () => {
		const errors = segmentTable(
			segmentRows("errors", [
				["browser", "Safari", 48],
				["browser", "Chrome", 2],
				["browser_version", "Safari 18", 46],
				["browser_version", "Safari 17", 2],
				["browser_version", "Chrome 153", 2],
				["os", "iOS", 30],
				["os", "macOS", 20],
				["device", "Mobile", 30],
				["device", "Desktop", 20],
				["country", "US", 25],
				["country", "Germany", 25],
			]),
			"errors"
		);
		const concentration = concentratedSegment(
			errors,
			segmentTable(steadyTraffic, "pageviews")
		);
		expect(concentration).toMatchObject({
			dimension: "browser_version",
			subjectSessions: 46,
			totalSubjectSessions: 50,
			value: "Safari 18",
		});
		expect(
			concentration
				? segmentEvidence({ concentration, kind: "concentration" })
				: ""
		).toBe(
			"92% of the sessions with this error (46 of 50) used Safari 18, compared with 9% of all sessions in the same period."
		);
	});

	it("finds nothing when an error follows overall traffic", () => {
		const errors = segmentTable(
			segmentRows("errors", [
				["browser", "Chrome", 75],
				["browser", "Safari", 15],
				["browser", "Firefox", 10],
				["os", "Windows", 50],
				["os", "macOS", 35],
				["os", "iOS", 15],
				["device", "Desktop", 85],
				["device", "Mobile", 15],
			]),
			"errors"
		);
		expect(
			concentratedSegment(errors, segmentTable(steadyTraffic, "pageviews"))
		).toBeNull();
	});

	it("localizes a drop that one browser carries", () => {
		const after = segmentTable(
			segmentRows("pageviews", [
				["browser", "Chrome", 5900],
				["browser", "Safari", 60],
				["browser", "Firefox", 790],
				["os", "Windows", 3950],
				["os", "macOS", 2000],
				["os", "iOS", 800],
				["device", "Desktop", 6000],
				["device", "Mobile", 750],
			]),
			"pageviews"
		);
		const shift = shiftedSegment({
			after,
			afterDays: 7,
			before: segmentTable(steadyTraffic, "pageviews"),
			beforeDays: 7,
			direction: "down",
		});
		expect(shift).toMatchObject({ dimension: "browser", value: "Safari" });
		const evidence = (
			before: { from: string; to: string },
			after: { from: string; to: string }
		) =>
			shift
				? segmentEvidence({
						after,
						before,
						direction: "down",
						kind: "shift",
						noun: "Pageviews",
						shift,
					})
				: "";
		expect(
			evidence(
				{ from: "2026-09-17", to: "2026-09-23" },
				{ from: "2026-09-24", to: "2026-09-30" }
			)
		).toBe(
			"Pageviews from Safari fell 95% (from about 171 to 9 a day), 91% of the whole drop, while everything else changed -2%."
		);
		expect(
			evidence(
				{ from: "2026-09-28", to: "2026-09-28" },
				{ from: "2026-09-29", to: "2026-09-29" }
			)
		).toBe(
			"Pageviews from Safari fell 95% (from 171 on 2026-09-28 to 9 on 2026-09-29), 91% of the whole drop, while everything else changed -2%."
		);
	});

	it("finds nothing when every segment falls alike", () => {
		const halved = segmentTable(
			steadyTraffic.map((row) => ({
				...row,
				pageviews: row.pageviews / 2,
			})),
			"pageviews"
		);
		expect(
			shiftedSegment({
				after: halved,
				afterDays: 7,
				before: segmentTable(steadyTraffic, "pageviews"),
				beforeDays: 7,
				direction: "down",
			})
		).toBeNull();
	});

	it("reads a browser version rollover as no change", () => {
		const before = segmentTable(
			segmentRows("pageviews", [
				["browser", "Chrome", 6000],
				["browser_version", "Chrome 151", 5000],
				["browser_version", "Chrome 152", 1000],
			]),
			"pageviews"
		);
		const after = segmentTable(
			segmentRows("pageviews", [
				["browser", "Chrome", 5400],
				["browser_version", "Chrome 151", 100],
				["browser_version", "Chrome 152", 5300],
			]),
			"pageviews"
		);
		expect(
			shiftedSegment({
				after,
				afterDays: 7,
				before,
				beforeDays: 7,
				direction: "down",
			})
		).toBeNull();
	});

	it("does not credit one segment when the rest rose from nothing", () => {
		expect(
			shiftedSegment({
				after: segmentTable(steadyTraffic, "pageviews"),
				afterDays: 7,
				before: segmentTable(
					segmentRows("pageviews", [["device", "Desktop", 30]]),
					"pageviews"
				),
				beforeDays: 7,
				direction: "up",
			})
		).toBeNull();
	});

	it("does not localize onto the segment that is nearly the whole audience", () => {
		const before = segmentTable(
			segmentRows("events", [
				["browser", "Chrome", 400, 200],
				["browser", "Firefox", 30, 25],
			]),
			"events"
		);
		const after = segmentTable(
			segmentRows("events", [
				["browser", "Chrome", 20, 12],
				["browser", "Firefox", 30, 25],
			]),
			"events"
		);
		expect(
			shiftedSegment({
				after,
				afterDays: 7,
				before,
				beforeDays: 7,
				direction: "down",
			})
		).toBeNull();
	});

	it("does not localize a change onto a handful of sessions", () => {
		const before = segmentTable(
			segmentRows("events", [
				["country", "Brazil", 49, 3],
				["country", "Germany", 42, 30],
			]),
			"events"
		);
		const after = segmentTable(
			segmentRows("events", [["country", "Germany", 40, 29]]),
			"events"
		);
		expect(
			shiftedSegment({
				after,
				afterDays: 7,
				before,
				beforeDays: 7,
				direction: "down",
			})
		).toBeNull();
	});

	it("compares a next-day change with its most recent comparable day", async () => {
		const { signal } = prepareInvestigation(
			{
				baseline: 1000,
				baselineDates: [
					"2026-09-21",
					"2026-09-22",
					"2026-09-23",
					"2026-09-24",
					"2026-09-25",
					"2026-09-28",
				],
				current: 600,
				deltaPercent: -40,
				detectedAt: "2026-09-29",
				direction: "down",
				label: "Pageviews",
				method: "zscore",
				metric: "pageviews",
				severity: "warning",
			},
			7
		);
		const requests: Parameters<QueryFn>[0][] = [];
		const query: QueryFn = async (request) => {
			requests.push(request);
			return steadyTraffic;
		};

		await loadSegmentFinding(
			{ signal, timezone: "UTC", websiteId: "site-1" },
			query
		);

		expect(requests.map(({ from, to }) => [from, to])).toEqual([
			["2026-09-28", "2026-09-28"],
			["2026-09-29", "2026-09-29"],
		]);
	});

	it("merges country codes with country names", () => {
		const table = segmentTable(
			segmentRows("pageviews", [
				["country", "US", 30],
				["country", "United States", 20],
			]),
			"pageviews"
		);
		expect([...(table.get("country")?.entries() ?? [])]).toEqual([
			["United States", { count: 50, sessions: 50 }],
		]);
	});

	it("compares error sessions with all sessions in the flagged period", async () => {
		const { signal } = prepareInvestigation(
			{
				baseline: 0,
				current: 50,
				deltaPercent: 100,
				detectedAt: "2026-09-30",
				direction: "up",
				entityId: "TypeError: x is undefined",
				entityLabel: "TypeError: x is undefined",
				label: "TypeError: x is undefined",
				method: "wow",
				metric: "error_count",
				severity: "warning",
				subjectKey: "error:TypeError: x is undefined",
			},
			7
		);
		const requests: Parameters<QueryFn>[0][] = [];
		const query: QueryFn = async (request) => {
			requests.push(request);
			return request.type === "error_segments"
				? segmentRows("errors", [
						["browser", "Safari", 48],
						["browser", "Chrome", 2],
					])
				: steadyTraffic;
		};

		const finding = await loadSegmentFinding(
			{ signal, timezone: "UTC", websiteId: "site-1" },
			query
		);

		expect(
			requests.map(({ filters, from, to, type }) => ({
				filters,
				from,
				to,
				type,
			}))
		).toEqual([
			{
				filters: [
					{ field: "message", op: "eq", value: "TypeError: x is undefined" },
				],
				from: "2026-09-24",
				to: "2026-09-30",
				type: "error_segments",
			},
			{
				filters: [],
				from: "2026-09-24",
				to: "2026-09-30",
				type: "traffic_segments",
			},
		]);
		expect(finding).toMatchObject({
			concentration: { dimension: "browser", value: "Safari" },
			kind: "concentration",
		});
	});
});

describe("recovery", () => {
	const baseline = hourlyCounts("2026-08-17", 14, diurnal);

	it("confirms a recovery that held for a full day", () => {
		const recovery = estimateRecovery({
			baseline,
			direction: "down",
			window: hourlyCounts("2026-08-31", 4, (hour, index) =>
				index < 30 ? 0 : diurnal(hour)
			).slice(0, 78),
		});
		expect(recovery).toMatchObject({
			brokenCount: 0,
			heldHours: 48,
			kind: "recovered",
		});
		expect(
			recovery?.kind === "recovered" ? recovery.recoveredAt : null
		).toBeGreaterThanOrEqual(30);
	});

	it("reports a break that is still in effect", () => {
		expect(
			estimateRecovery({
				baseline,
				direction: "down",
				window: hourlyCounts("2026-08-31", 3, () => 0),
			})
		).toMatchObject({ kind: "ongoing", observed: 0 });
	});

	it("waits until a recovery has held for a full day", () => {
		expect(
			estimateRecovery({
				baseline,
				direction: "down",
				window: hourlyCounts("2026-08-31", 3, (hour, index) =>
					index < 60 ? 0 : diurnal(hour)
				),
			})
		).not.toMatchObject({ kind: "recovered" });
	});

	it("confirms that a new error stopped", () => {
		const window = hourlyCounts("2026-08-31", 3, (_hour, index) =>
			index < 6 ? 30 : 0
		).slice(0, 54);
		expect(
			estimateRecovery({
				baseline: hourlyCounts("2026-08-17", 14, () => 0),
				direction: "up",
				window,
			})
		).toMatchObject({
			brokenCount: window
				.slice(0, 6)
				.reduce((total, point) => total + point.value, 0),
			heldHours: 48,
			kind: "recovered",
		});
	});

	it("does not call a new error still in effect on a remnant of its first day", () => {
		const window = Array.from({ length: 144 }, (_, index) => ({
			hour: dayjs
				.utc("2026-08-31")
				.add(index, "hour")
				.format("YYYY-MM-DD HH:00:00"),
			value: index < 24 ? 2 : index >= 120 && index % 4 === 0 ? 1 : 0,
		}));
		expect(
			estimateRecovery({
				baseline: hourlyCounts("2026-08-17", 14, () => 0),
				direction: "up",
				window,
			})
		).toBeNull();
	});

	it("does not call a rare error still in effect on one occurrence", () => {
		const points = (
			from: string,
			hours: number,
			at: (index: number) => number
		) =>
			Array.from({ length: hours }, (_, index) => ({
				hour: dayjs.utc(from).add(index, "hour").format("YYYY-MM-DD HH:00:00"),
				value: at(index),
			}));
		expect(
			estimateRecovery({
				baseline: points("2026-08-17", 14 * 24, (index) =>
					index % 112 === 0 ? 1 : 0
				),
				direction: "up",
				window: points("2026-08-31", 72, (index) =>
					index === 3 || index === 9 || index === 60 ? 1 : 0
				),
			})
		).toBeNull();
	});

	const spikeSignal = prepareInvestigation(
		{
			baseline: 0,
			current: 160,
			deltaPercent: 100,
			detectedAt: "2026-09-22",
			direction: "up",
			entityId: "TypeError: x is undefined",
			entityLabel: "TypeError: x is undefined",
			label: "TypeError: x is undefined",
			method: "wow",
			metric: "error_count",
			severity: "warning",
			subjectKey: "error:TypeError: x is undefined",
		},
		7
	).signal;

	function hourlyQuery(trafficStopsWithErrors: boolean): QueryFn {
		return async (request) => {
			const rows: Record<string, unknown>[] = [];
			for (
				let instant = dayjs.utc(`${request.from} 00:00`);
				instant.isBefore(dayjs.utc(`${request.to} 23:59`));
				instant = instant.add(1, "hour")
			) {
				const date = instant.format("YYYY-MM-DD HH:00:00");
				const spike =
					date >= "2026-09-22 02:00:00" && date < "2026-09-22 06:00:00";
				if (request.type === "error_trends" && spike) {
					rows.push({ date, errors: 40 });
				}
				if (
					request.type === "events_by_date" &&
					!(trafficStopsWithErrors && date >= "2026-09-22 06:00:00")
				) {
					rows.push({ date, pageviews: Math.round(diurnal(date)) });
				}
			}
			return rows;
		};
	}

	it("confirms an error stopped while traffic continued", async () => {
		const result = await loadRecovery(
			{
				prior: spikeSignal,
				through: "2026-09-25",
				timezone: "UTC",
				websiteId: "site-1",
			},
			hourlyQuery(false)
		);
		expect(result?.recovery).toMatchObject({
			brokenCount: 160,
			recoveredAt: "2026-09-22 06:00:00",
			state: "recovered",
		});
	});

	it("does not call an error recovered when traffic stopped with it", async () => {
		expect(
			await loadRecovery(
				{
					prior: spikeSignal,
					through: "2026-09-25",
					timezone: "UTC",
					websiteId: "site-1",
				},
				hourlyQuery(true)
			)
		).toBeNull();
	});
});
