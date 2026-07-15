import { db, sql } from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import {
	type DataFilter,
	funnelDefinitions,
	type FunnelStep,
	goals,
} from "@databuddy/db/schema";
import {
	type AnalyticsStep,
	getTotalWebsiteUsers,
	processFunnelConversionCounts,
	processGoalConversionCount,
} from "@databuddy/rpc/analytics-utils";
import {
	normalizeFunnelSteps,
	toAnalyticsSteps,
} from "@databuddy/rpc/funnel-steps";
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
const MAX_DEFINITIONS_PER_RUN = 16;
const DEFINITION_ROTATION_DAYS = 7;

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

export interface FunnelGoalDefinitionWindow {
	activeKeys: string[];
	eligibleKeys: string[];
	funnels: FunnelDef[];
	goals: GoalDef[];
	total: number;
}

export interface FunnelGoalDeps {
	confirmCompletion?: (
		request: CompletionConfirmationRequest,
		abortSignal?: AbortSignal
	) => Promise<CompletionConfirmation>;
	fetchDefinitionWindow?: (
		rotation: number,
		comparisonStart: Date
	) => Promise<FunnelGoalDefinitionWindow>;
	fetchFunnels?: () => Promise<FunnelDef[]>;
	fetchGoals?: () => Promise<GoalDef[]>;
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
	filters: DataFilter[];
	range: PeriodRange;
}

type CompletionConfirmation =
	| Pick<
			NonNullable<InvestigationExpectation["confirmation"]>,
			"count" | "source"
	  >
	| undefined;

export interface FunnelGoalDetectionDiagnostics {
	activeDefinitionKeys?: Set<string>;
	eligibleDefinitionKeys?: Set<string>;
	evaluatedDefinitionKeys?: Set<string>;
	failedDefinitions: number;
	failureMessages?: string[];
	truncatedDefinitions: number;
}

function definitionRotation(asOf: dayjs.Dayjs): number {
	const day = Math.floor(asOf.startOf("day").valueOf() / 86_400_000);
	return Math.floor(day / DEFINITION_ROTATION_DAYS);
}

function rotatingDefinitionWindow(
	funnels: FunnelDef[],
	goalDefs: GoalDef[],
	asOf: dayjs.Dayjs,
	comparisonStart: Date
): {
	activeKeys: string[];
	eligibleKeys: string[];
	funnels: FunnelDef[];
	goals: GoalDef[];
	truncated: number;
} {
	const activeKeys = [
		...funnels.map((definition) => `funnel:${definition.id}`),
		...goalDefs.map((definition) => `goal:${definition.id}`),
	].sort((left, right) => left.localeCompare(right));
	const definitions = [
		...funnels
			.filter((definition) =>
				definitionPredatesComparison(definition, comparisonStart)
			)
			.map((definition) => ({
				definition,
				key: `funnel:${definition.id}`,
				type: "funnel" as const,
			})),
		...goalDefs
			.filter((definition) =>
				definitionPredatesComparison(definition, comparisonStart)
			)
			.map((definition) => ({
				definition,
				key: `goal:${definition.id}`,
				type: "goal" as const,
			})),
	].sort((left, right) => left.key.localeCompare(right.key));
	let selected = definitions;
	if (definitions.length > MAX_DEFINITIONS_PER_RUN) {
		const rotation = definitionRotation(asOf);
		const start = (rotation * MAX_DEFINITIONS_PER_RUN) % definitions.length;
		selected = Array.from(
			{ length: MAX_DEFINITIONS_PER_RUN },
			(_, index) => definitions[(start + index) % definitions.length]
		);
	}
	return {
		activeKeys,
		eligibleKeys: definitions.map((item) => item.key),
		funnels: selected
			.filter((item) => item.type === "funnel")
			.map((item) => item.definition as FunnelDef),
		goals: selected
			.filter((item) => item.type === "goal")
			.map((item) => item.definition as GoalDef),
		truncated: definitions.length - selected.length,
	};
}

