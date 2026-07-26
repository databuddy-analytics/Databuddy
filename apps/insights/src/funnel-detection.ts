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
import type {
	InvestigationSignal,
	WeekOverWeekPeriod,
} from "@databuddy/shared/insights";
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
const FUNNEL_SIGNAL_KEY = /^funnel:([^:]+)(?::step:(\d+))?$/;
const GOAL_SIGNAL_KEY = /^goal:([^:]+)$/;

export interface FunnelDef {
	createdAt: Date;
	deletedAt?: Date | null;
	description: string | null;
	filters: DataFilter[] | null;
	id: string;
	isActive?: boolean;
	name: string;
	steps: FunnelStep[];
	updatedAt: Date;
}

export interface GoalDef {
	createdAt: Date;
	deletedAt?: Date | null;
	description: string | null;
	filters: DataFilter[] | null;
	id: string;
	isActive?: boolean;
	name: string;
	target: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
	updatedAt: Date;
}

type PeriodRange = WeekOverWeekPeriod["current"];

export interface ConversionResult {
	completions: number;
	entrants: number;
	rate: number;
	steps?: { name: string; number: number; rate: number }[];
}

export interface FunnelGoalDeps {
	fetchFunnels: (includeInactive?: boolean) => Promise<FunnelDef[]>;
	fetchGoals: (includeInactive?: boolean) => Promise<GoalDef[]>;
	funnelConversion: (
		funnel: FunnelDef,
		range: PeriodRange,
		abortSignal?: AbortSignal
	) => Promise<ConversionResult>;
	goalConversion: (
		goal: GoalDef,
		range: PeriodRange,
		abortSignal?: AbortSignal
	) => Promise<ConversionResult>;
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

function definitionDescription(description: string | null): string {
	const value = description?.trim();
	return value
		? `Business meaning: ${value}`
		: "No business description is configured.";
}

function definitionFilters(filters: DataFilter[] | null): string {
	if (!filters?.length) {
		return "No filters are configured.";
	}
	const shown = filters.slice(0, 5).map((filter) => {
		const count = Array.isArray(filter.value) ? filter.value.length : 1;
		return `${filter.field.trim().slice(0, 60)} ${filter.operator} (${count} ${count === 1 ? "value" : "values"})`;
	});
	const remaining = filters.length - shown.length;
	return `Filter setup: ${shown.join("; ")}${remaining > 0 ? `; ${remaining} more` : ""}.`;
}

function unavailableDefinitionSignal(
	prior: InvestigationSignal,
	metric: string,
	reason: string
): DetectedSignal {
	const baseline = prior.metric.previous ?? prior.metric.current;
	return {
		baseline,
		current: prior.metric.current,
		deltaPercent:
			prior.changePercent ?? safeDeltaPercent(prior.metric.current, baseline),
		detectedAt: prior.period.current.to,
		direction: prior.sentiment === "negative" ? "down" : "up",
		entityLabel: prior.entity.label,
		definitionEvidence: `${reason} No current conversion can be measured. The last measurable result was ${prior.metric.current}${prior.metric.previous === undefined ? "" : ` compared with ${prior.metric.previous}`} from ${prior.period.current.from} to ${prior.period.current.to}.`,
		label: prior.metric.label,
		method: "wow",
		metric,
		severity: prior.severity,
		subjectKey: prior.signalKey,
	};
}

function inactiveDefinitionEvidence(
	definition: Pick<FunnelDef | GoalDef, "deletedAt" | "isActive" | "name">,
	type: "funnel" | "goal"
): string | null {
	if (definition.deletedAt) {
		return `${type === "goal" ? "Goal" : "Funnel"} "${definition.name}" was deleted on ${definition.deletedAt.toISOString()}.`;
	}
	if (definition.isActive === false) {
		return `${type === "goal" ? "Goal" : "Funnel"} "${definition.name}" is disabled.`;
	}
	return null;
}

export function defaultFunnelGoalDeps(
	websiteId: string,
	asOf: Date,
	goalDependencies: GoalConversionDependencies = DEFAULT_GOAL_CONVERSION_DEPENDENCIES
): FunnelGoalDeps {
	return {
		fetchFunnels: (includeInactive = false) =>
			db
				.select({
					createdAt: funnelDefinitions.createdAt,
					deletedAt: funnelDefinitions.deletedAt,
					description: funnelDefinitions.description,
					filters: funnelDefinitions.filters,
					id: funnelDefinitions.id,
					isActive: funnelDefinitions.isActive,
					name: funnelDefinitions.name,
					steps: funnelDefinitions.steps,
					updatedAt: funnelDefinitions.updatedAt,
				})
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.websiteId, websiteId),
						includeInactive ? undefined : eq(funnelDefinitions.isActive, true),
						includeInactive ? undefined : isNull(funnelDefinitions.deletedAt),
						lte(funnelDefinitions.createdAt, asOf),
						lte(funnelDefinitions.updatedAt, asOf),
						includeInactive
							? undefined
							: sql`jsonb_array_length(${funnelDefinitions.steps}) > 1`
					)
				)
				.orderBy(funnelDefinitions.createdAt),
		fetchGoals: (includeInactive = false) =>
			db
				.select({
					createdAt: goals.createdAt,
					deletedAt: goals.deletedAt,
					description: goals.description,
					filters: goals.filters,
					id: goals.id,
					isActive: goals.isActive,
					name: goals.name,
					target: goals.target,
					type: goals.type,
					updatedAt: goals.updatedAt,
				})
				.from(goals)
				.where(
					and(
						eq(goals.websiteId, websiteId),
						includeInactive ? undefined : eq(goals.isActive, true),
						includeInactive ? undefined : isNull(goals.deletedAt),
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
					name: step.step_name,
					number: step.step_number,
					rate: step.conversion_rate,
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

/** Measures one stored goal or funnel subject without anomaly thresholds. */
export async function remeasureFunnelGoalSignal(
	params: DetectSignalsParams,
	prior: InvestigationSignal,
	today: dayjs.Dayjs = params.timezone ? dayjs().tz(params.timezone) : dayjs(),
	deps?: FunnelGoalDeps,
	abortSignal?: AbortSignal
): Promise<DetectedSignal | null> {
	const goalMatch = GOAL_SIGNAL_KEY.exec(prior.signalKey);
	const funnelMatch = FUNNEL_SIGNAL_KEY.exec(prior.signalKey);
	if (!(goalMatch || funnelMatch)) {
		return null;
	}
	const definitionId = goalMatch?.[1] ?? funnelMatch?.[1] ?? "unknown";
	const definitionType = goalMatch ? "goal" : "funnel";
	const activeDeps =
		deps ?? defaultFunnelGoalDeps(params.websiteId, today.toDate());
	const window = wowWindow(today, params.lookbackDays);
	const current = { from: window.currentFrom, to: window.currentTo };
	const previous = { from: window.previousFrom, to: window.previousTo };

	try {
		abortSignal?.throwIfAborted();
		if (goalMatch) {
			const goal = (await activeDeps.fetchGoals(true)).find(
				(candidate) => candidate.id === definitionId
			);
			if (!goal) {
				return unavailableDefinitionSignal(
					prior,
					`goal:${definitionId}`,
					`Goal "${prior.entity.label}" is no longer present in the website configuration.`
				);
			}
			const [cur, prev] = await Promise.all([
				activeDeps.goalConversion(goal, current, abortSignal),
				activeDeps.goalConversion(goal, previous, abortSignal),
			]);
			const signal = makeWowSignal(
				`goal:${goal.id}`,
				`Goal "${goal.name}" completion rate`,
				cur.rate,
				prev.rate,
				current.to,
				{ round: true }
			);
			signal.subjectKey = prior.signalKey;
			signal.entityLabel = goal.name;
			const state = inactiveDefinitionEvidence(goal, "goal");
			signal.definitionEvidence = `${state ? `${state} ` : ""}Goal "${goal.name}" tracks the ${goal.type} target "${goal.target}". It completed for ${cur.completions} of ${cur.entrants} observed website visitors, compared with ${prev.completions} previously. ${definitionHistory(goal, previous.from, params.timezone)} ${definitionDescription(goal.description)} ${definitionFilters(goal.filters)}`;
			return signal;
		}

		const funnel = (await activeDeps.fetchFunnels(true)).find(
			(candidate) => candidate.id === definitionId
		);
		if (!funnel) {
			return unavailableDefinitionSignal(
				prior,
				`funnel:${definitionId}`,
				`Funnel "${prior.entity.label}" is no longer present in the website configuration.`
			);
		}
		const stepNumber = funnelMatch?.[2] ? Number(funnelMatch[2]) : undefined;
		if (stepNumber && !funnel.steps[stepNumber - 1]) {
			return unavailableDefinitionSignal(
				prior,
				`funnel:${definitionId}`,
				`Funnel "${funnel.name}" no longer contains ${prior.entity.label}.`
			);
		}
		const [cur, prev] = await Promise.all([
			activeDeps.funnelConversion(funnel, current, abortSignal),
			activeDeps.funnelConversion(funnel, previous, abortSignal),
		]);
		const currentStep = stepNumber
			? cur.steps?.find((step) => step.number === stepNumber)
			: undefined;
		const previousStep = stepNumber
			? prev.steps?.find((step) => step.number === stepNumber)
			: undefined;
		if (stepNumber && !(currentStep && previousStep)) {
			return unavailableDefinitionSignal(
				prior,
				`funnel:${definitionId}`,
				`Funnel "${funnel.name}" no longer contains ${prior.entity.label}.`
			);
		}
		const label = currentStep
			? `Funnel "${funnel.name}" step "${currentStep.name}" conversion`
			: `Funnel "${funnel.name}" conversion`;
		const signal = makeWowSignal(
			`funnel:${funnel.id}`,
			label,
			currentStep?.rate ?? cur.rate,
			previousStep?.rate ?? prev.rate,
			current.to,
			{ round: true }
		);
		signal.subjectKey = prior.signalKey;
		signal.entityLabel = currentStep
			? `${funnel.name} → ${currentStep.name}`
			: funnel.name;
		const state = inactiveDefinitionEvidence(funnel, "funnel");
		const measurementEvidence = currentStep
			? `Step ${currentStep.number} "${currentStep.name}" converted ${currentStep.rate}% of visitors reaching it, compared with ${previousStep?.rate}% previously. Funnel "${funnel.name}" converted ${cur.completions} of ${cur.entrants} entrants, compared with ${prev.completions} previously. ${definitionHistory(funnel, previous.from, params.timezone)} ${definitionDescription(funnel.description)} ${definitionFilters(funnel.filters)}`
			: `Funnel "${funnel.name}" converted ${cur.completions} of ${cur.entrants} entrants, compared with ${prev.completions} previously. ${definitionHistory(funnel, previous.from, params.timezone)} ${definitionDescription(funnel.description)} ${definitionFilters(funnel.filters)}`;
		signal.definitionEvidence = `${state ? `${state} ` : ""}${measurementEvidence}`;
		return signal;
	} catch (error) {
		return handleDefinitionFailure(
			error,
			abortSignal ?? new AbortController().signal,
			{
				definitionId,
				definitionType,
				websiteId: params.websiteId,
			}
		);
	}
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
						{ round: true }
					);
					const changedStep = (cur.steps ?? [])
						.flatMap((step) => {
							const previousRate = prev.steps?.find(
								(candidate) => candidate.number === step.number
							)?.rate;
							if (
								step.number === 1 ||
								previousRate === undefined ||
								previousRate <= 0
							) {
								return [];
							}
							const delta = safeDeltaPercent(step.rate, previousRate);
							return (signal.direction === "down" ? delta < 0 : delta > 0)
								? [{ ...step, delta, previousRate }]
								: [];
						})
						.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
					if (changedStep) {
						signal.subjectKey = `funnel:${funnel.id}:step:${changedStep.number}`;
						signal.entityLabel = `${funnel.name} → ${changedStep.name}`;
						signal.label = `Funnel "${funnel.name}" step "${changedStep.name}" conversion`;
						signal.definitionEvidence = `Step ${changedStep.number} "${changedStep.name}" converted ${changedStep.rate}% of visitors reaching it, compared with ${changedStep.previousRate}% previously. Funnel "${funnel.name}" converted ${cur.completions} of ${cur.entrants} entrants, compared with ${prev.completions} previously. ${definitionHistory(funnel, previous.from, params.timezone)} ${definitionDescription(funnel.description)} ${definitionFilters(funnel.filters)}`;
					} else {
						signal.entityLabel = funnel.name;
						signal.definitionEvidence = `Funnel "${funnel.name}" converted ${cur.completions} of ${cur.entrants} entrants, compared with ${prev.completions} previously. ${definitionHistory(funnel, previous.from, params.timezone)} ${definitionDescription(funnel.description)} ${definitionFilters(funnel.filters)}`;
					}
					return signal;
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
						{ round: true }
					);
					signal.entityLabel = goal.name;
					return {
						...signal,
						definitionEvidence: `Goal "${goal.name}" tracks the ${goal.type} target "${goal.target}". It completed for ${cur.completions} of ${cur.entrants} observed website visitors, compared with ${prev.completions} previously. ${definitionHistory(goal, previous.from, params.timezone)} ${definitionDescription(goal.description)} ${definitionFilters(goal.filters)}`,
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
