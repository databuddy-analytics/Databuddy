import { and, db, eq, isNull, lte, sql } from "@databuddy/db";
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
import type { WeekOverWeekPeriod } from "@databuddy/shared/insights";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";
import {
	type DetectedSignal,
	type DetectSignalsParams,
	makeWowSignal,
	safeDeltaPercent,
	wowWindow,
} from "./detection";
import { emitInsightsEvent } from "./lib/evlog-insights";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

const CONVERSION_WOW_THRESHOLD = 20;
const MIN_ENTRANTS = 30;
const MIN_COMPLETIONS = 10;
const DEFINITION_QUERY_CONCURRENCY = 2;
const DEFINITION_DETECTION_TIMEOUT_MS = 45_000;

export interface FunnelDef {
	createdAt: Date;
	filters: DataFilter[] | null;
	id: string;
	name: string;
	steps: FunnelStep[];
	updatedAt: Date;
}

export interface GoalDef {
	createdAt: Date;
	filters: DataFilter[] | null;
	id: string;
	name: string;
	target: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
	updatedAt: Date;
}

type PeriodRange = WeekOverWeekPeriod["current"];

export interface FunnelConversion {
	completions: number;
	entrants: number;
	rate: number;
	steps: Array<{ stepNumber: number; users: number }>;
}

export interface GoalConversion {
	completions: number;
	entrants: number;
	rate: number;
}

export interface FunnelGoalDeps {
	fetchFunnels: () => Promise<FunnelDef[]>;
	fetchGoals: () => Promise<GoalDef[]>;
	funnelConversion: (
		funnel: FunnelDef,
		range: PeriodRange,
		abortSignal?: AbortSignal
	) => Promise<FunnelConversion>;
	goalConversion: (
		goal: GoalDef,
		range: PeriodRange,
		abortSignal?: AbortSignal
	) => Promise<GoalConversion>;
}

export interface FunnelGoalDetectionDiagnostics {
	failedDefinitions: number;
}

interface GoalConversionDependencies {
	getTotalWebsiteUsers: typeof getTotalWebsiteUsers;
	processGoalAnalytics: typeof processGoalAnalytics;
}

const DEFAULT_GOAL_CONVERSION_DEPENDENCIES: GoalConversionDependencies = {
	getTotalWebsiteUsers,
	processGoalAnalytics,
};

function toAnalyticsSteps(steps: FunnelStep[]): AnalyticsStep[] {
	return steps.map((step, index) => ({
		step_number: index + 1,
		type: step.type === "PAGE_VIEW" ? "PAGE_VIEW" : "EVENT",
		target: step.target,
		name: step.name,
	}));
}

export function defaultFunnelGoalDeps(
	websiteId: string,
	asOf: Date,
	goalDependencies: GoalConversionDependencies = DEFAULT_GOAL_CONVERSION_DEPENDENCIES
): FunnelGoalDeps {
	return {
		fetchFunnels: () =>
			db
				.select({
					createdAt: funnelDefinitions.createdAt,
					filters: funnelDefinitions.filters,
					id: funnelDefinitions.id,
					name: funnelDefinitions.name,
					steps: funnelDefinitions.steps,
					updatedAt: funnelDefinitions.updatedAt,
				})
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.websiteId, websiteId),
						eq(funnelDefinitions.isActive, true),
						isNull(funnelDefinitions.deletedAt),
						lte(funnelDefinitions.createdAt, asOf),
						lte(funnelDefinitions.updatedAt, asOf),
						sql`jsonb_array_length(${funnelDefinitions.steps}) > 1`
					)
				)
				.orderBy(funnelDefinitions.createdAt),
		fetchGoals: () =>
			db
				.select({
					createdAt: goals.createdAt,
					filters: goals.filters,
					id: goals.id,
					name: goals.name,
					target: goals.target,
					type: goals.type,
					updatedAt: goals.updatedAt,
				})
				.from(goals)
				.where(
					and(
						eq(goals.websiteId, websiteId),
						eq(goals.isActive, true),
						isNull(goals.deletedAt),
						lte(goals.createdAt, asOf),
						lte(goals.updatedAt, asOf)
					)
				)
				.orderBy(goals.createdAt),
		funnelConversion: async (funnel, range, abortSignal) => {
			const analytics = await processFunnelAnalytics(
				toAnalyticsSteps(funnel.steps),
				funnel.filters ?? [],
				{
					websiteId,
					startDate: range.from,
					endDate: `${range.to} 23:59:59`,
				},
				undefined,
				abortSignal
			);
			return {
				rate: analytics.overall_conversion_rate,
				entrants: analytics.total_users_entered,
				completions: analytics.total_users_completed,
				steps: analytics.steps_analytics.map((step) => ({
					stepNumber: step.step_number,
					users: step.users,
				})),
			};
		},
		goalConversion: async (goal, range, abortSignal) => {
			const filters = goal.filters ?? [];
			const steps: AnalyticsStep[] = [
				{
					step_number: 1,
					type: goal.type === "PAGE_VIEW" ? "PAGE_VIEW" : "EVENT",
					target: goal.target,
					name: goal.name,
				},
			];
			const totalWebsiteUsers = await goalDependencies.getTotalWebsiteUsers(
				websiteId,
				range.from,
				range.to,
				filters,
				abortSignal
			);
			const analytics = await goalDependencies.processGoalAnalytics(
				steps,
				filters,
				{
					websiteId,
					startDate: range.from,
					endDate: `${range.to} 23:59:59`,
				},
				totalWebsiteUsers,
				abortSignal
			);
			return {
				rate: analytics.overall_conversion_rate,
				completions: analytics.total_users_completed,
				entrants: analytics.total_users_entered,
			};
		},
	};
}

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	work: (item: T) => Promise<R>,
	signal?: AbortSignal
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (nextIndex < items.length) {
				if (signal?.aborted) {
					throw signal.reason;
				}
				const index = nextIndex;
				nextIndex += 1;
				results[index] = await work(items[index]);
			}
		})
	);
	return results;
}