async function loadDefinitionWindow(
	deps: FunnelGoalDeps,
	asOf: dayjs.Dayjs,
	comparisonStart: Date
): Promise<{
	activeKeys: string[];
	eligibleKeys: string[];
	funnels: FunnelDef[];
	goals: GoalDef[];
	truncated: number;
}> {
	if (deps.fetchDefinitionWindow) {
		const selected = await deps.fetchDefinitionWindow(
			definitionRotation(asOf),
			comparisonStart
		);
		const evaluated = selected.funnels.length + selected.goals.length;
		const activeKeySet = new Set(selected.activeKeys);
		const eligibleKeySet = new Set(selected.eligibleKeys);
		if (
			!Number.isSafeInteger(selected.total) ||
			selected.total < 0 ||
			activeKeySet.size !== selected.activeKeys.length ||
			selected.eligibleKeys.length !== selected.total ||
			eligibleKeySet.size !== selected.total ||
			!selected.eligibleKeys.every((key) => activeKeySet.has(key)) ||
			evaluated !== Math.min(selected.total, MAX_DEFINITIONS_PER_RUN) ||
			![...selected.funnels, ...selected.goals].every((definition) =>
				eligibleKeySet.has(
					`${"steps" in definition ? "funnel" : "goal"}:${definition.id}`
				)
			) ||
			![...selected.funnels, ...selected.goals].every((definition) =>
				definitionPredatesComparison(definition, comparisonStart)
			)
		) {
			throw new Error("Definition window returned an invalid selection");
		}
		return {
			activeKeys: selected.activeKeys,
			eligibleKeys: selected.eligibleKeys,
			funnels: selected.funnels,
			goals: selected.goals,
			truncated: selected.total - evaluated,
		};
	}
	if (!(deps.fetchFunnels && deps.fetchGoals)) {
		throw new Error("Funnel and goal definition dependencies are missing");
	}
	const [funnels, goals] = await Promise.all([
		deps.fetchFunnels(),
		deps.fetchGoals(),
	]);
	return rotatingDefinitionWindow(funnels, goals, asOf, comparisonStart);
}

interface GoalConversionDependencies {
	confirmUnlinkedCompletions?: (
		websiteId: string,
		eventName: string,
		range: PeriodRange,
		abortSignal?: AbortSignal
	) => Promise<number>;
	getTotalWebsiteUsers: typeof getTotalWebsiteUsers;
	processGoalConversionCount: typeof processGoalConversionCount;
}

export const UNLINKED_COMPLETIONS_QUERY = `SELECT sum(count) AS count
		 FROM (
			SELECT count() AS count
			FROM analytics.custom_events
			WHERE owner_id = {websiteId:String}
				AND event_name = {eventName:String}
				AND ifNull(profile_id, '') = ''
				AND ifNull(anonymous_id, '') = ''
				AND ifNull(session_id, '') = ''
				AND timestamp >= parseDateTimeBestEffort({from:String})
				AND timestamp < parseDateTimeBestEffort({toExclusive:String})
			UNION ALL
			SELECT count() AS count
			FROM analytics.custom_events
			WHERE website_id = {websiteId:String}
				AND owner_id != {websiteId:String}
				AND event_name = {eventName:String}
				AND ifNull(profile_id, '') = ''
				AND ifNull(anonymous_id, '') = ''
				AND ifNull(session_id, '') = ''
				AND timestamp >= parseDateTimeBestEffort({from:String})
				AND timestamp < parseDateTimeBestEffort({toExclusive:String})
		 )`;

