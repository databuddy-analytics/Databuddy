import { and, db, eq, isNull, sql } from "@databuddy/db";
import {
	type DataFilter,
	funnelDefinitions,
	type FunnelStep,
	goals,
} from "@databuddy/db/schema";
import {
	type AnalyticsStep,
	getTotalWebsiteUsers,
	processFunnelAnalytics,
	processGoalAnalytics,
} from "@databuddy/rpc/analytics-utils";
import dayjs from "dayjs";
import {
	type DetectedSignal,
	type DetectSignalsParams,
	makeWowSignal,
	safeDeltaPercent,
	wowWindow,
} from "./detection";

const FUNNEL_CONVERSION_WOW_THRESHOLD = 20;
const FUNNEL_MIN_ENTRANTS = 30;
const GOAL_CONVERSION_WOW_THRESHOLD = 20;
const GOAL_MIN_COMPLETIONS = 10;
const MAX_DEFINITIONS = 10;

export interface FunnelDef {
	filters: DataFilter[] | null;
	id: string;
	name: string;
	steps: FunnelStep[];
}

export interface GoalDef {
	filters: DataFilter[] | null;
	id: string;
	name: string;
	target: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
}

export interface PeriodRange {
	from: string;
	to: string;
}

export interface FunnelConversion {
	entrants: number;
	rate: number;
}

export interface GoalConversion {
	completions: number;
	rate: number;
}

export interface FunnelGoalDeps {
	fetchFunnels: () => Promise<FunnelDef[]>;
	fetchGoals: () => Promise<GoalDef[]>;
	funnelConversion: (
		funnel: FunnelDef,
		range: PeriodRange
	) => Promise<FunnelConversion>;
	goalConversion: (
		goal: GoalDef,
		range: PeriodRange
	) => Promise<GoalConversion>;
}

function toAnalyticsSteps(steps: FunnelStep[]): AnalyticsStep[] {
	return steps.map((step, index) => ({
		step_number: index + 1,
		type: step.type === "PAGE_VIEW" ? "PAGE_VIEW" : "EVENT",
		target: step.target,
		name: step.name,
	}));
}

export function defaultFunnelGoalDeps(websiteId: string): FunnelGoalDeps {
	return {
		fetchFunnels: () =>
			db
				.select({
					id: funnelDefinitions.id,
					name: funnelDefinitions.name,
					steps: funnelDefinitions.steps,
					filters: funnelDefinitions.filters,
				})
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.websiteId, websiteId),
						eq(funnelDefinitions.isActive, true),
						isNull(funnelDefinitions.deletedAt),
						sql`jsonb_array_length(${funnelDefinitions.steps}) > 1`
					)
				)
				.orderBy(funnelDefinitions.createdAt)
				.limit(MAX_DEFINITIONS),
		fetchGoals: () =>
			db
				.select({
					id: goals.id,
					name: goals.name,
					type: goals.type,
					target: goals.target,
					filters: goals.filters,
				})
				.from(goals)
				.where(
					and(
						eq(goals.websiteId, websiteId),
						eq(goals.isActive, true),
						isNull(goals.deletedAt)
					)
				)
				.orderBy(goals.createdAt)
				.limit(MAX_DEFINITIONS),
		funnelConversion: async (funnel, range) => {
			const analytics = await processFunnelAnalytics(
				toAnalyticsSteps(funnel.steps),
				funnel.filters ?? [],
				{
					websiteId,
					startDate: range.from,
					endDate: `${range.to} 23:59:59`,
				}
			);
			return {
				rate: analytics.overall_conversion_rate,
				entrants: analytics.total_users_entered,
			};
		},
		goalConversion: async (goal, range) => {
			const steps: AnalyticsStep[] = [
				{
					step_number: 1,
					type: goal.type === "PAGE_VIEW" ? "PAGE_VIEW" : "EVENT",
					target: goal.target,
					name: goal.name,
				},
			];
			const totalWebsiteUsers = await getTotalWebsiteUsers(
				websiteId,
				range.from,
				range.to
			);
			const analytics = await processGoalAnalytics(
				steps,
				goal.filters ?? [],
				{
					websiteId,
					startDate: range.from,
					endDate: `${range.to} 23:59:59`,
				},
				totalWebsiteUsers
			);
			return {
				rate: analytics.overall_conversion_rate,
				completions: analytics.total_users_completed,
			};
		},
	};
}

export async function detectFunnelGoalSignals(
	params: DetectSignalsParams,
	today: dayjs.Dayjs = dayjs(),
	deps: FunnelGoalDeps = defaultFunnelGoalDeps(params.websiteId)
): Promise<DetectedSignal[]> {
	const window = wowWindow(today, params.lookbackDays);
	const current: PeriodRange = {
		from: window.currentFrom,
		to: window.currentTo,
	};
	const previous: PeriodRange = {
		from: window.previousFrom,
		to: window.previousTo,
	};

	const [funnels, goalDefs] = await Promise.all([
		deps.fetchFunnels(),
		deps.fetchGoals(),
	]);

	const funnelSignals = await Promise.all(
		funnels.map(async (funnel) => {
			try {
				const [cur, prev] = await Promise.all([
					deps.funnelConversion(funnel, current),
					deps.funnelConversion(funnel, previous),
				]);
				if (
					cur.entrants < FUNNEL_MIN_ENTRANTS ||
					prev.entrants < FUNNEL_MIN_ENTRANTS ||
					prev.rate <= 0
				) {
					return null;
				}
				if (
					Math.abs(safeDeltaPercent(cur.rate, prev.rate)) <
					FUNNEL_CONVERSION_WOW_THRESHOLD
				) {
					return null;
				}
				return makeWowSignal(
					`funnel:${funnel.id}`,
					`Funnel "${funnel.name}" conversion`,
					cur.rate,
					prev.rate,
					current.to,
					true
				);
			} catch {
				return null;
			}
		})
	);

	const goalSignals = await Promise.all(
		goalDefs.map(async (goal) => {
			try {
				const [cur, prev] = await Promise.all([
					deps.goalConversion(goal, current),
					deps.goalConversion(goal, previous),
				]);
				if (
					Math.max(cur.completions, prev.completions) < GOAL_MIN_COMPLETIONS ||
					prev.rate <= 0
				) {
					return null;
				}
				if (
					Math.abs(safeDeltaPercent(cur.rate, prev.rate)) <
					GOAL_CONVERSION_WOW_THRESHOLD
				) {
					return null;
				}
				return makeWowSignal(
					`goal:${goal.id}`,
					`Goal "${goal.name}" completion rate`,
					cur.rate,
					prev.rate,
					current.to,
					true
				);
			} catch {
				return null;
			}
		})
	);

	return [...funnelSignals, ...goalSignals].filter(
		(signal): signal is DetectedSignal => signal !== null
	);
}
