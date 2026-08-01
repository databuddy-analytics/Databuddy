import { chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Pool, type PoolClient } from "pg";
import type { StepResult, ToolSet } from "ai";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";
import {
	summarizeAgentUsage,
	type UsageTelemetry,
} from "@databuddy/ai/lib/usage-telemetry";
import type {
	InvestigationSources,
	WebsiteInvestigationArtifact,
} from "./generation";
import { resolveInvestigationAsOf } from "./generation";
import type { InsightAgentInput, InsightAgentResult } from "./agent";
import type { DetectedSignal, DetectionDiagnostics } from "./detection";
import type {
	FunnelDef,
	FunnelGoalDetectionDiagnostics,
	GoalDef,
} from "./funnel-detection";
import type { InvestigationAnnotation } from "./investigation";
import type { LatestInsightObservation } from "./observations";
import { runDistinctSignalBatch } from "./batch-shadow";
import { runBoundedWorkerFanout } from "./worker-fanout-shadow";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

const REQUIRED_CONFIRMATION = "--confirm-read-only-production";
const DEFAULT_OFFSETS = [60, 30, 7, 0];
const DEFAULT_MIN_EVENTS = 25_000;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MODEL = "openai/gpt-5.6-terra";
const MAX_BATCH_SIZE = 3;
const STATEMENT_TIMEOUT_MS = 60_000;
const CASE_ATTEMPT_TIMEOUT_MS = 150_000;
type AsOfMode = "day" | "instant";

interface CliOptions {
	asOfMode: AsOfMode;
	batchSize: number;
	concurrency: number;
	limit: number | null;
	minEvents: number;
	model: string;
	offsets: number[];
	output: string | null;
	referenceTime: Date;
	websiteId: string | null;
	workerConcurrency: number;
	workerFanout: boolean;
}

interface RankedWebsite {
	domain: string;
	githubRepository: { owner: string; repo: string } | null;
	id: string;
	name: string | null;
	organizationId: string;
	secrets: string[];
	timezone: string;
}

interface FunnelRow extends FunnelDef {
	websiteId: string;
}

interface GoalRow extends GoalDef {
	websiteId: string;
}

interface AnnotationRow {
	createdAt: Date;
	deletedAt: Date | null;
	text: string;
	updatedAt: Date;
	websiteId: string;
	xValue: Date;
}

interface InsightAgentStepTrace {
	cacheReadTokens: number | null;
	cacheWriteTokens: number | null;
	inputTokens: number | null;
	modelId: string;
	outputTokens: number | null;
	reasoningTokens: number | null;
	tools: Array<{
		errorType: string | null;
		name: string;
		outcome: "execution_error" | "invalid_input" | "no_result" | "returned";
	}>;
}

interface ShadowCase {
	agent: ShadowAgentUsage | null;
	asOf: string;
	caseId: string;
	durationMs: number;
	errorSummary: string | null;
	errorType: string | null;
	outcome: WebsiteInvestigationArtifact["outcome"];
	selectedSignal: null | {
		changePercent: number | null;
		current: number;
		entityType: string;
		metric: string;
		period: NonNullable<WebsiteInvestigationArtifact["signal"]>["period"];
		previous: number | null;
		severity: string;
		subject: string;
	};
	status: string;
	toolCallCount: number;
	trace: Pick<InsightAgentStepTrace, "tools">[];
}

interface ShadowAgentUsage {
	cacheReadTokens: number;
	cacheWriteTokens: number;
	costFallback: boolean;
	estimatedCostUsd: number;
	inputTokens: number;
	modelId: string;
	outputTokens: number;
	reasoningTokens: number;
}

interface ShadowCostSummary {
	average: number;
	fallbackPricedInvestigations: number;
	investigations: number;
	max: number;
	min: number;
	total: number;
}

interface ShadowReport {
	aggregate: {
		agentCostUsd: ShadowCostSummary;
		cases: number;
		durationsMs: { p50: number; p95: number };
		status: Record<string, number>;
	};
	cases: ShadowCase[];
	meta: {
		asOfMode: AsOfMode;
		batchSize: number;
		concurrency: number;
		dataAccess: {
			clickhouse: "read_only";
			connectors: "current_reference_only";
			historicalTools: "time_bounded_analytics_only";
			postgres: "metadata_queries_read_only";
			redaction: "best_effort";
		};
		engine: "investigation agent";
		generatedAt: string;
		history: "in_memory";
		minEvents: number;
		model: string;
		offsets: number[];
		referenceTime: string;
		sites: number;
		workerConcurrency: number;
		workerFanout: boolean;
	};
}

interface ShadowObservation extends LatestInsightObservation {
	asOf: Date;
	evidence: string[];
}

function otherOpenWorkAt(
	observations: readonly ShadowObservation[],
	signalKey: string,
	through: Date
): InsightAgentInput["otherOpenWork"] {
	const seen = new Set<string>();
	const result: InsightAgentInput["otherOpenWork"] = [];
	for (const observation of [...observations]
		.filter(
			(item) => item.asOf <= through && item.signal.signalKey !== signalKey
		)
		.sort(
			(a, b) =>
				b.asOf.getTime() - a.asOf.getTime() ||
				b.signal.signalKey.localeCompare(a.signal.signalKey)
		)) {
		const key = observation.signal.signalKey;
		if (seen.has(key) || observation.outcome.next.type === "watch") {
			continue;
		}
		seen.add(key);
		if (
			observation.outcome.next.type === "act" ||
			observation.outcome.next.type === "ask"
		) {
			result.push({
				asOf: observation.asOf.toISOString(),
				next: observation.outcome.next,
				title: observation.outcome.title,
			});
			if (result.length === 8) {
				break;
			}
		}
	}
	return result;
}

function integerOption(value: string, name: string, minimum: number): number {
	const parsed = Number(value);
	if (!(Number.isInteger(parsed) && parsed >= minimum)) {
		throw new Error(
			`${name} must be ${minimum === 0 ? "a non-negative" : "a positive"} integer`
		);
	}
	return parsed;
}

function batchSizeOption(value: string): number {
	const batchSize = integerOption(value, "batch-size", 1);
	if (batchSize > MAX_BATCH_SIZE) {
		throw new Error(`batch-size must be at most ${MAX_BATCH_SIZE}`);
	}
	return batchSize;
}

function asOfModeOption(value: string): AsOfMode {
	if (value === "day" || value === "instant") {
		return value;
	}
	throw new Error("as-of-mode must be either day or instant");
}

function modelOption(value: string | undefined): string {
	const model = value?.trim();
	if (model) {
		return model;
	}
	throw new Error("model must be a non-empty gateway model id");
}