async function countUnlinkedCompletions(
	websiteId: string,
	eventName: string,
	range: PeriodRange,
	abortSignal?: AbortSignal
): Promise<number> {
	const [row] = await chQuery<{ count: number | string }>(
		UNLINKED_COMPLETIONS_QUERY,
		{
			eventName,
			from: range.from,
			toExclusive: dayjs(range.to).add(1, "day").format("YYYY-MM-DD"),
			websiteId,
		},
		{ abort_signal: abortSignal }
	);
	const count = Number(row?.count ?? 0);
	return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

const DEFAULT_GOAL_CONVERSION_DEPENDENCIES: GoalConversionDependencies = {
	confirmUnlinkedCompletions: countUnlinkedCompletions,
	getTotalWebsiteUsers,
	processGoalConversionCount,
};

type DefinitionWindowRow = Record<string, unknown> & {
	activeKeys: string[];
	createdAt: Date | null;
	definitionType: "funnel" | "goal" | null;
	eligibleKeys: string[];
	filters: DataFilter[] | null;
	goalType: GoalDef["type"] | null;
	id: string | null;
	name: string | null;
	steps: FunnelStep[] | null;
	target: string | null;
	totalCount: number | string;
	updatedAt: Date | null;
};

async function fetchDefinitionWindow(
	websiteId: string,
	comparisonStart: Date,
	rotation: number
): Promise<FunnelGoalDefinitionWindow> {
	const result = await db.execute<DefinitionWindowRow>(sql`
		with active as (
			select
				'funnel'::text as definition_type,
				${funnelDefinitions.id} as id,
				('funnel:' || ${funnelDefinitions.id}) collate "C" as definition_key
			from ${funnelDefinitions}
			where ${funnelDefinitions.websiteId} = ${websiteId}
				and ${funnelDefinitions.isActive} = true
				and ${funnelDefinitions.deletedAt} is null
			union all
			select
				'goal'::text as definition_type,
				${goals.id} as id,
				('goal:' || ${goals.id}) collate "C" as definition_key
			from ${goals}
			where ${goals.websiteId} = ${websiteId}
				and ${goals.isActive} = true
				and ${goals.deletedAt} is null
		), eligible as (
			select
				'funnel'::text as definition_type,
				${funnelDefinitions.id} as id,
				('funnel:' || ${funnelDefinitions.id}) collate "C" as definition_key
			from ${funnelDefinitions}
			where ${funnelDefinitions.websiteId} = ${websiteId}
				and ${funnelDefinitions.isActive} = true
				and ${funnelDefinitions.deletedAt} is null
				and ${funnelDefinitions.createdAt} <= ${comparisonStart}
				and ${funnelDefinitions.updatedAt} <= ${comparisonStart}
				and case
					when jsonb_typeof(${funnelDefinitions.steps}) = 'array'
						then jsonb_array_length(${funnelDefinitions.steps})
					else 0
				end > 1
			union all
			select
				'goal'::text as definition_type,
				${goals.id} as id,
				('goal:' || ${goals.id}) collate "C" as definition_key
			from ${goals}
			where ${goals.websiteId} = ${websiteId}
				and ${goals.isActive} = true
				and ${goals.deletedAt} is null
				and ${goals.createdAt} <= ${comparisonStart}
				and ${goals.updatedAt} <= ${comparisonStart}
		), ranked as (
			select
				definition_type,
				id,
				(row_number() over (order by definition_key) - 1)::bigint as position,
				count(*) over ()::int as total_count
			from eligible
		), rotated as (
			select
				definition_type,
				id,
				total_count,
				(
					position
					- ((${rotation}::bigint * ${MAX_DEFINITIONS_PER_RUN}::bigint) % total_count::bigint)
					+ total_count::bigint
				) % total_count::bigint as distance
			from ranked
		), selected as materialized (
			select definition_type, id, total_count, distance
			from rotated
			order by distance
			limit ${MAX_DEFINITIONS_PER_RUN}
		), metadata as (
			select
				coalesce(
					(select array_agg(definition_key::text order by definition_key) from active),
					array[]::text[]
				) as active_keys,
				coalesce(
					(select array_agg(definition_key::text order by definition_key) from eligible),
					array[]::text[]
				) as eligible_keys,
				(select count(*)::int from eligible) as total_count
		)
		select
			selected.definition_type as "definitionType",
			selected.id,
			metadata.total_count as "totalCount",
			metadata.active_keys as "activeKeys",
			metadata.eligible_keys as "eligibleKeys",
			coalesce(${funnelDefinitions.name}, ${goals.name}) as name,
			coalesce(${funnelDefinitions.filters}, ${goals.filters}) as filters,
			coalesce(${funnelDefinitions.createdAt}, ${goals.createdAt}) as "createdAt",
			coalesce(${funnelDefinitions.updatedAt}, ${goals.updatedAt}) as "updatedAt",
			${funnelDefinitions.steps} as steps,
			${goals.target} as target,
			${goals.type} as "goalType"
		from metadata
		left join selected on true
		left join ${funnelDefinitions}
			on selected.definition_type = 'funnel'
			and ${funnelDefinitions.id} = selected.id
		left join ${goals}
			on selected.definition_type = 'goal'
			and ${goals.id} = selected.id
		order by selected.distance nulls last
	`);
	const funnels: FunnelDef[] = [];
	const goalDefs: GoalDef[] = [];
	for (const row of result.rows) {
		if (!(row.definitionType && row.id)) {
			continue;
		}
		if (row.definitionType === "funnel") {
			if (
				row.createdAt === null ||
				row.name === null ||
				row.steps === null ||
				row.updatedAt === null
			) {
				throw new Error(`Selected funnel ${row.id} has no steps`);
			}
			funnels.push({
				createdAt: row.createdAt,
				filters: row.filters,
				id: row.id,
				name: row.name,
				steps: normalizeFunnelSteps(row.steps),
				updatedAt: row.updatedAt,
			});
			continue;
		}
		if (
			row.createdAt === null ||
			row.goalType === null ||
			row.name === null ||
			row.target === null ||
			row.updatedAt === null
		) {
			throw new Error(`Selected goal ${row.id} is incomplete`);
		}
		goalDefs.push({
			createdAt: row.createdAt,
			filters: row.filters,
			id: row.id,
			name: row.name,
			target: row.target,
			type: row.goalType,
			updatedAt: row.updatedAt,
		});
	}
	const total = Number(result.rows[0]?.totalCount ?? 0);
	if (
		!Number.isSafeInteger(total) ||
		total < funnels.length + goalDefs.length
	) {
		throw new Error("Definition selection returned an invalid total");
	}
	return {
		activeKeys: result.rows[0]?.activeKeys ?? [],
		eligibleKeys: result.rows[0]?.eligibleKeys ?? [],
		funnels,
		goals: goalDefs,
		total,
	};
}

export function defaultFunnelGoalDeps(
	websiteId: string,
	asOf: Date,
	goalDependencies: GoalConversionDependencies = DEFAULT_GOAL_CONVERSION_DEPENDENCIES
): FunnelGoalDeps {
	return {
		...(goalDependencies.confirmUnlinkedCompletions
			? {
					confirmCompletion: async (
						request: CompletionConfirmationRequest,
						abortSignal?: AbortSignal
					) => {
						if (request.filters.length > 0) {
							return;
						}
						const count = await goalDependencies.confirmUnlinkedCompletions?.(
							websiteId,
							request.expectation.eventName,
							request.range,
							abortSignal
						);
						return count && count > 0
							? { count, source: "server_completions" as const }
							: undefined;
					},
				}
			: {}),
		fetchDefinitionWindow: (rotation, comparisonStart) =>
			fetchDefinitionWindow(
				websiteId,
				comparisonStart < asOf ? comparisonStart : asOf,
				rotation
			),
		funnelConversion: async (funnel, range, abortSignal) => {
			if (funnel.steps.length < 2) {
				throw new Error(`Funnel ${funnel.id} has fewer than two valid steps`);
			}
			const analytics = await processFunnelConversionCounts(
				toAnalyticsSteps(funnel.steps),
				funnel.filters ?? [],
				{
					websiteId,
					startDate: range.from,
					endDate: `${range.to} 23:59:59`,
				},
				abortSignal
			);
			return {
				rate: analytics.rate,
				entrants: analytics.entrants,
				completions: analytics.completions,
				steps: analytics.steps,
			};
		},
		goalConversion: async (goal, range, abortSignal) => {
			const filters = goal.filters ?? [];
			const step: AnalyticsStep = {
				step_number: 1,
				type: goal.type === "PAGE_VIEW" ? "PAGE_VIEW" : "EVENT",
				target: goal.target,
				name: goal.name,
			};
			const totalWebsiteUsers = await goalDependencies.getTotalWebsiteUsers(
				websiteId,
				range.from,
				range.to,
				filters,
				abortSignal
			);
			const completionCount = await goalDependencies.processGoalConversionCount(
				step,
				filters,
				{
					websiteId,
					startDate: range.from,
					endDate: `${range.to} 23:59:59`,
				},
				abortSignal
			);
			return {
				rate:
					totalWebsiteUsers > 0
						? Math.round((completionCount / totalWebsiteUsers) * 10_000) / 100
						: 0,
				completions: completionCount,
				entrants: totalWebsiteUsers,
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
	comparisonStart: Date
): boolean {
	return !(
		definition.createdAt > comparisonStart ||
		definition.updatedAt > comparisonStart
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
		context.diagnostics.failureMessages?.push(
			(error instanceof Error ? error.message : String(error)).slice(0, 500)
		);
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
	definition: {
		filters: DataFilter[] | null;
		id: string;
		type: "funnel" | "goal";
	},
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
				filters: definition.filters ?? [],
				range,
			},
			abortSignal
		);
		return confirmation
			? {
					...expectation,
					instruction:
						confirmation.source === "server_completions"
							? instruction(
									`Link "${expectation.eventName}" custom events to a Databuddy visitor or session so this ${definition.type} can count them.`
								)
							: expectation.instruction,
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
		: ` Independent event tracking found ${confirmation.count} identity-less records matching this ${scope}'s exact event target.`;
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
		const comparisonStart = dayjs
			.tz(previous.from, params.timezone)
			.startOf("day")
			.toDate();

		const activeDeps =
			deps ??
			defaultFunnelGoalDeps(
				params.websiteId,
				today.toDate(),
				DEFAULT_GOAL_CONVERSION_DEPENDENCIES
			);
		const selected = await loadDefinitionWindow(
			activeDeps,
			today,
			comparisonStart
		);
		const funnels = selected.funnels;
		const goalDefs = selected.goals;
		for (const key of selected.activeKeys) {
			options.diagnostics?.activeDefinitionKeys?.add(key);
		}
		for (const key of selected.eligibleKeys) {
			options.diagnostics?.eligibleDefinitionKeys?.add(key);
		}
		if (selected.truncated > 0) {
			if (options.diagnostics) {
				options.diagnostics.truncatedDefinitions += selected.truncated;
			}
			emitInsightsEvent("info", "generation.detection.definitions_rotated", {
				website_id: params.websiteId,
				evaluated_definitions: funnels.length + goalDefs.length,
				truncated_definitions: selected.truncated,
			});
		}

		const funnelSignals = await mapWithConcurrency(
			funnels,
			DEFINITION_QUERY_CONCURRENCY,
			async (funnel) => {
				try {
					const [cur, prev] = await Promise.all([
						activeDeps.funnelConversion(funnel, current, deadlineSignal),
						activeDeps.funnelConversion(funnel, previous, deadlineSignal),
					]);
					options.diagnostics?.evaluatedDefinitionKeys?.add(
						`funnel:${funnel.id}`
					);
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
								{
									filters: funnel.filters,
									id: funnel.id,
									type: "funnel",
								},
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
														: "Identity-less event records",
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
					const [cur, prev] = await Promise.all([
						activeDeps.goalConversion(goal, current, deadlineSignal),
						activeDeps.goalConversion(goal, previous, deadlineSignal),
					]);
					options.diagnostics?.evaluatedDefinitionKeys?.add(`goal:${goal.id}`);
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
								{ filters: goal.filters, id: goal.id, type: "goal" },
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
														: "Identity-less event records",
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
