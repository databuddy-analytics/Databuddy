import { chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Pool, type PoolClient } from "pg";
import {
	summarizeAgentUsage,
	type UsageTelemetry,
} from "@databuddy/ai/lib/usage-telemetry";
import { usdToAgentCredits } from "@databuddy/shared/agent-credits";
import { computeCaseCost, hasModelPricing } from "./costs";
import type {
	InvestigationSources,
	WebsiteInvestigationArtifact,
} from "../../../apps/insights/src/generation";
import type {
	InsightAgentResult,
	InsightAgentStepTrace,
} from "../../../apps/insights/src/agent";
import type {
	FunnelDef,
	GoalDef,
} from "../../../apps/insights/src/funnel-detection";
import type { InvestigationAnnotation } from "../../../apps/insights/src/investigation";
import type { LatestInsightObservation } from "../../../apps/insights/src/observations";

const REQUIRED_CONFIRMATION = "--confirm-read-only-production";
const DEFAULT_OFFSETS = [60, 30, 7, 0];
const DEFAULT_MIN_EVENTS = 25_000;
const DEFAULT_CONCURRENCY = 2;
const STATEMENT_TIMEOUT_MS = 60_000;
const CASE_ATTEMPT_TIMEOUT_MS = 150_000;
const WORD_SEPARATOR = /\s+/u;

interface CliOptions {
	concurrency: number;
	limit: number | null;
	minEvents: number;
	model: string;
	offsets: number[];
	output: string | null;
	referenceTime: Date;
}