function resolveReferenceTime(value: string | undefined): Date {
	if (!value) {
		throw new Error("reference-time is required");
	}
	const result = new Date(value);
	if (Number.isNaN(result.getTime())) {
		throw new Error("reference-time must be a valid ISO timestamp");
	}
	return result;
}

function parseOptions(args: string[]): CliOptions {
	const { values } = parseArgs({
		args,
		options: {
			"as-of-mode": { default: "day", type: "string" },
			"batch-size": { default: "1", type: "string" },
			concurrency: { default: String(DEFAULT_CONCURRENCY), type: "string" },
			"confirm-read-only-production": { default: false, type: "boolean" },
			limit: { type: "string" },
			"min-events": { default: String(DEFAULT_MIN_EVENTS), type: "string" },
			model: { default: DEFAULT_MODEL, type: "string" },
			offsets: { type: "string" },
			output: { type: "string" },
			"reference-time": { type: "string" },
			"website-id": { type: "string" },
			"worker-concurrency": { default: "1", type: "string" },
			"worker-fanout": { default: false, type: "boolean" },
		},
		strict: true,
	});
	if (!values["confirm-read-only-production"]) {
		throw new Error(`Production shadow requires ${REQUIRED_CONFIRMATION}`);
	}
	const offsets = values.offsets
		? values.offsets
				.split(",")
				.map((value) => integerOption(value, "offset", 0))
		: DEFAULT_OFFSETS;
	if (new Set(offsets).size !== offsets.length) {
		throw new Error("Offsets must be unique");
	}
	const asOfMode = asOfModeOption(values["as-of-mode"]);
	if (asOfMode === "instant" && offsets.some((offset) => offset !== 0)) {
		throw new Error("as-of-mode=instant only supports offsets=0");
	}
	return {
		asOfMode,
		batchSize: batchSizeOption(values["batch-size"]),
		concurrency: integerOption(values.concurrency, "concurrency", 1),
		limit: values.limit ? integerOption(values.limit, "limit", 1) : null,
		minEvents: integerOption(values["min-events"], "min-events", 1),
		model: modelOption(values.model),
		offsets,
		output: values.output ?? null,
		referenceTime: resolveReferenceTime(values["reference-time"]),
		websiteId: values["website-id"]?.trim() || null,
		workerConcurrency: integerOption(
			values["worker-concurrency"],
			"worker-concurrency",
			1
		),
		workerFanout: values["worker-fanout"],
	};
}

function disableExternalEffects(): void {
	process.env.NODE_ENV = "test";
	process.env.SERVICE_NAME = "insights-production-shadow-readonly";
	process.env.DB_POOL_MAX = "1";
	for (const key of ["AXIOM_TOKEN", "SUPERLOG_API_KEY"]) {
		delete process.env[key];
	}
}

function configureReadOnlyClickHouse(): void {
	const readonlyUrl = process.env.CLICKHOUSE_READONLY_URL;
	if (!readonlyUrl) {
		throw new Error("CLICKHOUSE_READONLY_URL is required");
	}
	process.env.CLICKHOUSE_URL = readonlyUrl;
}

function silenceLibraryConsole(): () => void {
	const original = {
		debug: console.debug,
		error: console.error,
		info: console.info,
		log: console.log,
		warn: console.warn,
	};
	const silent = () => undefined;
	Object.assign(console, {
		debug: silent,
		error: silent,
		info: silent,
		log: silent,
		warn: silent,
	});
	return () => Object.assign(console, original);
}

function safeTimezone(value: unknown): string {
	if (typeof value !== "string" || !value.trim()) {
		return "UTC";
	}
	try {
		new Intl.DateTimeFormat("en", { timeZone: value }).format();
		return value;
	} catch {
		return "UTC";
	}
}

async function inReadOnlyTransaction<T>(
	work: (client: PoolClient) => Promise<T>
): Promise<T> {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required");
	}
	const pool = new Pool({
		application_name: "databuddy_insights_shadow_readonly",
		connectionString: process.env.DATABASE_URL,
		max: 1,
	});
	const client = await pool.connect();
	try {
		await client.query("BEGIN TRANSACTION READ ONLY");
		await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
		await client.query("SET LOCAL lock_timeout = 1000");
		const mode = await client.query<{ transaction_read_only: string }>(
			"SHOW transaction_read_only"
		);
		if (mode.rows[0]?.transaction_read_only !== "on") {
			throw new Error("Postgres transaction is not read-only");
		}
		return await work(client);
	} finally {
		await client.query("ROLLBACK").catch(() => undefined);
		client.release();
		await pool.end();
	}
}

async function loadCohort(
	minEvents: number,
	limit: number | null,
	referenceTime: Date
): Promise<string[]> {
	const { chQuery } = await import("@databuddy/db/clickhouse");
	const readonlySetting = await chQuery<{ readonly: number | string }>(
		"SELECT getSetting({setting:String}) AS readonly",
		{ setting: "readonly" }
	);
	if (Number(readonlySetting[0]?.readonly) < 1) {
		throw new Error("ClickHouse connection is not read-only");
	}
	const rows = await chQuery<{ id: string }>(
		`SELECT client_id AS id
		 FROM analytics.events
		 WHERE time >= toDateTime({referenceTime:String}, 'UTC') - INTERVAL 60 DAY
		   AND time < toStartOfDay(toDateTime({referenceTime:String}, 'UTC'))
		 GROUP BY client_id
		 HAVING count() >= {minEvents:UInt64}
		 ORDER BY count() DESC, id ASC
		 ${limit ? "LIMIT {limit:UInt32}" : ""}`,
		{
			minEvents,
			referenceTime: referenceTime.toISOString().slice(0, 19).replace("T", " "),
			...(limit ? { limit } : {}),
		}
	);
	return rows.map((row) => row.id);
}

function githubRepository(
	value: unknown
): { owner: string; repo: string } | null {
	if (!(value && typeof value === "object" && "github" in value)) {
		return null;
	}
	const github = value.github;
	if (!(github && typeof github === "object")) {
		return null;
	}
	const owner = "owner" in github ? github.owner : null;
	const repo = "repo" in github ? github.repo : null;
	return typeof owner === "string" && owner && typeof repo === "string" && repo
		? { owner, repo }
		: null;
}

