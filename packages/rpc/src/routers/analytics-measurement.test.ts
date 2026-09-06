import { beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { createProcedureClient, os } from "@orpc/server";
import type { Context } from "../orpc";
import type {
	processFunnelAnalytics,
	processGoalAnalytics,
	getTotalWebsiteUsers,
} from "../lib/analytics-utils";

const procedure = os.$context<Context>();
const pass = procedure.middleware(({ next }) => next());
const cache = new Map<string, unknown>();
const withCache = async ({
	key,
	queryFn,
}: {
	key: string;
	queryFn: () => Promise<unknown>;
}) => {
	if (!cache.has(key)) cache.set(key, await queryFn());
	return cache.get(key);
};
const metrics: Awaited<ReturnType<typeof processFunnelAnalytics>> = {
	overall_conversion_rate: 60,
	total_users_entered: 200,
	total_users_completed: 120,
	avg_completion_time: 0,
	avg_completion_time_formatted: "0s",
	biggest_dropoff_step: 1,
	biggest_dropoff_rate: 40,
	duration_available: false,
	steps_analytics: [],
	error_insights: {
		available: false,
		total_errors: 0,
		sessions_with_errors: 0,
		dropoffs_with_errors: 0,
		error_correlation_rate: 0,
	},
};
const query = mock(
	async (..._args: Parameters<typeof processFunnelAnalytics>) => metrics
);
const goalQuery = mock(
	async (
		..._args: Parameters<typeof processGoalAnalytics>
	): Promise<Awaited<ReturnType<typeof processGoalAnalytics>>> => metrics
);
const referrerQuery = mock(
	async (..._args: Parameters<typeof processFunnelAnalytics>) => ({
		referrer_analytics: [],
	})
);
const entrants = mock(
	async (..._args: Parameters<typeof getTotalWebsiteUsers>) => 200
);
let goalsRouter: typeof import("./goals").goalsRouter;
let funnelsRouter: typeof import("./funnels").funnelsRouter;

beforeAll(async () => {
	mock.module("../orpc", () => ({
		publicProcedure: procedure,
		protectedProcedure: procedure,
		trackedProcedure: procedure,
	}));
	mock.module("../procedures/with-workspace", () => ({
		withWebsiteRead: pass,
		withWorkspace: pass,
		withPublicWorkspace: pass,
	}));
	mock.module("@databuddy/redis", () => ({
		redis: {},
		createDrizzleCache: () => ({ withCache }),
	}));
	mock.module("../lib/goals-cache", () => ({
		invalidateGoalsCache: async () => undefined,
	}));
	mock.module("../lib/funnels-cache", () => ({
		funnelCache: { withCache },
		invalidateFunnelsCache: async () => undefined,
	}));
	mock.module("../lib/analytics-utils", () => ({
		processGoalAnalytics: goalQuery,
		processFunnelAnalytics: query,
		getTotalWebsiteUsers: entrants,
		processFunnelAnalyticsByReferrer: referrerQuery,
		queryLinkVisitorIds: async () => [],
	}));
	mock.module("../middleware/track-mutation", () => ({
		setTrackProperties: () => undefined,
	}));
	mock.module("../types/billing", () => ({
		requireFeatureWithLimit: async () => undefined,
	}));
	mock.module("./insights", () => ({
		queueDefinitionChangeRechecks: async () => undefined,
	}));
	({ goalsRouter } = await import("./goals"));
	({ funnelsRouter } = await import("./funnels"));
});

beforeEach(() => {
	cache.clear();
	query.mockClear();
	goalQuery.mockClear();
	entrants.mockClear();
	referrerQuery.mockClear();
});

const savedFilter = { field: "country", operator: "equals", value: "US" };
const requestFilter = {
	field: "device_type",
	operator: "equals" as const,
	value: "mobile",
};
const period = {
	websiteId: "site-a",
	startDate: "2026-08-29",
	endDate: "2026-09-04",
};
function definition() {
	return {
		id: "definition-a",
		websiteId: "site-a",
		type: "PAGE_VIEW",
		target: "/workspace",
		name: "Signup",
		createdAt: new Date("2026-09-01T13:00:00Z"),
		ignoreHistoricData: true,
		filters: [savedFilter],
		steps: [
			{ type: "PAGE_VIEW", target: "/", name: "Landing" },
			{
				type: "PAGE_VIEW",
				target: "/workspace",
				name: "Signup",
				conditions: { plan: "paid" },
			},
		],
	};
}
function context(
	row: ReturnType<typeof definition>,
	kind: "goal" | "funnel"
): Context {
	const { type: _type, target: _target, ...funnel } = row;
	const saved = kind === "goal" ? row : funnel;
	return {
		db: {
			select: () => ({
				from: () => ({ where: () => ({ limit: async () => [saved] }) }),
			}),
		},
	} as Context;
}

for (const kind of ["goal", "funnel"] as const) {
	test(`${kind} returns the actual clipped query window and complete measured definition`, async () => {
		const row = definition();
		const measuredQuery = kind === "goal" ? goalQuery : query;
		const result =
			kind === "goal"
				? await createProcedureClient(goalsRouter.getAnalytics, {
						context: context(row, kind),
					})({ ...period, goalId: row.id, filters: [requestFilter] })
				: await createProcedureClient(funnelsRouter.getAnalytics, {
						context: context(row, kind),
					})({ ...period, funnelId: row.id });
		const filters =
			kind === "goal" ? [requestFilter, savedFilter] : [savedFilter];
		expect(result.measurement).toEqual({
			websiteId: period.websiteId,
			definitionId: row.id,
			startDate: "2026-09-01",
			endDate: period.endDate,
			definition:
				kind === "goal"
					? { type: row.type, target: row.target, filters }
					: {
							steps: row.steps,
							filters,
						},
		});
		expect(measuredQuery.mock.calls[0]?.[1]).toEqual(filters);
		expect(measuredQuery.mock.calls[0]?.[2]).toEqual({
			websiteId: period.websiteId,
			startDate: "2026-09-01",
			endDate: `${period.endDate} 23:59:59`,
		});
		if (kind === "goal") expect(goalQuery.mock.calls[0]?.[3]).toBe(200);
		if (kind === "goal")
			expect(entrants.mock.calls[0]).toEqual([
				period.websiteId,
				"2026-09-01",
				period.endDate,
				filters,
			]);
	});

	test(`${kind} cannot attach a changed definition to cached old measurements`, async () => {
		const row = definition();
		const measuredQuery = kind === "goal" ? goalQuery : query;
		const read = () =>
			kind === "goal"
				? createProcedureClient(goalsRouter.getAnalytics, {
						context: context(row, kind),
					})({ ...period, goalId: row.id })
				: createProcedureClient(funnelsRouter.getAnalytics, {
						context: context(row, kind),
					})({ ...period, funnelId: row.id });
		await read();
		await read();
		expect(measuredQuery).toHaveBeenCalledTimes(1);
		row.target = "/activated";
		row.steps[1]!.target = "/activated";
		await read();
		expect(measuredQuery).toHaveBeenCalledTimes(2);
		row.filters = [];
		await read();
		expect(measuredQuery).toHaveBeenCalledTimes(3);
		row.ignoreHistoricData = false;
		const result = await read();
		expect(result.measurement.startDate).toBe(period.startDate);
		expect(measuredQuery).toHaveBeenCalledTimes(4);
	});
}

for (const kind of ["goal", "funnel"] as const) {
	test(`${kind} cohort read preserves saved definition, clips dates and separates cached cohorts`, async () => {
		const row = definition();
		const cohort = {
			filters: [
				{
					field: "browser_name" as const,
					operator: "equals" as const,
					value: "Safari",
				},
			],
		};
		const measuredQuery = kind === "goal" ? goalQuery : query;
		const read = () =>
			kind === "goal"
				? createProcedureClient(goalsRouter.getAnalytics, {
						context: context(row, kind),
					})({ ...period, goalId: row.id, cohort })
				: createProcedureClient(funnelsRouter.getAnalytics, {
						context: context(row, kind),
					})({ ...period, funnelId: row.id, cohort });
		const result = await read();
		expect(result.cohort).toEqual(cohort);
		expect(result.savedDefinition.filters).toEqual([savedFilter]);
		expect(result.measurement.definition.filters).toContainEqual(
			cohort.filters[0]
		);
		expect(result.measurement.startDate).toBe("2026-09-01");
		if ("steps" in result.savedDefinition)
			expect(result.savedDefinition.steps).toEqual(row.steps);
		await read();
		expect(measuredQuery).toHaveBeenCalledTimes(1);
		cohort.filters[0]!.value = "Chrome";
		await read();
		expect(measuredQuery).toHaveBeenCalledTimes(2);
		expect(row.filters).toEqual([savedFilter]);
	});
}

// Synthetic added world: event marginals cannot establish ordered funnel completion.
// This validates the RPC/cache/read contract, not ClickHouse numerical execution.
test("browser cohort comparison exposes Safari loss and retains unchanged Chrome control", async () => {
	const row = definition();
	row.ignoreHistoricData = false;
	query.mockImplementation(async (_steps, filters, params) => {
		const browser = filters.find((f) => f.field === "browser_name")?.value;
		const previous = params.startDate === "2026-08-22";
		const completed =
			browser === "Safari"
				? previous
					? 100
					: 20
				: browser === "Chrome"
					? 80
					: previous
						? 180
						: 100;
		return {
			...metrics,
			total_users_entered: browser ? 500 : 1000,
			total_users_completed: completed,
			overall_conversion_rate: (completed / (browser ? 500 : 1000)) * 100,
		};
	});
	const read = createProcedureClient(funnelsRouter.getAnalytics, {
		context: context(row, "funnel"),
	});
	const output = [];
	for (const browser of ["Safari", "Chrome"] as const) {
		for (const window of [
			{ startDate: "2026-08-22", endDate: "2026-08-28" },
			{ startDate: "2026-08-29", endDate: "2026-09-04" },
		]) {
			const input = {
				...window,
				websiteId: "site-a",
				funnelId: row.id,
				cohort: {
					filters: [
						{
							field: "browser_name" as const,
							operator: "equals" as const,
							value: browser,
						},
					],
				},
			};
			const result = await read(input);
			output.push({ input, result });
		}
	}
	expect(output.map((v) => v.result.total_users_completed)).toEqual([
		100, 20, 80, 80,
	]);
	expect(output.every((v) => v.result.total_users_entered === 500)).toBe(true);
	expect(
		output.every((v) => v.result.savedDefinition.filters.length === 1)
	).toBe(true);
});

test("referrer cohorts return actual dates and saved definition with independently cached measurements", async () => {
	const row = definition();
	const cohort = {
		filters: [
			{
				field: "browser_name" as const,
				operator: "equals" as const,
				value: "Safari",
			},
		],
	};
	const read = createProcedureClient(funnelsRouter.getAnalyticsByReferrer, {
		context: context(row, "funnel"),
	});
	const input = { ...period, funnelId: row.id, cohort };
	const result = await read(input);
	expect(result.measurement.startDate).toBe("2026-09-01");
	expect(result.measurement.definition.filters).toEqual([
		savedFilter,
		...cohort.filters,
	]);
	expect(result.savedDefinition.filters).toEqual([savedFilter]);
	expect(result.cohort).toEqual(cohort);
	await read(input);
	expect(referrerQuery).toHaveBeenCalledTimes(1);
	cohort.filters[0]!.value = "Chrome";
	await read(input);
	expect(referrerQuery).toHaveBeenCalledTimes(2);
	row.steps[1]!.target = "/activated";
	await read(input);
	expect(referrerQuery).toHaveBeenCalledTimes(3);
});
