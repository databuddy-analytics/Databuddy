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
	InvestigationExpectation,
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
const DEFINITION_QUERY_CONCURRENCY = 4;
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

export type PeriodRange = WeekOverWeekPeriod["current"];

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
	confirmCompletion?: (
		request: CompletionConfirmationRequest,
		abortSignal?: AbortSignal
	) => Promise<CompletionConfirmation>;
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

interface CompletionConfirmationRequest {
	definitionId: string;
	definitionType: "funnel" | "goal";
	expectation: InvestigationExpectation;
	range: PeriodRange;
}

type CompletionConfirmation =
	| Pick<
			NonNullable<InvestigationExpectation["confirmation"]>,
			"count" | "source"
	  >
	| undefined;

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

function instruction(value: string): string {
	return value.length <= 180 ? value : `${value.slice(0, 179).trimEnd()}…`;
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

function missingGoalExpectation(
	goal: GoalDef,
	current: GoalConversion,
	previous: GoalConversion
) {
	if (
		goal.type === "PAGE_VIEW" ||
		current.entrants < MIN_ENTRANTS ||
		current.completions !== 0 ||
		previous.completions < MIN_COMPLETIONS
	) {
		return;
	}
	const eventName = goal.target.slice(0, 160);
	return {
		definitionUpdatedAt: goal.updatedAt.toISOString(),
		eventName,
		instruction: instruction(
			`Restore the "${eventName}" event when ${goal.name} completes.`
		),
		kind: "tracking" as const,
		previousCompletions: Math.round(previous.completions),
		currentEntrants: Math.round(current.entrants),
		currentCompletions: 0 as const,
	};
}

function missingFunnelExpectation(
	funnel: FunnelDef,
	current: FunnelConversion,
	previous: FunnelConversion
) {
	if (
		current.entrants < MIN_ENTRANTS ||
		current.completions !== 0 ||
		previous.completions < MIN_COMPLETIONS
	) {
		return;
	}
	const missingStep = current.steps.find((step) => {
		const definition = funnel.steps[step.stepNumber - 1];
		const previousUsers =
			previous.steps.find((item) => item.stepNumber === step.stepNumber)
				?.users ?? 0;
		return (
			definition?.type !== "PAGE_VIEW" &&
			step.users === 0 &&
			previousUsers >= MIN_COMPLETIONS
		);
	});
	const definition = missingStep
		? funnel.steps[missingStep.stepNumber - 1]
		: undefined;
	if (!(missingStep && definition)) {
		return;
	}
	const eventName = definition.target.slice(0, 160);
	const stepName = definition.name.slice(0, 120);
	return {
		definitionUpdatedAt: funnel.updatedAt.toISOString(),
		eventName,
		instruction: instruction(
			`Restore the "${eventName}" event at the ${stepName} step in ${funnel.name}.`
		),
		kind: "tracking" as const,
		previousCompletions: Math.round(previous.completions),
		currentEntrants: Math.round(current.entrants),
		currentCompletions: 0 as const,
		stepName,
	};
}

async function confirmExpectation(
	expectation: InvestigationExpectation,
	definition: { id: string; type: "funnel" | "goal" },
	range: PeriodRange,
	deps: FunnelGoalDeps,
	abortSignal: AbortSignal,
	websiteId: string
): Promise<InvestigationExpectation> {
	if (!deps.confirmCompletion) {
		return expectation;
	}
	try {
		const confirmation = await deps.confirmCompletion(
			{
				definitionId: definition.id,
				definitionType: definition.type,
				expectation,
				range,
			},
			abortSignal
		);
		return confirmation
			? {
					...expectation,
					confirmation: {
						...confirmation,
						definitionId: definition.id,
						definitionType: definition.type,
					},
				}
			: expectation;
	} catch (error) {
		if (abortSignal.aborted) {
			throw abortSignal.reason ?? error;
		}
		if (error instanceof Error && error.name === "AbortError") {
			throw error;
		}
		emitInsightsEvent("warn", "generation.detection.confirmation_failed", {
			website_id: websiteId,
			event_name: expectation.eventName,
			error_type:
				error instanceof Error ? error.constructor.name : typeof error,
		});
		return expectation;
	}
}

function confirmationSummary(
	expectation: InvestigationExpectation | undefined
): string {
	const confirmation = expectation?.confirmation;
	if (!confirmation) {
		return "";
	}
	const scope = confirmation.definitionType === "funnel" ? "funnel" : "goal";
	return confirmation.source === "revenue_transactions"
		? ` Independent revenue tracking recorded ${confirmation.count} transactions for this ${scope}.`
		: ` Independent server tracking recorded ${confirmation.count} completions for this ${scope}.`;
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
						true
					);
					signal.entityLabel = funnel.name;
					const missingExpectation = missingFunnelExpectation(
						funnel,
						cur,
						prev
					);
					const expectation = missingExpectation
						? await confirmExpectation(
								missingExpectation,
								{ id: funnel.id, type: "funnel" },
								current,
								activeDeps,
								deadlineSignal,
								params.websiteId
							)
						: undefined;
					const expectedStepIndex = expectation
						? funnel.steps.findIndex(
								(step) =>
									step.name === expectation.stepName &&
									step.target === expectation.eventName
							)
						: -1;
					const currentStepUsers =
						expectedStepIndex < 0
							? null
							: (cur.steps.find(
									(step) => step.stepNumber === expectedStepIndex + 1
								)?.users ?? 0);
					const previousStepUsers =
						expectedStepIndex < 0
							? null
							: (prev.steps.find(
									(step) => step.stepNumber === expectedStepIndex + 1
								)?.users ?? 0);
					const definitionContext = {
						definitionUpdatedAt: funnel.updatedAt.toISOString(),
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
								...(expectation &&
								currentStepUsers !== null &&
								previousStepUsers !== null
									? [
											{
												label: `${expectation.stepName} step users`,
												current: currentStepUsers,
												previous: previousStepUsers,
												format: "number" as const,
											},
										]
									: []),
								...(expectation?.confirmation
									? [
											{
												label:
													expectation.confirmation.source ===
													"revenue_transactions"
														? "Flow revenue transactions"
														: "Server completions",
												current: expectation.confirmation.count,
												format: "number" as const,
											},
										]
									: []),
							],
							queryType: "funnels_summary" as const,
							summary:
								expectation &&
								currentStepUsers !== null &&
								previousStepUsers !== null
									? `${funnel.name} had ${cur.completions} completions from ${cur.entrants} entrants. The "${expectation.eventName}" event at ${expectation.stepName} had ${currentStepUsers} users, down from ${previousStepUsers}.${confirmationSummary(expectation)}`
									: `${funnel.name} had ${cur.completions} completions from ${cur.entrants} entrants.`,
						},
					};
					return expectation
						? {
								...signal,
								...definitionContext,
								expectation,
								kind: "missing_expected_data" as const,
							}
						: { ...signal, ...definitionContext };
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
						true
					);
					signal.entityLabel = goal.name;
					const missingExpectation = missingGoalExpectation(goal, cur, prev);
					const expectation = missingExpectation
						? await confirmExpectation(
								missingExpectation,
								{ id: goal.id, type: "goal" },
								current,
								activeDeps,
								deadlineSignal,
								params.websiteId
							)
						: undefined;
					const definitionContext = {
						definitionUpdatedAt: goal.updatedAt.toISOString(),
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
								...(expectation?.confirmation
									? [
											{
												label:
													expectation.confirmation.source ===
													"revenue_transactions"
														? "Flow revenue transactions"
														: "Server completions",
												current: expectation.confirmation.count,
												format: "number" as const,
											},
										]
									: []),
							],
							queryType: "goals_summary" as const,
							summary: `${goal.name} had ${cur.completions} completions from ${cur.entrants} eligible visitors. The active goal target is "${goal.target}".${confirmationSummary(expectation)}`,
						},
					};
					return expectation
						? {
								...signal,
								...definitionContext,
								expectation,
								kind: "missing_expected_data" as const,
							}
						: { ...signal, ...definitionContext };
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