function loadMetadata(ids: string[]): Promise<{
	annotations: AnnotationRow[];
	funnels: FunnelRow[];
	goals: GoalRow[];
	sites: RankedWebsite[];
}> {
	if (ids.length === 0) {
		return Promise.resolve({
			annotations: [],
			funnels: [],
			goals: [],
			sites: [],
		});
	}
	return inReadOnlyTransaction(async (client) => {
		const siteResult = await client.query<{
			domain: string;
			id: string;
			integrations: unknown;
			name: string | null;
			organizationId: string;
			organizationName: string;
			organizationSlug: string | null;
			timezone: string | null;
		}>(
			`SELECT w.id,
					w.organization_id AS "organizationId",
					w.domain,
					w.name,
					w.integrations,
					o.name AS "organizationName",
					o.slug AS "organizationSlug",
					c.timezone
					 FROM websites w
					 JOIN "organization" o ON o.id = w.organization_id
					 LEFT JOIN insight_generation_configs c
					   ON c.organization_id = w.organization_id
					 WHERE w.id = ANY($1::text[])
					   AND w."deletedAt" IS NULL
					 ORDER BY array_position($1::text[], w.id)`,
			[ids]
		);
		const funnelResult = await client.query<FunnelRow>(
			`SELECT id,
						website_id AS "websiteId",
						name,
						description,
						steps,
						filters,
						created_at AS "createdAt",
						updated_at AS "updatedAt"
					 FROM funnel_definitions
					 WHERE website_id = ANY($1::text[])
					   AND is_active = true
					   AND deleted_at IS NULL
					   AND jsonb_array_length(steps) > 1`,
			[ids]
		);
		const goalResult = await client.query<GoalRow>(
			`SELECT id,
						website_id AS "websiteId",
						name,
						description,
						type,
						target,
						filters,
						created_at AS "createdAt",
						updated_at AS "updatedAt"
					 FROM goals
					 WHERE website_id = ANY($1::text[])
					   AND is_active = true
					   AND deleted_at IS NULL`,
			[ids]
		);
		const annotationResult = await client.query<AnnotationRow>(
			`SELECT website_id AS "websiteId",
						x_value AS "xValue",
						text,
						created_at AS "createdAt",
						updated_at AS "updatedAt",
						deleted_at AS "deletedAt"
					 FROM annotations
					 WHERE website_id = ANY($1::text[])`,
			[ids]
		);
		const sites = siteResult.rows.map((row) => {
			const repository = githubRepository(row.integrations);
			return {
				domain: row.domain,
				githubRepository: repository,
				id: row.id,
				name: row.name,
				organizationId: row.organizationId,
				secrets: [
					row.id,
					row.domain,
					row.organizationId,
					row.name ?? "",
					row.organizationName,
					row.organizationSlug ?? "",
					repository?.owner ?? "",
					repository?.repo ?? "",
				],
				timezone: safeTimezone(row.timezone),
			};
		});
		return {
			sites,
			funnels: funnelResult.rows,
			goals: goalResult.rows,
			annotations: annotationResult.rows,
		};
	});
}

function dateAtOffset(
	referenceTime: Date,
	offsetDays: number,
	timezone: string
): string {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en", {
			day: "2-digit",
			month: "2-digit",
			timeZone: timezone,
			year: "numeric",
		})
			.formatToParts(referenceTime)
			.map((part) => [part.type, part.value])
	);
	const date = new Date(
		Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) -
			offsetDays * 86_400_000
	);
	return date.toISOString().slice(0, 10);
}

export function resolveShadowAsOf(
	referenceTime: Date,
	offsetDays: number,
	timezone: string,
	asOfMode: AsOfMode
): Date {
	if (asOfMode === "instant") {
		return new Date(referenceTime);
	}
	return resolveInvestigationAsOf(
		dateAtOffset(referenceTime, offsetDays, timezone),
		timezone
	);
}