async function withDetectionDeadline<T>(
	work: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number
): Promise<T> {
	const controller = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => {
			const error = new Error(
				`Goal and funnel detection exceeded ${timeoutMs}ms`
			);
			controller.abort(error);
			reject(error);
		}, timeoutMs);
	});
	try {
		return await Promise.race([work(controller.signal), deadline]);
	} catch (error) {
		controller.abort(error);
		throw error;
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
}

function definitionPredatesComparison(
	definition: Pick<FunnelDef, "createdAt" | "updatedAt">,
	previousFrom: string,
	timezone: string
): boolean {
	const comparisonStart = dayjs.tz(previousFrom, timezone).startOf("day");
	return !(
		dayjs(definition.createdAt).isAfter(comparisonStart) ||
		dayjs(definition.updatedAt).isAfter(comparisonStart)
	);
}

function definitionHistory(
	definition: Pick<FunnelDef, "createdAt" | "updatedAt">,
	comparisonStart: string,
	timezone: string
): string {
	const createdAt = dayjs(definition.createdAt)
		.tz(timezone)
		.format("YYYY-MM-DD");
	const updatedAt = dayjs(definition.updatedAt)
		.tz(timezone)
		.format("YYYY-MM-DD");
	return `Definition history: created ${createdAt}; last updated ${updatedAt}; comparison started ${comparisonStart}.`;
}

function handleDefinitionFailure(
	error: unknown,
	signal: AbortSignal,
	context: {
		definitionId: string;
		definitionType: "funnel" | "goal";
		diagnostics?: FunnelGoalDetectionDiagnostics;
		websiteId: string;
	}
): null {
	if (signal.aborted) {
		throw signal.reason ?? error;
	}
	if (error instanceof Error && error.name === "AbortError") {
		throw error;
	}
	if (context.diagnostics) {
		context.diagnostics.failedDefinitions += 1;
	}
	emitInsightsEvent("warn", "generation.detection.definition_failed", {
		website_id: context.websiteId,
		definition_id: context.definitionId,
		definition_type: context.definitionType,
		error_type: error instanceof Error ? error.constructor.name : typeof error,
	});
	return null;
}