interface RankedWebsite {
	domain: string;
	githubRepository: { owner: string; repo: string } | null;
	id: string;
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

interface ShadowCase {
	agent: ShadowAgentUsage | null;
	asOf: string;
	caseId: string;
	contextFacts: number;
	detectedSignalCount: number;
	detectionComplete: boolean;
	durationMs: number;
	errorSummary: string | null;
	errorType: string | null;
	githubAvailable: boolean;
	offsetDays: number;
	outcome: WebsiteInvestigationArtifact["outcome"];
	outcomeWords: number | null;
	selectedSignal: null | {
		changePercent: number | null;
		current: number;
		entityType: string;
		method: string;
		metric: string;
		period: NonNullable<WebsiteInvestigationArtifact["signal"]>["period"];
		previous: number | null;
		sentiment: string;
		severity: string;
	};
	status: string;
	toolCallCount: number;
	trace: Pick<InsightAgentStepTrace, "tools">[];
}

export interface ShadowAgentUsage {
	cacheReadTokens: number;
	cacheWriteTokens: number;
	costFallback: boolean;
	estimatedCostUsd: number;
	inputTokens: number;
	modelId: string;
	outputTokens: number;
	reasoningTokens: number;
}

export interface ShadowCostSummary {
	average: number;
	fallbackPricedInvestigations: number;
	investigations: number;
	max: number;
	min: number;
	total: number;
}

export interface ShadowOutcomeSummary {
	next: Record<string, number>;
	rootCause: { known: number; unknown: number };
	surfaced: number;
	toolCalls: { average: number; max: number; total: number };
}

interface ShadowReport {
	aggregate: {
		agentCostUsd: ShadowCostSummary;
		cases: number;
		detectionIncomplete: number;
		durationsMs: { p50: number; p95: number };
		metricFamilies: Record<string, number>;
		outcomeWords: { max: number; p50: number; p95: number };
		outcomes: ShadowOutcomeSummary;
		severity: Record<string, number>;
		status: Record<string, number>;
	};
	cases: ShadowCase[];
	meta: {
		concurrency: number;
		dataAccess: {
			clickhouse: "read_only";
			connectors: "enabled";
			postgres: "read_only";
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
	};
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

function modelOption(value: string | undefined): string {
	const model = value?.trim();
	if (model) {
		return model;
	}
	throw new Error("model must be a non-empty gateway model id");
}

export function resolveReferenceTime(
	value: string | undefined,
	now: () => Date = () => new Date()
): Date {
	const result = value ? new Date(value) : now();
	if (Number.isNaN(result.getTime())) {
		throw new Error("reference-time must be a valid ISO timestamp");
	}
	return result;
}

function parseOptions(args: string[]): CliOptions {
	const { values } = parseArgs({
		args,
		options: {
			concurrency: { default: String(DEFAULT_CONCURRENCY), type: "string" },
			"confirm-read-only-production": { default: false, type: "boolean" },
			limit: { type: "string" },
			"min-events": { default: String(DEFAULT_MIN_EVENTS), type: "string" },
			model: { default: "balanced", type: "string" },
			offsets: { type: "string" },
			output: { type: "string" },
			"reference-time": { type: "string" },
		},
		strict: true,
	});
	if (!values["confirm-read-only-production"]) {
		throw new Error(
			`Production shadow evaluation requires ${REQUIRED_CONFIRMATION}`
		);
	}
	const offsets = values.offsets
		? values.offsets
				.split(",")
				.map((value) => integerOption(value, "offset", 0))
		: DEFAULT_OFFSETS;
	if (new Set(offsets).size !== offsets.length) {
		throw new Error("Offsets must be unique");
	}
	return {
		concurrency: integerOption(values.concurrency, "concurrency", 1),
		limit: values.limit ? integerOption(values.limit, "limit", 1) : null,
		minEvents: integerOption(values["min-events"], "min-events", 1),
		model: modelOption(values.model),
		offsets,
		output: values.output ?? null,
		referenceTime: resolveReferenceTime(values["reference-time"]),
	};
}

function disableExternalEffects(): void {
	process.env.NODE_ENV = "test";
	process.env.SERVICE_NAME = "insights-production-shadow-readonly";
	process.env.DB_POOL_MAX = "1";
	for (const key of [
		"AXIOM_API_KEY",
		"AXIOM_TOKEN",
		"FIRECRAWL_API_KEY",
		"SUPERLOG_API_KEY",
	]) {
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
	funnels: FunnelRow[];
	goals: GoalRow[];
	model: string;
	observations: ReadonlyMap<string, LatestInsightObservation>;
	onAgentResult: (result: InsightAgentResult) => void;
	site: RankedWebsite;
	attemptSignal: AbortSignal;
	trace: InsightAgentStepTrace[];
}): Promise<InvestigationSources> {
	const [
		{ createModelFromId },
		{ detectSignals },
		{ defaultFunnelGoalDeps, detectFunnelGoalSignals },
		{ signalAnnotationWindow },
		{ runInsightAgent },
	] = await Promise.all([
		import("@databuddy/ai/config/models"),
		import("../../../apps/insights/src/detection"),
		import("../../../apps/insights/src/funnel-detection"),
		import("../../../apps/insights/src/investigation"),
		import("../../../apps/insights/src/agent"),
	]);
	const siteFunnels = definitionsAt(
		params.funnels.filter((row) => row.websiteId === params.site.id),
		params.asOf
	);
	const siteGoals = definitionsAt(
		params.goals.filter((row) => row.websiteId === params.site.id),
		params.asOf
	);
	const withAttemptSignal = (signal?: AbortSignal) =>
		signal
			? AbortSignal.any([params.attemptSignal, signal])
			: params.attemptSignal;
	return {
		detectDefinitionSignals: (detectParams, today, _deps, options) => {
			const base = defaultFunnelGoalDeps(params.site.id, params.asOf);
			return detectFunnelGoalSignals(
				detectParams,
				today,
				{
					...base,
					fetchFunnels: async () => siteFunnels,
					fetchGoals: async () => siteGoals,
					funnelConversion: (funnel, range, signal) =>
						base.funnelConversion(funnel, range, withAttemptSignal(signal)),
					goalConversion: (goal, range, signal) =>
						base.goalConversion(goal, range, withAttemptSignal(signal)),
				},
				options
			);
		},
		detectMetricSignals: (detectParams, queryFn, today, signal, diagnostics) =>
			detectSignals(
				detectParams,
				queryFn,
				today,
				withAttemptSignal(signal),
				diagnostics
			),
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
				onStepFinish: (step) => {
					params.trace.push(step);
				},
			});
			params.onAgentResult(result);
			return result;
		},
		loadHistory: ({ signalKey }) => {
			const observation = params.observations.get(signalKey);
			return Promise.resolve(
				observation
					? [
							{
								asOf: observation.asOf.toISOString(),
								evidence: observation.evidence,
								kind: "investigation" as const,
								outcome: observation.outcome,
								signal: observation.signal,
							},
						]
					: []
			);
		},
		loadObservations: () => Promise.resolve(new Map(params.observations)),
	};
}