function definitionsAt<T extends { createdAt: Date; updatedAt: Date }>(
	rows: T[],
	asOf: Date
): T[] {
	return rows
		.filter((row) => row.createdAt <= asOf && row.updatedAt <= asOf)
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

async function createSources(params: {
	annotations: AnnotationRow[];
	asOf: Date;
	excludedSignalKeys: ReadonlySet<string>;
	funnels: FunnelRow[];
	goals: GoalRow[];
	historical: boolean;
	model: string;
	observations: readonly ShadowObservation[];
	onAgentResult: (result: InsightAgentResult) => void;
	site: RankedWebsite;
	attemptSignal: AbortSignal;
	trace: InsightAgentStepTrace[];
}): Promise<InvestigationSources> {
	const [
		{ createModelFromId },
		{ detectSignals },
		{ defaultFunnelGoalDeps, detectFunnelGoalSignals },
		{
			defaultMeasurementRecommendationDeps,
			detectMeasurementRecommendationSignals,
		},
		{ signalAnnotationWindow, signalKeyForDetectedSignal },
		{ createToolkit },
		{ remeasureStoredSignal },
		{ detectRouteHealthSignals },
		{ runInsightAgent },
	] = await Promise.all([
		import("@databuddy/ai/config/models"),
		import("./detection"),
		import("./funnel-detection"),
		import("./measurement-recommendation-detection"),
		import("./investigation"),
		import("@databuddy/ai/tools/toolkit"),
		import("./generation"),
		import("./route-health-detection"),
		import("./agent"),
	]);
	const siteFunnels = definitionsAt(
		params.funnels.filter((row) => row.websiteId === params.site.id),
		params.asOf
	);
	const siteGoals = definitionsAt(
		params.goals.filter((row) => row.websiteId === params.site.id),
		params.asOf
	);
	const latestObservations = new Map<string, ShadowObservation>();
	for (const observation of params.observations) {
		latestObservations.set(observation.signal.signalKey, observation);
	}
	const withAttemptSignal = (signal?: AbortSignal) =>
		signal
			? AbortSignal.any([params.attemptSignal, signal])
			: params.attemptSignal;
	const isExcluded = (signal: DetectedSignal) =>
		params.excludedSignalKeys.has(signalKeyForDetectedSignal(signal));
	let historicalTools: ToolSet | undefined;
	if (params.historical) {
		const getData = createToolkit({ capabilities: ["analytics"] }).get_data;
		if (!getData) {
			throw new Error("Historical analytics tool is unavailable");
		}
		historicalTools = { get_data: getData };
	}
	const funnelGoalDependencies = () => {
		const base = defaultFunnelGoalDeps(params.site.id, params.asOf);
		return {
			...base,
			fetchFunnels: async () => siteFunnels,
			fetchGoals: async () => siteGoals,
			funnelConversion: (
				funnel: FunnelDef,
				range: Parameters<typeof base.funnelConversion>[1],
				signal?: AbortSignal
			) => base.funnelConversion(funnel, range, withAttemptSignal(signal)),
			goalConversion: (
				goal: GoalDef,
				range: Parameters<typeof base.goalConversion>[1],
				signal?: AbortSignal
			) => base.goalConversion(goal, range, withAttemptSignal(signal)),
		};
	};
	const measurementRecommendationDependencies = () => {
		const base = defaultMeasurementRecommendationDeps(
			params.site.id,
			params.asOf,
			params.site.timezone
		);
		return {
			...base,
			fetchDefinitionCounts: async () => ({
				activeFunnels: siteFunnels.length,
				activeGoals: siteGoals.length,
			}),
			fetchTelemetry: (
				range: { from: string; to: string },
				signal?: AbortSignal
			) => base.fetchTelemetry(range, withAttemptSignal(signal)),
		};
	};
	return {
		detectDefinitionSignals: async (detectParams, today, _deps, options) =>
			(
				await detectFunnelGoalSignals(
					detectParams,
					today,
					funnelGoalDependencies(),
					options
				)
			).filter((signal) => !isExcluded(signal)),
		detectMeasurementRecommendationSignals: async (
			detectParams,
			today,
			_deps,
			signal
		) =>
			(
				await detectMeasurementRecommendationSignals(
					detectParams,
					today,
					measurementRecommendationDependencies(),
					withAttemptSignal(signal)
				)
			).filter((candidate) => !isExcluded(candidate)),
		detectMetricSignals: async (
			detectParams,
			queryFn,
			today,
			signal,
			diagnostics
		) =>
			(
				await detectSignals(
					detectParams,
					queryFn,
					today,
					withAttemptSignal(signal),
					diagnostics
				)
			).filter((candidate) => !isExcluded(candidate)),
		detectRouteHealthSignals: async (detectParams, today, _deps, signal) =>
			(
				await detectRouteHealthSignals(
					detectParams,
					today,
					undefined,
					withAttemptSignal(signal)
				)
			).filter((candidate) => !isExcluded(candidate)),
		fetchAnnotations: (_websiteId, signal, _asOf, timezone) => {
			const window = signalAnnotationWindow(signal, timezone);
			return Promise.resolve(
				params.annotations
					.filter(
						(row) =>
							row.websiteId === params.site.id &&
							row.xValue >= window.from &&
							row.xValue <= window.to &&
							row.createdAt <= params.asOf &&
							row.updatedAt <= params.asOf &&
							(row.deletedAt === null || row.deletedAt > params.asOf)
					)
					.sort((a, b) => a.xValue.getTime() - b.xValue.getTime())
					.slice(0, 10)
					.map(
						(row): InvestigationAnnotation => ({
							date: row.xValue.toISOString().slice(0, 10),
							title: row.text,
						})
					)
			);
		},
		investigateSignal: async (input) => {
			const result = await runInsightAgent(input, {
				abortSignal: params.attemptSignal,
				model: createModelFromId(params.model),
				...(historicalTools ? { tools: historicalTools } : {}),
				onStepFinish: (step) => {
					params.trace.push(projectStep(step));
				},
			});
			params.onAgentResult(result);
			return result;
		},
		loadDueInvestigation: () => {
			const due = [...latestObservations.values()]
				.filter(
					(observation) =>
						observation.outcome.next.type !== "resolve" &&
						observation.recheckAt <= params.asOf &&
						!params.excludedSignalKeys.has(observation.signal.signalKey)
				)
				.sort(
					(a, b) =>
						a.recheckAt.getTime() - b.recheckAt.getTime() ||
						a.signal.signalKey.localeCompare(b.signal.signalKey)
				)[0];
			return Promise.resolve(
				due
					? {
							evidence: due.evidence,
							outcome: due.outcome,
							recheckAt: due.recheckAt,
							signal: due.signal,
						}
					: null
			);
		},
		loadHistory: ({ signalKey }) =>
			Promise.resolve(
				params.observations
					.filter((observation) => observation.signal.signalKey === signalKey)
					.map((observation) => ({
						asOf: observation.asOf.toISOString(),
						evidence: observation.evidence,
						kind: "investigation" as const,
						outcome: observation.outcome,
						signal: observation.signal,
					}))
			),
		loadOtherOpenWork: ({ signalKey, through }) =>
			Promise.resolve(otherOpenWorkAt(params.observations, signalKey, through)),
		loadObservations: () =>
			Promise.resolve(
				new Map<string, LatestInsightObservation>(latestObservations)
			),
		remeasureSignal: (detectParams, prior, today, signal) =>
			remeasureStoredSignal(
				detectParams,
				prior,
				today,
				withAttemptSignal(signal),
				{ funnelGoal: funnelGoalDependencies() }
			),
	};
}

interface PlannedWorkerSignal {
	signal: DetectedSignal;
	signalKey: string;
}

async function planWorkerSignals(params: {
	asOf: Date;
	batchSize: number;
	site: RankedWebsite;
	sources: InvestigationSources;
	attemptSignal: AbortSignal;
}): Promise<PlannedWorkerSignal[]> {
	const [{ planCoveragePortfolio }, { signalKeyForDetectedSignal }] =
		await Promise.all([
			import("./coverage-planner"),
			import("./investigation"),
		]);
	const detectParams = {
		lookbackDays: 7,
		timezone: params.site.timezone,
		websiteId: params.site.id,
	};
	const today = dayjs(params.asOf).tz(params.site.timezone);
	const metricDiagnostics: DetectionDiagnostics = { failedFamilies: 0 };
	const definitionDiagnostics: FunnelGoalDetectionDiagnostics = {
		failedDefinitions: 0,
	};
	const due = await params.sources.loadDueInvestigation({
		asOf: params.asOf,
		organizationId: params.site.organizationId,
		websiteId: params.site.id,
	});
	const [
		dueResult,
		metricResult,
		definitionResult,
		measurementResult,
		routeHealthResult,
	] = await Promise.allSettled([
		due
			? params.sources.remeasureSignal(
					detectParams,
					due.signal,
					today,
					params.attemptSignal
				)
			: Promise.resolve(null),
		params.sources.detectMetricSignals(
			detectParams,
			undefined,
			today,
			params.attemptSignal,
			metricDiagnostics
		),
		params.sources.detectDefinitionSignals(detectParams, today, undefined, {
			diagnostics: definitionDiagnostics,
		}),
		params.sources.detectMeasurementRecommendationSignals(
			detectParams,
			today,
			undefined,
			params.attemptSignal
		),
		params.sources.detectRouteHealthSignals(
			detectParams,
			today,
			undefined,
			params.attemptSignal
		),
	]);
	const failed = [
		dueResult,
		metricResult,
		definitionResult,
		measurementResult,
		routeHealthResult,
	].find((result) => result.status === "rejected");
	const signalsByKey = new Map<string, DetectedSignal>();
	for (const signal of [
		...(dueResult.status === "fulfilled" && dueResult.value
			? [dueResult.value]
			: []),
		...(metricResult.status === "fulfilled" ? metricResult.value : []),
		...(definitionResult.status === "fulfilled" ? definitionResult.value : []),
		...(measurementResult.status === "fulfilled"
			? measurementResult.value
			: []),
		...(routeHealthResult.status === "fulfilled"
			? routeHealthResult.value
			: []),
	]) {
		const key = signalKeyForDetectedSignal(signal);
		if (!signalsByKey.has(key)) {
			signalsByKey.set(key, signal);
		}
	}
	if (signalsByKey.size === 0 && failed?.status === "rejected") {
		throw failed.reason;
	}
	return planCoveragePortfolio([...signalsByKey.values()], {
		dueSignalKey:
			dueResult.status === "fulfilled" && dueResult.value
				? signalKeyForDetectedSignal(dueResult.value)
				: null,
		reason: "manual",
	})
		.slice(0, params.batchSize)
		.map((signal) => ({
			signal,
			signalKey: signalKeyForDetectedSignal(signal),
		}));
}

async function runCancellableAttempt<T>(
	work: (signal: AbortSignal) => Promise<T>,
	timeoutMs = CASE_ATTEMPT_TIMEOUT_MS
): Promise<T> {
	const controller = new AbortController();
	const timeoutError = new Error(
		`Production shadow attempt exceeded ${timeoutMs}ms`
	);
	timeoutError.name = "TimeoutError";
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			controller.abort(timeoutError);
			reject(timeoutError);
		}, timeoutMs);
	});

	try {
		return await Promise.race([work(controller.signal), deadline]);
	} catch (error) {
		controller.abort(error);
		throw error;
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
}