export function detectFunnelGoalSignals(
	params: DetectSignalsParams,
	today: dayjs.Dayjs = params.timezone ? dayjs().tz(params.timezone) : dayjs(),
	deps?: FunnelGoalDeps,
	options: {
		diagnostics?: FunnelGoalDetectionDiagnostics;
		timeoutMs?: number;
	} = {}
): Promise<DetectedSignal[]> {
	return withDetectionDeadline(async (deadlineSignal) => {
		const window = wowWindow(today, params.lookbackDays);
		const current: PeriodRange = {
			from: window.currentFrom,
			to: window.currentTo,
		};
		const previous: PeriodRange = {
			from: window.previousFrom,
			to: window.previousTo,
		};

		const activeDeps =
			deps ??
			defaultFunnelGoalDeps(
				params.websiteId,
				today.toDate(),
				DEFAULT_GOAL_CONVERSION_DEPENDENCIES
			);
		const [funnels, goalDefs] = await Promise.all([
			activeDeps.fetchFunnels(),
			activeDeps.fetchGoals(),
		]);

		const funnelSignals = await mapWithConcurrency(
			funnels,
			DEFINITION_QUERY_CONCURRENCY,
			async (funnel) => {
				try {
					if (
						!definitionPredatesComparison(
							funnel,
							previous.from,
							params.timezone
						)
					) {
						return null;
					}
					const [cur, prev] = await Promise.all([
						activeDeps.funnelConversion(funnel, current, deadlineSignal),
						activeDeps.funnelConversion(funnel, previous, deadlineSignal),
					]);
					if (
						cur.entrants < MIN_ENTRANTS ||
						prev.entrants < MIN_ENTRANTS ||
						Math.max(cur.completions, prev.completions) < MIN_COMPLETIONS ||
						prev.rate <= 0
					) {
						return null;
					}
					if (
						Math.abs(safeDeltaPercent(cur.rate, prev.rate)) <
						CONVERSION_WOW_THRESHOLD
					) {
						return null;
					}
					const signal = makeWowSignal(
						`funnel:${funnel.id}`,
						`Funnel "${funnel.name}" conversion`,
						cur.rate,
						prev.rate,
						current.to,
						{ round: true, thresholdPercent: CONVERSION_WOW_THRESHOLD }
					);
					signal.entityLabel = funnel.name;
					return {
						...signal,
						definitionEvidence: {
							metrics: [
								{
									label: "Entrants",
									current: cur.entrants,
									format: "number" as const,
								},
								{
									label: "Completions",
									current: cur.completions,
									previous: prev.completions,
									format: "number" as const,
								},
							],
							summary: `${funnel.name} had ${cur.completions} completions from ${cur.entrants} entrants. ${definitionHistory(funnel, previous.from, params.timezone)}`,
						},
					};
				} catch (error) {
					return handleDefinitionFailure(error, deadlineSignal, {
						definitionId: funnel.id,
						definitionType: "funnel",
						diagnostics: options.diagnostics,
						websiteId: params.websiteId,
					});
				}
			},
			deadlineSignal
		);

		const goalSignals = await mapWithConcurrency(
			goalDefs,
			DEFINITION_QUERY_CONCURRENCY,
			async (goal) => {
				try {
					if (
						!definitionPredatesComparison(goal, previous.from, params.timezone)
					) {
						return null;
					}
					const [cur, prev] = await Promise.all([
						activeDeps.goalConversion(goal, current, deadlineSignal),
						activeDeps.goalConversion(goal, previous, deadlineSignal),
					]);
					if (
						cur.entrants < MIN_ENTRANTS ||
						prev.entrants < MIN_ENTRANTS ||
						Math.max(cur.completions, prev.completions) < MIN_COMPLETIONS ||
						prev.rate <= 0
					) {
						return null;
					}
					if (
						Math.abs(safeDeltaPercent(cur.rate, prev.rate)) <
						CONVERSION_WOW_THRESHOLD
					) {
						return null;
					}
					const signal = makeWowSignal(
						`goal:${goal.id}`,
						`Goal "${goal.name}" completion rate`,
						cur.rate,
						prev.rate,
						current.to,
						{ round: true, thresholdPercent: CONVERSION_WOW_THRESHOLD }
					);
					signal.entityLabel = goal.name;
					return {
						...signal,
						definitionEvidence: {
							metrics: [
								{
									label: "Observed visitors",
									current: cur.entrants,
									format: "number" as const,
								},
								{
									label: "Completions",
									current: cur.completions,
									previous: prev.completions,
									format: "number" as const,
								},
							],
							summary: `${goal.name} had ${cur.completions} completions from ${cur.entrants} observed website visitors${goal.filters?.length ? " matching the goal filters" : ""}. The active goal target is "${goal.target}". ${definitionHistory(goal, previous.from, params.timezone)}`,
						},
					};
				} catch (error) {
					return handleDefinitionFailure(error, deadlineSignal, {
						definitionId: goal.id,
						definitionType: "goal",
						diagnostics: options.diagnostics,
						websiteId: params.websiteId,
					});
				}
			},
			deadlineSignal
		);

		return [...funnelSignals, ...goalSignals].filter(
			(signal) => signal !== null
		);
	}, options.timeoutMs ?? DEFINITION_DETECTION_TIMEOUT_MS);
}