export async function runCancellableAttempt<T>(
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

function countBy(values: Array<string | null>): Record<string, number> {
	const result: Record<string, number> = {};
	for (const value of values) {
		const key = value ?? "none";
		result[key] = (result[key] ?? 0) + 1;
	}
	return result;
}

function traceToolCount(trace: InsightAgentStepTrace[], name?: string): number {
	return trace.reduce(
		(count, step) =>
			count +
			step.tools.filter((toolCall) => !name || toolCall.name === name).length,
		0
	);
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

function outcomeWordCount(
	outcome: WebsiteInvestigationArtifact["outcome"]
): number | null {
	if (!outcome) {
		return null;
	}
	const nextCopy = Object.entries(outcome.next).flatMap(([key, value]) =>
		key === "type" || key === "kind" || typeof value !== "string" ? [] : [value]
	);
	return [
		outcome.title,
		outcome.summary,
		outcome.impact,
		outcome.rootCause,
		...outcome.evidence,
		...nextCopy,
	]
		.filter((value): value is string => value !== null)
		.join(" ")
		.trim()
		.split(WORD_SEPARATOR).length;
}

export function sanitizeText(value: string, secrets: string[]): string {
	let output = value;
	for (const secret of [...new Set(secrets)]
		.filter((item) => item.length >= 2)
		.sort((a, b) => b.length - a.length)) {
		output = output.replace(
			new RegExp(RegExp.escape(secret), "gi"),
			"[entity]"
		);
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
		.replace(/(["'“])[^"'”]{2,}(["'”])/g, "$1[entity]$2")
		.replace(/\/(?:[^\s.,;:!?()[\]{}]+\/)*[^\s.,;:!?()[\]{}]*/g, "[path]");
}

function sanitizeOutcome(
	outcome: WebsiteInvestigationArtifact["outcome"],
	secrets: string[]
): WebsiteInvestigationArtifact["outcome"] {
	return outcome
		? JSON.parse(
				JSON.stringify(outcome, (_key, value) =>
					typeof value === "string" ? sanitizeText(value, secrets) : value
				)
			)
		: null;
}

function metricFamily(key: string): string {
	if (key.startsWith("goal:")) {
		return "goal";
	}
	if (key.startsWith("funnel:")) {
		return "funnel";
	}
	if (key.startsWith("custom_event:")) {
		return "custom_event";
	}
	return key;
}

function summarizeShadowUsage(
	modelId: string,
	usage: Parameters<typeof summarizeAgentUsage>[1]
): UsageTelemetry {
	const summary = summarizeAgentUsage(modelId, usage);
	if (!(summary.cost_fallback && hasModelPricing(modelId))) {
		return summary;
	}
	const cost = computeCaseCost(
		modelId,
		summary.input_tokens,
		summary.output_tokens,
		summary.cache_read_tokens,
		summary.cache_write_tokens
	);
	return {
		...summary,
		agent_credits_used: usdToAgentCredits(cost),
		cost_fallback: false,
		cost_model_id: modelId,
		cost_total_usd: cost,
	};
}

function projectAgentUsage(
	result: InsightAgentResult
): ShadowAgentUsage | null {
	if (!(result.modelId && result.usage)) {
		return null;
	}
	const usage = summarizeShadowUsage(result.modelId, result.usage);
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

export function projectTraceUsage(
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
		return summarizeShadowUsage(step.modelId, {
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

function projectCase(params: {
	agent: ShadowAgentUsage | null;
	artifact: WebsiteInvestigationArtifact;
	caseId: string;
	durationMs: number;
	githubAvailable: boolean;
	offsetDays: number;
	secrets: string[];
	trace: InsightAgentStepTrace[];
}): ShadowCase {
	const { artifact } = params;
	return {
		agent: params.agent,
		asOf: artifact.asOf,
		caseId: params.caseId,
		contextFacts: artifact.evidence.length,
		detectionComplete: artifact.detectionComplete,
		detectedSignalCount: artifact.detectedSignals.length,
		durationMs: params.durationMs,
		errorType: null,
		errorSummary: null,
		githubAvailable: params.githubAvailable,
		offsetDays: params.offsetDays,
		outcome: sanitizeOutcome(artifact.outcome, params.secrets),
		outcomeWords: outcomeWordCount(artifact.outcome),
		selectedSignal: artifact.signal
			? {
					changePercent: artifact.signal.changePercent,
					current: artifact.signal.metric.current,
					entityType: artifact.signal.entity.type,
					method: artifact.signal.detection.method,
					metric: metricFamily(artifact.signal.metric.key),
					period: artifact.signal.period,
					previous: artifact.signal.metric.previous ?? null,
					sentiment: artifact.signal.sentiment,
					severity: artifact.signal.severity,
				}
			: null,
		status: artifact.status,
		trace: params.trace.map(({ tools }) => ({ tools })),
		toolCallCount: artifact.toolCallCount,
	};
}

function failedCase(params: {
	agent: ShadowAgentUsage | null;
	asOf: Date;
	caseId: string;
	durationMs: number;
	error: unknown;
	githubAvailable: boolean;
	offsetDays: number;
	secrets: string[];
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
		contextFacts: 0,
		detectionComplete: params.trace.length > 0,
		detectedSignalCount: 0,
		durationMs: params.durationMs,
		errorSummary: sanitizeText(message, params.secrets).slice(0, 500),
		errorType:
			params.error instanceof Error
				? params.error.constructor.name
				: typeof params.error,
		githubAvailable: params.githubAvailable,
		offsetDays: params.offsetDays,
		outcome: null,
		outcomeWords: null,
		selectedSignal: null,
		status: "error",
		trace: params.trace.map(({ tools }) => ({ tools })),
		toolCallCount: traceToolCount(params.trace),
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
	const outcomeWords = cases.flatMap((item) =>
		item.outcomeWords === null ? [] : [item.outcomeWords]
	);
	return {
		agentCostUsd: summarizeInvestigationCosts(cases.map((item) => item.agent)),
		cases: cases.length,
		detectionIncomplete: cases.filter((item) => !item.detectionComplete).length,
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
		metricFamilies: countBy(
			cases.map((item) => item.selectedSignal?.metric ?? null)
		),
		outcomeWords: {
			max: Math.max(0, ...outcomeWords),
			p50: percentile(outcomeWords, 0.5),
			p95: percentile(outcomeWords, 0.95),
		},
		outcomes: summarizeShadowOutcomes(cases),
		severity: countBy(
			cases.map((item) => item.selectedSignal?.severity ?? null)
		),
		status: countBy(cases.map((item) => item.status)),
	};
}

export function summarizeShadowOutcomes(
	cases: Array<{
		outcome: null | {
			impact: string | null;
			next: { type: "act" | "ask" | "resolve" | "watch" };
			rootCause: string | null;
		};
		toolCallCount: number;
	}>
): ShadowOutcomeSummary {
	const completedCases = cases.filter(
		(
			item
		): item is typeof item & { outcome: NonNullable<typeof item.outcome> } =>
			item.outcome !== null
	);
	const completed = completedCases.map((item) => item.outcome);
	const toolCalls = completedCases.map((item) => item.toolCallCount);
	return {
		next: countBy(completed.map((outcome) => outcome.next.type)),
		rootCause: {
			known: completed.filter((outcome) => outcome.rootCause !== null).length,
			unknown: completed.filter((outcome) => outcome.rootCause === null).length,
		},
		surfaced: completed.filter(
			(outcome) =>
				(outcome.next.type === "act" || outcome.next.type === "ask") &&
				outcome.impact !== null
		).length,
		toolCalls: {
			average:
				toolCalls.length === 0
					? 0
					: toolCalls.reduce((sum, value) => sum + value, 0) / toolCalls.length,
			max: Math.max(0, ...toolCalls),
			total: toolCalls.reduce((sum, value) => sum + value, 0),
		},
	};
}

export function summarizeInvestigationCosts(
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
		import("../../../packages/redis/redis"),
	]);
	await Promise.allSettled([clickHouse.close(), shutdownRedis()]);
}

export async function runProductionShadow(
	options: CliOptions
): Promise<ShadowReport> {
	disableExternalEffects();
	configureReadOnlyClickHouse();
	const referenceTime = options.referenceTime;
	const restoreConsole = silenceLibraryConsole();
	try {
		const ranked = await loadCohort(
			options.minEvents,
			options.limit,
			referenceTime
		);
		const metadata = await loadMetadata(ranked);
		const [
			{ investigateWebsiteWithSources, resolveInvestigationAsOf },
			{ nextRecheckAt },
		] = await Promise.all([
			import("../../../apps/insights/src/generation"),
			import("../../../apps/insights/src/observations"),
		]);
		const siteCases = await mapConcurrent(
			metadata.sites,
			options.concurrency,
			async (site, siteIndex) => {
				const observations = new Map<string, LatestInsightObservation>();
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
					]),
					...metadata.annotations
						.filter((row) => row.websiteId === site.id)
						.map((row) => row.text),
				];
				for (const offsetDays of [...options.offsets].sort((a, b) => b - a)) {
					const caseId = `site-${String(siteIndex + 1).padStart(2, "0")}@d-${offsetDays}`;
					const asOf = resolveInvestigationAsOf(
						dateAtOffset(referenceTime, offsetDays, site.timezone),
						site.timezone
					);
					const startedAt = Date.now();
					const trace: InsightAgentStepTrace[] = [];
					let agent: ShadowAgentUsage | null = null;
					const githubAvailable =
						offsetDays === 0 && site.githubRepository !== null;
					try {
						const input = {
							asOf,
							domain: site.domain,
							githubRepository: githubAvailable ? site.githubRepository : null,
							organizationId: site.organizationId,
							timezone: site.timezone,
							websiteId: site.id,
						};
						const artifact = await runCancellableAttempt(
							async (attemptSignal) => {
								const sources = await createSources({
									annotations: metadata.annotations,
									asOf,
									attemptSignal,
									funnels: metadata.funnels,
									goals: metadata.goals,
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
						if (artifact.outcome && artifact.signal) {
							observations.set(artifact.signal.signalKey, {
								asOf,
								evidence: artifact.evidence,
								outcome: artifact.outcome,
								recheckAt: nextRecheckAt(asOf, artifact.outcome.next.type),
								signal: artifact.signal,
							});
						}
						const secrets = [
							...siteSecrets,
							artifact.signal?.entity.id ?? "",
							artifact.signal?.entity.label ?? "",
						];
						cases.push(
							projectCase({
								agent,
								artifact,
								caseId,
								durationMs: Date.now() - startedAt,
								githubAvailable,
								offsetDays,
								secrets,
								trace,
							})
						);
					} catch (error) {
						agent ??= projectTraceUsage(trace);
						cases.push(
							failedCase({
								agent,
								asOf,
								caseId,
								durationMs: Date.now() - startedAt,
								error,
								githubAvailable,
								offsetDays,
								secrets: siteSecrets,
								trace,
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
				concurrency: options.concurrency,
				dataAccess: {
					clickhouse: "read_only",
					connectors: "enabled",
					postgres: "read_only",
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
		const result = await runProductionShadow(options);
		if (options.output) {
			const output = assertOutsideRepository(options.output);
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
		process.stderr.write(`Production shadow evaluation failed (${type}).\n`);
		process.exitCode = 1;
	}
}