function countBy(values: string[]): Record<string, number> {
	const result: Record<string, number> = {};
	for (const value of values) {
		result[value] = (result[value] ?? 0) + 1;
	}
	return result;
}

function projectStep(step: StepResult<ToolSet>): InsightAgentStepTrace {
	const returned = new Map(
		step.toolResults.map((result) => [result.toolCallId, result.output])
	);
	const errors = new Map(
		step.content.flatMap((part) =>
			part.type === "tool-error" ? [[part.toolCallId, part.error] as const] : []
		)
	);
	return {
		cacheReadTokens: step.usage.inputTokenDetails?.cacheReadTokens ?? null,
		cacheWriteTokens: step.usage.inputTokenDetails?.cacheWriteTokens ?? null,
		inputTokens: step.usage.inputTokens ?? null,
		modelId: step.model.modelId,
		outputTokens: step.usage.outputTokens ?? null,
		reasoningTokens: step.usage.outputTokenDetails?.reasoningTokens ?? null,
		tools: step.toolCalls.map((call) => {
			const output = returned.get(call.toolCallId);
			const resultError =
				typeof output === "object" &&
				output !== null &&
				"error" in output &&
				typeof output.error === "string";
			const invalid = "invalid" in call && call.invalid === true;
			const error = errors.get(call.toolCallId);
			return {
				errorType: invalid
					? "AI_InvalidToolInputError"
					: resultError
						? "ToolResultError"
						: error instanceof Error
							? error.name
							: error === undefined
								? null
								: typeof error,
				name: call.toolName,
				outcome: invalid
					? "invalid_input"
					: resultError || errors.has(call.toolCallId)
						? "execution_error"
						: returned.has(call.toolCallId)
							? "returned"
							: "no_result",
			};
		}),
	};
}

function percentile(values: number[], quantile: number): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[
		Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))
	];
}

const TOKEN_CHARACTER = /[\p{L}\p{N}_]/u;

function redactSecret(value: string, secret: string): string {
	const escaped = RegExp.escape(secret);
	const start = TOKEN_CHARACTER.test(secret[0] ?? "")
		? "(?<![\\p{L}\\p{N}_])"
		: "";
	const end = TOKEN_CHARACTER.test(secret.at(-1) ?? "")
		? "(?![\\p{L}\\p{N}_])"
		: "";
	return value.replace(
		new RegExp(`${start}${escaped}${end}`, "giu"),
		"[entity]"
	);
}

