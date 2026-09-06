import { beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { createProcedureClient, os } from "@orpc/server";
import type { Context } from "../orpc";
import type { processFunnelAnalytics } from "../lib/analytics-utils";

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
const entrants = mock(async (..._args: unknown[]) => 200);
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
		processGoalAnalytics: query,
		processFunnelAnalytics: query,
		getTotalWebsiteUsers: entrants,
		processFunnelAnalyticsByReferrer: query,
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
	entrants.mockClear();
});

const savedFilter = { field: "country", operator: "equals", value: "US" };
const requestFilter = {
	field: "device",
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
			{ type: "PAGE_VIEW", target: "/workspace", name: "Signup" },
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
	test(`${kind} returns the actual clipped query window and excludes cosmetic fields`, async () => {
		const row = definition();
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
							steps: row.steps.map(({ type, target }) => ({ type, target })),
							filters,
						},
		});
		expect(query.mock.calls[0]?.[1]).toEqual(filters);
		expect(query.mock.calls[0]?.[2]).toEqual({
			websiteId: period.websiteId,
			startDate: "2026-09-01",
			endDate: `${period.endDate} 23:59:59`,
		});
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
		expect(query).toHaveBeenCalledTimes(1);
		row.target = "/activated";
		row.steps[1]!.target = "/activated";
		await read();
		expect(query).toHaveBeenCalledTimes(2);
		row.filters = [];
		await read();
		expect(query).toHaveBeenCalledTimes(3);
		row.ignoreHistoricData = false;
		const result = await read();
		expect(result.measurement.startDate).toBe(period.startDate);
		expect(query).toHaveBeenCalledTimes(4);
	});
}