function sanitizeText(value: string, secrets: string[]): string {
	let output = value;
	for (const secret of [...new Set(secrets)]
		.filter((item) => item.length >= 2)
		.sort((a, b) => b.length - a.length)) {
		output = redactSecret(output, secret);
	}
	return output
		.replace(
			/\b(utm_(?:source|medium|campaign|content|term)=)[^\s,;]+/gi,
			"$1[entity]"
		)
		.replace(
			/\b(campaign(?:\s+id)?\s*[:=]\s*)[a-z0-9][\w.-]{2,}/gi,
			"$1[entity]"
		)
		.replace(/https?:\/\/[^\s"'“”]+/gi, "[url]")
		.replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[email]")
		.replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi, "[domain]")
		.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[entity]")
		.replace(/\/(?:[^\s.,;:!?()[\]{}]+\/)*[^\s.,;:!?()[\]{}]*/g, "[path]");
}

function sanitizeOutcome(
	outcome: WebsiteInvestigationArtifact["outcome"],
	secrets: string[],
	subject?: { alias: string; value: string }
): WebsiteInvestigationArtifact["outcome"] {
	return outcome
		? JSON.parse(
				JSON.stringify(outcome, (_key, value) =>
					typeof value === "string"
						? sanitizeText(
								subject
									? value.replaceAll(subject.value, subject.alias)
									: value,
								secrets
							)
						: value
				)
			)
		: null;
}

export function metricFamily(key: string): string {
	if (key.startsWith("goal:")) {
		return "goal";
	}
	if (key.startsWith("funnel:")) {
		return "funnel";
	}
	if (key.startsWith("custom_event:")) {
		return "custom_event";
	}
	if (key.startsWith("error:")) {
		return "error";
	}
	if (key.startsWith("route:")) {
		return "route_health";
	}
	if (key.startsWith("measurement:")) {
		return "measurement";
	}
	return key;
}

function projectAgentUsage(
	result: InsightAgentResult
): ShadowAgentUsage | null {
	if (!(result.modelId && result.usage)) {
		return null;
	}
	const usage = summarizeAgentUsage(result.modelId, result.usage);
	return {
		cacheReadTokens: usage.cache_read_tokens,
		cacheWriteTokens: usage.cache_write_tokens,
		costFallback: usage.cost_fallback,
		estimatedCostUsd: usage.cost_total_usd,
		inputTokens: usage.input_tokens,
		modelId: result.modelId,
		outputTokens: usage.output_tokens,
		reasoningTokens: usage.reasoning_tokens,
	};
}

function projectTraceUsage(
	trace: InsightAgentStepTrace[]
): ShadowAgentUsage | null {
	const steps = trace.filter(
		(step) => step.inputTokens !== null || step.outputTokens !== null
	);
	if (steps.length === 0) {
		return null;
	}
	const priced = steps.map((step) => {
		const inputTokens = step.inputTokens ?? 0;
		const outputTokens = step.outputTokens ?? 0;
		const cacheReadTokens = step.cacheReadTokens ?? 0;
		const cacheWriteTokens = step.cacheWriteTokens ?? 0;
		const reasoningTokens = step.reasoningTokens ?? 0;
		return summarizeAgentUsage(step.modelId, {
			inputTokens,
			outputTokens,
			totalTokens: inputTokens + outputTokens,
			inputTokenDetails: {
				cacheReadTokens,
				cacheWriteTokens,
				noCacheTokens: Math.max(
					0,
					inputTokens - cacheReadTokens - cacheWriteTokens
				),
			},
			outputTokenDetails: {
				reasoningTokens,
				textTokens: Math.max(0, outputTokens - reasoningTokens),
			},
		});
	});
	const sum = (pick: (usage: UsageTelemetry) => number): number =>
		priced.reduce((total, usage) => total + pick(usage), 0);
	return {
		cacheReadTokens: sum((usage) => usage.cache_read_tokens),
		cacheWriteTokens: sum((usage) => usage.cache_write_tokens),
		costFallback: priced.some((usage) => usage.cost_fallback),
		estimatedCostUsd: sum((usage) => usage.cost_total_usd),
		inputTokens: sum((usage) => usage.input_tokens),
		modelId: [...new Set(steps.map((step) => step.modelId))].join(","),
		outputTokens: sum((usage) => usage.output_tokens),
		reasoningTokens: sum((usage) => usage.reasoning_tokens),
	};
}

function subjectAliasForSignal(
	signal: NonNullable<WebsiteInvestigationArtifact["signal"]>,
	subjectAliases: Map<string, string>
): string | null {
	const subjectKey = `${signal.entity.type}:${signal.entity.id}`;
	const existing = subjectAliases.get(subjectKey);
	if (existing) {
		return existing;
	}
	const normalized = signal.entity.type.replaceAll("_", " ");
	const entity = `${normalized[0]?.toUpperCase() ?? ""}${normalized.slice(1)}`;
	const alias = `${entity} ${subjectAliases.size + 1}`;
	subjectAliases.set(subjectKey, alias);
	return alias;
}

function subjectAliasFor(
	artifact: WebsiteInvestigationArtifact,
	subjectAliases: Map<string, string>
): string | null {
	return artifact.signal
		? subjectAliasForSignal(artifact.signal, subjectAliases)
		: null;
}

function projectSelectedSignal(
	signal: WebsiteInvestigationArtifact["signal"],
	subjectAlias: string | null
): ShadowCase["selectedSignal"] {
	return signal
		? {
				changePercent: signal.changePercent,
				current: signal.metric.current,
				entityType: signal.entity.type,
				metric: metricFamily(signal.signalKey),
				period: signal.period,
				previous: signal.metric.previous ?? null,
				severity: signal.severity,
				subject: subjectAlias ?? "[entity]",
			}
		: null;
}

function projectCase(params: {
	agent: ShadowAgentUsage | null;
	artifact: WebsiteInvestigationArtifact;
	caseId: string;
	durationMs: number;
	secrets: string[];
	subjectAlias: string | null;
	trace: InsightAgentStepTrace[];
}): ShadowCase {
	const { artifact } = params;
	return {
		agent: params.agent,
		asOf: artifact.asOf,
		caseId: params.caseId,
		durationMs: params.durationMs,
		errorType: null,
		errorSummary: null,
		outcome: sanitizeOutcome(
			artifact.outcome,
			params.secrets,
			artifact.signal && params.subjectAlias
				? {
						alias: params.subjectAlias,
						value: artifact.signal.entity.label,
					}
				: undefined
		),
		selectedSignal: projectSelectedSignal(artifact.signal, params.subjectAlias),
		status: artifact.status,
		trace: params.trace.map(({ tools }) => ({ tools })),
		toolCallCount: params.trace.reduce(
			(count, step) => count + step.tools.length,
			0
		),
	};
}

function failedCase(params: {
	agent: ShadowAgentUsage | null;
	asOf: Date;
	caseId: string;
	durationMs: number;
	error: unknown;
	selectedSignal?: WebsiteInvestigationArtifact["signal"];
	secrets: string[];
	subjectAlias?: string | null;
	trace: InsightAgentStepTrace[];
}): ShadowCase {
	const cause =
		params.error instanceof Error &&
		typeof params.error.cause === "object" &&
		params.error.cause &&
		"message" in params.error.cause &&
		typeof params.error.cause.message === "string"
			? params.error.cause.message
			: null;
	const message =
		params.error instanceof Error
			? [params.error.message, cause].filter(Boolean).join(": ")
			: "Unknown failure";
	return {
		agent: params.agent,
		asOf: params.asOf.toISOString(),
		caseId: params.caseId,
		durationMs: params.durationMs,
		errorSummary: sanitizeText(message, params.secrets).slice(0, 500),
		errorType:
			params.error instanceof Error
				? params.error.constructor.name
				: typeof params.error,
		outcome: null,
		selectedSignal: projectSelectedSignal(
			params.selectedSignal ?? null,
			params.subjectAlias ?? null
		),
		status: "error",
		trace: params.trace.map(({ tools }) => ({ tools })),
		toolCallCount: params.trace.reduce(
			(count, step) => count + step.tools.length,
			0
		),
	};
}

async function mapConcurrent<T, R>(
	items: T[],
	concurrency: number,
	work: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, async () => {
			while (next < items.length) {
				const index = next;
				next += 1;
				results[index] = await work(items[index], index);
			}
		})
	);
	return results;
}

function aggregateCases(cases: ShadowCase[]): ShadowReport["aggregate"] {
	return {
		agentCostUsd: summarizeInvestigationCosts(cases.map((item) => item.agent)),
		cases: cases.length,
		durationsMs: {
			p50: percentile(
				cases.map((item) => item.durationMs),
				0.5
			),
			p95: percentile(
				cases.map((item) => item.durationMs),
				0.95
			),
		},
		status: countBy(cases.map((item) => item.status)),
	};
}

function summarizeInvestigationCosts(
	usages: Array<ShadowAgentUsage | null>
): ShadowCostSummary {
	const investigations = usages.filter(
		(value): value is ShadowAgentUsage => value !== null
	);
	const costs = investigations.map((value) => value.estimatedCostUsd);
	const total = costs.reduce((sum, value) => sum + value, 0);
	return {
		average: costs.length === 0 ? 0 : total / costs.length,
		fallbackPricedInvestigations: investigations.filter(
			(value) => value.costFallback
		).length,
		investigations: costs.length,
		max: Math.max(0, ...costs),
		min: costs.length === 0 ? 0 : Math.min(...costs),
		total,
	};
}

function assertOutsideRepository(output: string): string {
	const absolute = resolve(output);
	const repository = resolve(import.meta.dir, "../../..");
	if (absolute === repository || absolute.startsWith(`${repository}/`)) {
		throw new Error("Production shadow reports must be written outside Git");
	}
	return absolute;
}

async function closeShadowConnections(): Promise<void> {
	const [{ clickHouse }, { shutdownRedis }] = await Promise.all([
		import("@databuddy/db/clickhouse"),
		import("@databuddy/redis/redis"),
	]);
	await Promise.allSettled([clickHouse.close(), shutdownRedis()]);
}

async function runProductionShadow(options: CliOptions): Promise<ShadowReport> {
	disableExternalEffects();
	configureReadOnlyClickHouse();
	const referenceTime = options.referenceTime;
	const restoreConsole = silenceLibraryConsole();
	try {
		const ranked = options.websiteId
			? [options.websiteId]
			: await loadCohort(options.minEvents, options.limit, referenceTime);
		const metadata = await loadMetadata(ranked);
		const [
			{ investigateWebsiteWithSources },
			{ prepareInvestigation },
			{ nextRecheckAt },
		] = await Promise.all([
			import("./generation"),
			import("./investigation"),
			import("./observations"),
		]);
		const siteCases = await mapConcurrent(
			metadata.sites,
			options.concurrency,
			async (site, siteIndex) => {
				const observations: ShadowObservation[] = [];
				const subjectAliases = new Map<string, string>();
				const cases: ShadowCase[] = [];
				const definitions = [
					...metadata.funnels.filter((row) => row.websiteId === site.id),
					...metadata.goals.filter((row) => row.websiteId === site.id),
				];
				const siteSecrets = [
					...site.secrets,
					...definitions.flatMap((definition) => [
						definition.id,
						definition.name,
						definition.description ?? "",
						...("target" in definition ? [definition.target] : []),
						...(definition.filters?.flatMap((filter) =>
							Array.isArray(filter.value) ? filter.value : [filter.value]
						) ?? []),
						...("steps" in definition
							? definition.steps.flatMap((step) => [step.name, step.target])
							: []),
					]),
					...metadata.annotations
						.filter((row) => row.websiteId === site.id)
						.map((row) => row.text),
				];
				for (const offsetDays of [...options.offsets].sort((a, b) => b - a)) {
					const caseIdPrefix = `site-${String(siteIndex + 1).padStart(2, "0")}@d-${offsetDays}`;
					const asOf = resolveShadowAsOf(
						referenceTime,
						offsetDays,
						site.timezone,
						options.asOfMode
					);
					const offsetStartedAt = Date.now();
					const input = {
						asOf,
						domain: site.domain,
						forceRecheck: true,
						githubRepository: offsetDays === 0 ? site.githubRepository : null,
						name: site.name,
						organizationId: site.organizationId,
						timezone: site.timezone,
						websiteId: site.id,
					};
					if (options.workerFanout) {
						const preRunObservations = [...observations];
						let planned: PlannedWorkerSignal[];
						try {
							planned = await runCancellableAttempt(async (attemptSignal) => {
								const sources = await createSources({
									annotations: metadata.annotations,
									asOf,
									attemptSignal,
									excludedSignalKeys: new Set<string>(),
									funnels: metadata.funnels,
									goals: metadata.goals,
									historical: offsetDays > 0,
									model: options.model,
									observations: preRunObservations,
									onAgentResult: () => undefined,
									site,
									trace: [],
								});
								return planWorkerSignals({
									asOf,
									attemptSignal,
									batchSize: options.batchSize,
									site,
									sources,
								});
							});
						} catch (error) {
							cases.push(
								failedCase({
									agent: null,
									asOf,
									caseId: `${caseIdPrefix}#plan-error`,
									durationMs: Date.now() - offsetStartedAt,
									error,
									secrets: siteSecrets,
									trace: [],
								})
							);
							continue;
						}
						if (planned.length === 0) {
							cases.push(
								projectCase({
									agent: null,
									artifact: {
										asOf: asOf.toISOString(),
										evidence: [],
										outcome: null,
										signal: null,
										status: "no_signals",
									},
									caseId: `${caseIdPrefix}#worker-0`,
									durationMs: Date.now() - offsetStartedAt,
									secrets: siteSecrets,
									subjectAlias: null,
									trace: [],
								})
							);
							continue;
						}
						const attemptsBySignal = new Map<
							string,
							{
								agent: ShadowAgentUsage | null;
								durationMs: number;
								trace: InsightAgentStepTrace[];
							}
						>();
						const workerResults = await runBoundedWorkerFanout(
							planned,
							options.workerConcurrency,
							async (worker) => {
								const startedAt = Date.now();
								const trace: InsightAgentStepTrace[] = [];
								let agent: ShadowAgentUsage | null = null;
								try {
									const artifact = await runCancellableAttempt(
										async (attemptSignal) => {
											const sources = await createSources({
												annotations: metadata.annotations,
												asOf,
												attemptSignal,
												excludedSignalKeys: new Set<string>(),
												funnels: metadata.funnels,
												goals: metadata.goals,
												historical: offsetDays > 0,
												model: options.model,
												observations: preRunObservations,
												onAgentResult: (result) => {
													agent = projectAgentUsage(result);
												},
												site,
												trace,
											});
											return investigateWebsiteWithSources(
												{ ...input, selectedSignalKey: worker.signalKey },
												sources
											);
										}
									);
									attemptsBySignal.set(worker.signalKey, {
										agent,
										durationMs: Date.now() - startedAt,
										trace,
									});
									return artifact;
								} catch (error) {
									attemptsBySignal.set(worker.signalKey, {
										agent: agent ?? projectTraceUsage(trace),
										durationMs: Date.now() - startedAt,
										trace,
									});
									throw error;
								}
							}
						);
						for (const [workerIndex, result] of workerResults.entries()) {
							const attempt = attemptsBySignal.get(
								result.candidate.signalKey
							) ?? {
								agent: null,
								durationMs: 0,
								trace: [],
							};
							if (result.status === "rejected") {
								const selectedSignal = prepareInvestigation(
									result.candidate.signal,
									7
								).signal;
								const subjectAlias = subjectAliasForSignal(
									selectedSignal,
									subjectAliases
								);
								cases.push(
									failedCase({
										agent: attempt.agent,
										asOf,
										caseId: `${caseIdPrefix}#worker-${workerIndex + 1}`,
										durationMs: attempt.durationMs,
										error: result.reason,
										selectedSignal,
										secrets: [
											...siteSecrets,
											selectedSignal.entity.id,
											selectedSignal.entity.label,
										],
										subjectAlias,
										trace: attempt.trace,
									})
								);
								continue;
							}
							const artifact = result.value;
							const secrets = [
								...siteSecrets,
								artifact.signal?.entity.id ?? "",
								artifact.signal?.entity.label ?? "",
							];
							cases.push(
								projectCase({
									agent: attempt.agent,
									artifact,
									caseId: `${caseIdPrefix}#worker-${workerIndex + 1}`,
									durationMs: attempt.durationMs,
									secrets,
									subjectAlias: subjectAliasFor(artifact, subjectAliases),
									trace: attempt.trace,
								})
							);
						}
						continue;
					}
					const attempts = new WeakMap<
						WebsiteInvestigationArtifact,
						{
							agent: ShadowAgentUsage | null;
							durationMs: number;
							trace: InsightAgentStepTrace[];
						}
					>();
					let failedAttempt:
						| {
								agent: ShadowAgentUsage | null;
								durationMs: number;
								trace: InsightAgentStepTrace[];
						  }
						| undefined;
					try {
						const artifacts = await runDistinctSignalBatch(
							options.batchSize,
							async (excludedSignalKeys) => {
								const startedAt = Date.now();
								const trace: InsightAgentStepTrace[] = [];
								let agent: ShadowAgentUsage | null = null;
								let artifact: WebsiteInvestigationArtifact;
								try {
									artifact = await runCancellableAttempt(
										async (attemptSignal) => {
											const sources = await createSources({
												annotations: metadata.annotations,
												asOf,
												attemptSignal,
												excludedSignalKeys,
												funnels: metadata.funnels,
												goals: metadata.goals,
												historical: offsetDays > 0,
												model: options.model,
												observations,
												onAgentResult: (result) => {
													agent = projectAgentUsage(result);
												},
												site,
												trace,
											});
											return investigateWebsiteWithSources(input, sources);
										}
									);
								} catch (error) {
									failedAttempt = {
										agent: agent ?? projectTraceUsage(trace),
										durationMs: Date.now() - startedAt,
										trace,
									};
									throw error;
								}
								attempts.set(artifact, {
									agent,
									durationMs: Date.now() - startedAt,
									trace,
								});
								return artifact;
							},
							(artifact) => {
								if (artifact.outcome && artifact.signal) {
									observations.push({
										asOf,
										evidence: artifact.evidence,
										outcome: artifact.outcome,
										recheckAt: nextRecheckAt(asOf, artifact.outcome.next),
										signal: artifact.signal,
									});
								}
							}
						);
						for (const [batchIndex, artifact] of artifacts.entries()) {
							const attempt = attempts.get(artifact) ?? {
								agent: failedAttempt?.agent ?? null,
								durationMs: 0,
								trace: [],
							};
							const secrets = [
								...siteSecrets,
								artifact.signal?.entity.id ?? "",
								artifact.signal?.entity.label ?? "",
							];
							let subjectAlias: string | null = null;
							if (artifact.signal) {
								const subjectKey = `${artifact.signal.entity.type}:${artifact.signal.entity.id}`;
								subjectAlias = subjectAliases.get(subjectKey) ?? null;
								if (!subjectAlias) {
									const normalized = artifact.signal.entity.type.replaceAll(
										"_",
										" "
									);
									const entity = `${normalized[0]?.toUpperCase() ?? ""}${normalized.slice(1)}`;
									subjectAlias = `${entity} ${subjectAliases.size + 1}`;
									subjectAliases.set(subjectKey, subjectAlias);
								}
							}
							cases.push(
								projectCase({
									agent: attempt.agent,
									artifact,
									caseId: `${caseIdPrefix}#${batchIndex + 1}`,
									durationMs: attempt.durationMs,
									secrets,
									subjectAlias,
									trace: attempt.trace,
								})
							);
						}
					} catch (error) {
						cases.push(
							failedCase({
								agent: failedAttempt?.agent ?? null,
								asOf,
								caseId: `${caseIdPrefix}#error`,
								durationMs:
									failedAttempt?.durationMs ?? Date.now() - offsetStartedAt,
								error,
								secrets: siteSecrets,
								trace: failedAttempt?.trace ?? [],
							})
						);
					}
				}
				return cases;
			}
		);
		const cases = siteCases.flat();
		return {
			aggregate: aggregateCases(cases),
			cases,
			meta: {
				asOfMode: options.asOfMode,
				batchSize: options.batchSize,
				concurrency: options.concurrency,
				dataAccess: {
					clickhouse: "read_only",
					connectors: "current_reference_only",
					historicalTools: "time_bounded_analytics_only",
					postgres: "metadata_queries_read_only",
					redaction: "best_effort",
				},
				engine: "investigation agent",
				generatedAt: new Date().toISOString(),
				history: "in_memory",
				minEvents: options.minEvents,
				model: options.model,
				offsets: options.offsets,
				referenceTime: referenceTime.toISOString(),
				sites: metadata.sites.length,
				workerConcurrency: options.workerConcurrency,
				workerFanout: options.workerFanout,
			},
		};
	} finally {
		try {
			await closeShadowConnections();
		} finally {
			restoreConsole();
		}
	}
}

if (import.meta.main) {
	try {
		const options = parseOptions(process.argv.slice(2));
		const output = options.output
			? assertOutsideRepository(options.output)
			: null;
		const result = await runProductionShadow(options);
		if (output) {
			await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
			await chmod(output, 0o600);
		}
		process.stdout.write(
			`${JSON.stringify({ aggregate: result.aggregate, meta: result.meta }, null, 2)}\n`
		);
		if ((result.aggregate.status.error ?? 0) > 0) {
			process.exitCode = 1;
		}
	} catch (error) {
		const type = error instanceof Error ? error.constructor.name : typeof error;
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(
			`Production shadow failed (${type}): ${sanitizeText(message, []).slice(0, 500)}\n`
		);
		process.exitCode = 1;
	}
}
