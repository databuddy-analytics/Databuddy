import { createHmac } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Pool, type PoolClient } from "pg";
import type { LanguageModelUsage, StepResult, ToolSet } from "ai";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";
import {
	summarizeAgentUsage,
	type UsageTelemetry,
} from "@databuddy/ai/lib/usage-telemetry";
import {
	coveragePortfolioLimit,
	type CoveragePortfolioEntry,
	type SignalFamily,
} from "./coverage-planner";
import type { CandidateQualification } from "./candidate-qualification";
import type { DetectedSignal } from "./detection";
import type { ErrorCandidateOverlap } from "./error-candidate-overlap";
import type { DatabuddySetupConfiguration } from "./databuddy-setup-context";
import type {
	ErrorCohortClustering,
	InvestigationSources,
	WebsiteInvestigationArtifact,
	WebsitePortfolioInspection,
} from "./generation";
import type { InsightAgentInput, InsightAgentResult } from "./agent";
import type { FunnelDef, GoalDef } from "./funnel-detection";
import {
	isRegression,
	prepareInvestigation,
	signalKeyForDetectedSignal,
	type InvestigationAnnotation,
} from "./investigation";
import type { LatestInsightObservation } from "./observations";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

const REQUIRED_CONFIRMATION = "--confirm-read-only-production";
const DEFAULT_OFFSETS = [60, 30, 7, 0];
const DEFAULT_MIN_EVENTS = 25_000;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MODEL = "openai/gpt-5.6-terra";
const MAX_BATCH_SIZE = coveragePortfolioLimit("manual");
const STATEMENT_TIMEOUT_MS = 60_000;
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
	selectionAudit: boolean;
	websiteId: string | null;
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

interface SetupFlagRow {
	count: number;
	organizationId: string | null;
	status: "active" | "inactive";
	type: "boolean" | "multivariant" | "rollout";
	websiteId: string | null;
}

interface SetupTargetGroupRow {
	count: number;
	websiteId: string;
}

interface SetupRevenueRow {
	paddleConfigured: boolean;
	stripeConfigured: boolean;
	websiteId: string;
}

interface SetupMetadata {
	flags: SetupFlagRow[];
	revenue: SetupRevenueRow[];
	targetGroups: SetupTargetGroupRow[];
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
	brief: null | {
		claimSources: {
			impact: "provided" | "tool" | null;
			problem: "provided" | "tool";
			rootCause: "provided" | "tool" | null;
		};
		scope: NonNullable<InsightAgentResult["brief"]>["scope"];
		userExperience: NonNullable<InsightAgentResult["brief"]>["userExperience"];
	};
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
	timeout: ShadowTimeout | null;
	toolCallCount: number;
	trace: Pick<InsightAgentStepTrace, "tools">[];
}

interface ShadowTimeout {
	budgetMs: number;
	elapsedMs: number;
	overdueMs: number;
	phase: "generation" | "setup";
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

interface ShadowAgentAttempt {
	agent: ShadowAgentUsage | null;
	durationMs: number;
	error?: unknown;
	input: InsightAgentInput;
	result?: InsightAgentResult;
	trace: InsightAgentStepTrace[];
}

interface ShadowCostSummary {
	average: number;
	fallbackPricedInvestigations: number;
	investigations: number;
	max: number;
	min: number;
	total: number;
}

export interface ShadowSelectionCandidate {
	alias: string;
	baseline: number;
	changePercent: number;
	current: number;
	eligible: boolean;
	family: SignalFamily;
	marginalSelectedAt: number | null;
	metric: string;
	omittedFor: CoveragePortfolioEntry["omittedFor"];
	qualification: CandidateQualification["status"];
	qualificationReason: CandidateQualification["reason"];
	rank: number;
	reach: DetectedSignal["reach"] | null;
	reachSelectedAt: number | null;
	regression: boolean;
	selectedAt: number | null;
	severity: DetectedSignal["severity"];
}

export interface ShadowErrorCandidateOverlap {
	cooccurring: {
		errorOccurrences: number;
		sessions: number;
		visitorIdentifiers: number;
	};
	fingerprint: {
		alias: string;
		errorOccurrences: number;
		sessions: number;
		visitorIdentifiers: number;
	};
	/** Null means one or both candidate cohorts had no visitor identifiers. */
	marginalRouteVisitorIdentifiers: number | null;
	route: {
		alias: string;
		errorOccurrences: number;
		sessions: number;
		visitorIdentifiers: number;
	};
	sessionOverlapMeasurable: boolean;
	shared: {
		sessions: number;
		visitorIdentifiers: number;
	};
	visitorOverlapMeasurable: boolean;
}

export interface ShadowSelectionAudit {
	asOf: string;
	candidates: ShadowSelectionCandidate[];
	candidateUniverseFingerprint: string;
	detectedCount: number;
	detectedUniverseFingerprint: string;
	dueCandidate: boolean;
	eligibleCount: number;
	errorOverlaps: ShadowErrorCandidateOverlap[];
	errorOverlapUnavailableCount: number;
	history: "fresh_in_memory";
	marginalRankingStatus: "baseline" | "measured" | "unavailable";
	marginalSelectedCount: number;
	overlapClustering: ShadowOverlapClustering | null;
	portfolioLimit: number;
	qualifiedCount: number;
	qualifiedSelectedCount: number;
	reachSelectedCount: number;
	screenedCount: number;
	screenedSelectedCount: number;
	selectedCount: number;
	status: WebsitePortfolioInspection["status"];
}

export interface ShadowOverlapClustering {
	candidatePairCount: number;
	measuredPairCount: number;
	passes: number;
	retainedIndependentRouteCount: number;
	selectedCandidatesSettled: boolean;
	suppressedRouteCount: number;
	unavailablePairCount: number;
}

interface ShadowReport {
	aggregate: {
		agentCostUsd: ShadowCostSummary;
		briefClaims: {
			completed: number;
			scopes: Record<string, number>;
			sourcedImpact: number;
			sourcedRootCause: number;
			userExperience: Record<string, number>;
		};
		cases: number;
		durationsMs: { p50: number; p95: number };
		status: Record<string, number>;
		timeouts: {
			count: number;
			maxOverdueMs: number;
			phases: Record<string, number>;
		};
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
		engine: "candidate inventory" | "investigation agent";
		generatedAt: string;
		history: "in_memory";
		minEvents: number;
		model: string | null;
		offsets: number[];
		referenceTime: string;
		sites: number;
	};
	selectionAudit?: ShadowSelectionAudit[];
}

interface ShadowObservation extends LatestInsightObservation {
	asOf: Date;
	evidence: string[];
	hasOpenInvestigation: boolean;
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

export function parseOptions(args: string[]): CliOptions {
	const { values } = parseArgs({
		args,
		options: {
			"as-of-mode": { default: "day", type: "string" },
			"batch-size": { default: String(MAX_BATCH_SIZE), type: "string" },
			concurrency: { default: String(DEFAULT_CONCURRENCY), type: "string" },
			"confirm-read-only-production": { default: false, type: "boolean" },
			limit: { type: "string" },
			"min-events": { default: String(DEFAULT_MIN_EVENTS), type: "string" },
			model: { default: DEFAULT_MODEL, type: "string" },
			offsets: { type: "string" },
			output: { type: "string" },
			"reference-time": { type: "string" },
			"selection-audit": { default: false, type: "boolean" },
			"website-id": { type: "string" },
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
	if (values["selection-audit"] && offsets.length !== 1) {
		throw new Error("selection-audit requires exactly one frozen snapshot");
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
		selectionAudit: values["selection-audit"],
		websiteId: values["website-id"]?.trim() || null,
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

async function assertReadOnlyClickHouse(): Promise<void> {
	const { chQuery } = await import("@databuddy/db/clickhouse");
	const rows = await chQuery<{ readonly: number | string }>(
		"SELECT getSetting({setting:String}) AS readonly",
		{ setting: "readonly" }
	);
	if (Number(rows[0]?.readonly) < 1) {
		throw new Error("ClickHouse connection is not read-only");
	}
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

function setupCount(value: number, field: string): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`Invalid ${field} in shadow setup metadata`);
	}
	return value;
}

function setupConfigurationForSite(params: {
	activeFunnels: number;
	activeGoals: number;
	organizationId: string;
	setup: SetupMetadata;
	websiteId: string;
}): DatabuddySetupConfiguration {
	const activeFlags = { boolean: 0, multivariant: 0, rollout: 0 };
	let inactiveFlags = 0;
	for (const row of params.setup.flags) {
		if (
			row.websiteId !== params.websiteId &&
			row.organizationId !== params.organizationId
		) {
			continue;
		}
		const value = setupCount(row.count, "flag count");
		if (row.status === "active") {
			activeFlags[row.type] += value;
		} else {
			inactiveFlags += value;
		}
	}
	const targetGroup = params.setup.targetGroups.find(
		(row) => row.websiteId === params.websiteId
	);
	const revenue = params.setup.revenue.find(
		(row) => row.websiteId === params.websiteId
	);
	return {
		activeFlags,
		activeFunnels: setupCount(params.activeFunnels, "active funnel count"),
		activeGoals: setupCount(params.activeGoals, "active goal count"),
		inactiveFlags,
		paddleConfigured: revenue?.paddleConfigured ?? false,
		stripeConfigured: revenue?.stripeConfigured ?? false,
		targetGroups: targetGroup
			? setupCount(targetGroup.count, "target group count")
			: 0,
		websiteRevenueConfigPresent: revenue !== undefined,
	};
}

function loadMetadata(ids: string[]): Promise<{
	annotations: AnnotationRow[];
	funnels: FunnelRow[];
	goals: GoalRow[];
	setup: SetupMetadata;
	sites: RankedWebsite[];
}> {
	if (ids.length === 0) {
		return Promise.resolve({
			annotations: [],
			funnels: [],
			goals: [],
			setup: { flags: [], revenue: [], targetGroups: [] },
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
		const flagResult = await client.query<SetupFlagRow>(
			`SELECT website_id AS "websiteId",
						organization_id AS "organizationId",
						status,
						type,
						count(*)::integer AS count
					 FROM flags
					 WHERE (
						website_id = ANY($1::text[])
						OR organization_id IN (
							SELECT organization_id
							FROM websites
							WHERE id = ANY($1::text[])
						)
					 )
					 AND user_id IS NULL
					 AND deleted_at IS NULL
					 AND status IN ('active', 'inactive')
					 GROUP BY website_id, organization_id, status, type`,
			[ids]
		);
		const targetGroupResult = await client.query<SetupTargetGroupRow>(
			`SELECT website_id AS "websiteId",
						count(*)::integer AS count
				 FROM target_groups
				 WHERE website_id = ANY($1::text[])
					 AND deleted_at IS NULL
				 GROUP BY website_id`,
			[ids]
		);
		const revenueResult = await client.query<SetupRevenueRow>(
			`SELECT rc.website_id AS "websiteId",
						(rc.paddle_webhook_secret IS NOT NULL) AS "paddleConfigured",
						(rc.stripe_webhook_secret IS NOT NULL) AS "stripeConfigured"
				 FROM revenue_config rc
				 INNER JOIN websites w
					 ON w.id = rc.website_id
					 AND w.organization_id = rc.owner_id
				 WHERE rc.website_id = ANY($1::text[])`,
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
			setup: {
				flags: flagResult.rows,
				revenue: revenueResult.rows,
				targetGroups: targetGroupResult.rows,
			},
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
	return dayjs
		.tz(dateAtOffset(referenceTime, offsetDays, timezone), timezone)
		.toDate();
}

function shadowNextRecheckAt(
	asOf: Date,
	next: InsightAgentResult["outcome"]["next"]
): Date {
	const requested =
		(next.type === "act" || next.type === "watch") && next.recheckAt
			? new Date(next.recheckAt)
			: null;
	if (requested && !Number.isNaN(requested.getTime()) && requested > asOf) {
		return requested;
	}
	const days = next.type === "act" || next.type === "watch" ? 1 : 30;
	return new Date(asOf.getTime() + days * 86_400_000);
}

function keepsShadowInvestigationOpen(
	outcome: InsightAgentResult["outcome"],
	previous: ShadowObservation | undefined
): boolean {
	if (outcome.next.type === "act" || outcome.next.type === "ask") {
		return true;
	}
	if (outcome.publish === true && outcome.recommendation != null) {
		return true;
	}
	return (
		outcome.next.type === "watch" && previous?.hasOpenInvestigation === true
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
	attempts: ShadowAgentAttempt[];
	funnels: FunnelRow[];
	goals: GoalRow[];
	historical: boolean;
	model: string;
	observations: ShadowObservation[];
	setup: SetupMetadata;
	site: RankedWebsite;
}): Promise<InvestigationSources> {
	const [
		{ createModelFromId },
		{ detectSignals },
		{ defaultFunnelGoalDeps, detectFunnelGoalSignals },
		{
			defaultMeasurementRecommendationDeps,
			detectMeasurementRecommendationSignals,
		},
		{ signalAnnotationWindow },
		{ loadErrorCohortBehavior },
		{ loadErrorCustomerImpact },
		{ configuredGoalTargetFromDefinitions, loadErrorCohortGoalCompletion },
		{ loadVitalCohortBehavior },
		{ loadDatabuddySetupContext },
		{ loadErrorCandidateOverlap },
		{ createToolkit },
		{ remeasureStoredSignal },
		{ detectRouteHealthSignals },
		{ InsightAgentExecutionError, runInsightAgent },
	] = await Promise.all([
		import("@databuddy/ai/config/models"),
		import("./detection"),
		import("./funnel-detection"),
		import("./measurement-recommendation-detection"),
		import("./investigation"),
		import("./error-cohort-behavior"),
		import("./error-customer-impact"),
		import("./error-cohort-goal-completion"),
		import("./vital-cohort-behavior"),
		import("./databuddy-setup-context"),
		import("./error-candidate-overlap"),
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
	const setupConfiguration = params.historical
		? null
		: setupConfigurationForSite({
				activeFunnels: params.funnels.filter(
					(row) => row.websiteId === params.site.id
				).length,
				activeGoals: params.goals.filter(
					(row) => row.websiteId === params.site.id
				).length,
				organizationId: params.site.organizationId,
				setup: params.setup,
				websiteId: params.site.id,
			});
	const latestObservations = new Map<string, ShadowObservation>();
	for (const observation of params.observations) {
		latestObservations.set(observation.signal.signalKey, observation);
	}
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
			) => base.funnelConversion(funnel, range, signal),
			goalConversion: (
				goal: GoalDef,
				range: Parameters<typeof base.goalConversion>[1],
				signal?: AbortSignal
			) => base.goalConversion(goal, range, signal),
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
			) => base.fetchTelemetry(range, signal),
		};
	};
	return {
		detectDefinitionSignals: async (detectParams, today, _deps, options) =>
			detectFunnelGoalSignals(
				detectParams,
				today,
				funnelGoalDependencies(),
				options
			),
		detectMeasurementRecommendationSignals: async (
			detectParams,
			today,
			_deps,
			signal
		) =>
			params.historical
				? []
				: detectMeasurementRecommendationSignals(
						detectParams,
						today,
						measurementRecommendationDependencies(),
						signal
					),
		detectMetricSignals: async (
			detectParams,
			queryFn,
			today,
			signal,
			diagnostics
		) => detectSignals(detectParams, queryFn, today, signal, diagnostics),
		detectRouteHealthSignals: async (detectParams, today, _deps, signal) =>
			detectRouteHealthSignals(detectParams, today, undefined, signal),
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
							date: dayjs(row.xValue).tz(timezone).format("YYYY-MM-DD"),
							title: row.text,
						})
					)
			);
		},
		investigateSignal: async (input) => {
			const startedAt = performance.now();
			const attempt: ShadowAgentAttempt = {
				agent: null,
				durationMs: 0,
				input,
				trace: [],
			};
			params.attempts.push(attempt);
			try {
				const result = await runInsightAgent(input, {
					model: createModelFromId(params.model),
					...(historicalTools ? { tools: historicalTools } : {}),
					onStepFinish: (step) => {
						attempt.trace.push(projectStep(step));
					},
				});
				attempt.agent = projectAgentUsage(result);
				attempt.result = result;
				const previous = latestObservations.get(input.signal.signalKey);
				const hasOpenInvestigation = keepsShadowInvestigationOpen(
					result.outcome,
					previous
				);
				const observation: ShadowObservation = {
					asOf: params.asOf,
					evidence: input.evidence,
					hasOpenInvestigation,
					outcome: result.outcome,
					recheckAt: shadowNextRecheckAt(params.asOf, result.outcome.next),
					signal: input.signal,
				};
				params.observations.push(observation);
				latestObservations.set(input.signal.signalKey, observation);
				return result;
			} catch (error) {
				attempt.agent =
					error instanceof InsightAgentExecutionError
						? projectUsage(error.modelId, error.usage)
						: projectTraceUsage(attempt.trace);
				attempt.error = error;
				throw error;
			} finally {
				attempt.durationMs = Math.max(
					0,
					Math.round(performance.now() - startedAt)
				);
			}
		},
		loadDueInvestigation: () => {
			const due = [...latestObservations.values()]
				.filter(
					(observation) =>
						observation.hasOpenInvestigation &&
						observation.outcome.next.type !== "resolve" &&
						observation.recheckAt <= params.asOf
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
		loadErrorCandidateOverlap,
		loadErrorCohortBehavior,
		loadErrorCustomerImpact,
		loadVitalCohortBehavior,
		loadErrorCohortGoalCompletion: (input) =>
			loadErrorCohortGoalCompletion(input, {
				fetchConfiguredGoal: async ({ signal, timezone }) =>
					configuredGoalTargetFromDefinitions(
						siteGoals.filter(
							(goal) => goal.isActive !== false && !goal.deletedAt
						),
						{ signal, timezone }
					),
			}),
		loadDatabuddySetup:
			params.historical || !setupConfiguration
				? async () => null
				: (input) =>
						loadDatabuddySetupContext(input, {
							fetchConfiguration: async () => setupConfiguration,
						}),
		loadHistory: ({ signalKey, through }) =>
			Promise.resolve(
				params.observations
					.filter(
						(observation) =>
							observation.signal.signalKey === signalKey &&
							(!through || observation.asOf <= through)
					)
					.sort((a, b) => a.asOf.getTime() - b.asOf.getTime())
					.slice(-12)
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
			remeasureStoredSignal(detectParams, prior, today, signal, {
				funnelGoal: funnelGoalDependencies(),
			}),
	};
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

const SAFE_SELECTION_METRIC_FAMILIES = new Set([
	"bounce_rate",
	"custom_event",
	"error",
	"funnel",
	"goal",
	"inp",
	"lcp",
	"measurement",
	"pageviews",
	"revenue",
	"route_health",
	"session_duration",
	"sessions",
	"visitors",
]);

function selectionMetricFamily(signal: DetectedSignal): string {
	if (signal.metric === "error_count") {
		return "error";
	}
	if (signal.metric === "custom_event_count") {
		return "custom_event";
	}
	if (signal.metric.startsWith("funnel:")) {
		return "funnel";
	}
	if (signal.metric.startsWith("goal:")) {
		return "goal";
	}
	const family = metricFamily(signal.subjectKey ?? signal.metric);
	return SAFE_SELECTION_METRIC_FAMILIES.has(family) ? family : "other";
}

function selectionDigest(siteId: string, value: string): string {
	return createHmac("sha256", `candidate-inventory:${siteId}`)
		.update(value)
		.digest("hex");
}

function selectionCandidateAlias(
	siteId: string,
	signal: DetectedSignal
): string {
	return `candidate-${selectionDigest(
		siteId,
		signalKeyForDetectedSignal(signal)
	).slice(0, 12)}`;
}

function candidateUniverseFingerprint(
	siteId: string,
	entries: CoveragePortfolioEntry[]
): string {
	const canonical = entries
		.map((entry) => ({
			baseline: entry.signal.baseline,
			changePercent: entry.signal.deltaPercent,
			current: entry.signal.current,
			key: signalKeyForDetectedSignal(entry.signal),
			omittedFor: entry.omittedFor,
			rank: entry.rank,
			reach: entry.signal.reach ?? null,
			selectedAt: entry.selectedAt,
			severity: entry.signal.severity,
		}))
		.sort((left, right) => left.rank - right.rank);
	return selectionDigest(siteId, JSON.stringify(canonical)).slice(0, 16);
}

/**
 * This digest excludes selection results so frozen before/after audits can
 * prove the detector universe stayed fixed while portfolio policy changed.
 */
function detectedUniverseFingerprint(
	siteId: string,
	signals: DetectedSignal[]
): string {
	const canonical = signals
		.map((signal) => ({
			baseline: signal.baseline,
			baselineDates: signal.baselineDates ?? null,
			changePercent: signal.deltaPercent,
			current: signal.current,
			detectedAt: signal.detectedAt,
			direction: signal.direction,
			key: signalKeyForDetectedSignal(signal),
			measurementCandidate: signal.measurementCandidate ?? null,
			measurementGapRecommendationCandidate:
				signal.measurementGapRecommendationCandidate ?? null,
			metric: signal.metric,
			reach: signal.reach ?? null,
			severity: signal.severity,
		}))
		.sort((left, right) => left.key.localeCompare(right.key));
	return selectionDigest(siteId, JSON.stringify(canonical)).slice(0, 16);
}

function projectOverlapClustering(
	clustering: ErrorCohortClustering
): ShadowOverlapClustering {
	return {
		candidatePairCount: clustering.candidatePairCount,
		measuredPairCount: clustering.measuredPairCount,
		passes: clustering.passes,
		retainedIndependentRouteCount: clustering.independentRouteSignalKeys.length,
		selectedCandidatesSettled: clustering.selectedCandidatesSettled,
		suppressedRouteCount: clustering.redundantRouteSignalKeys.length,
		unavailablePairCount: clustering.unavailablePairCount,
	};
}

function isFingerprintErrorCandidate(signal: DetectedSignal): boolean {
	return (
		signal.metric === "error_count" &&
		signal.subjectKey?.startsWith("error:") === true
	);
}

function isRouteErrorCandidate(signal: DetectedSignal): boolean {
	return (
		signal.metric === "error_count" &&
		signal.subjectKey?.startsWith("route:error:") === true
	);
}

function selectedErrorCandidatePairs(
	inspection: WebsitePortfolioInspection
): Array<{ fingerprint: DetectedSignal; route: DetectedSignal }> {
	if (inspection.status !== "signals") {
		return [];
	}
	const selectedByEitherStrategy = new Map<string, DetectedSignal>();
	for (const plan of [inspection.plan, inspection.reachPlan]) {
		for (const entry of plan.entries) {
			if (
				entry.selectedAt !== null ||
				entry.omittedFor.includes("overlap_covered")
			) {
				selectedByEitherStrategy.set(
					signalKeyForDetectedSignal(entry.signal),
					entry.signal
				);
			}
		}
	}
	const selected = [...selectedByEitherStrategy.values()];
	const fingerprints = selected.filter(isFingerprintErrorCandidate);
	const routes = selected.filter(isRouteErrorCandidate);
	return fingerprints.flatMap((fingerprint) =>
		routes.map((route) => ({ fingerprint, route }))
	);
}

export function projectErrorCandidateOverlap(params: {
	fingerprint: DetectedSignal;
	overlap: ErrorCandidateOverlap;
	route: DetectedSignal;
	siteId: string;
}): ShadowErrorCandidateOverlap {
	const { overlap } = params;
	return {
		cooccurring: { ...overlap.cooccurring },
		fingerprint: {
			alias: selectionCandidateAlias(params.siteId, params.fingerprint),
			...overlap.fingerprint,
		},
		marginalRouteVisitorIdentifiers: overlap.visitorOverlapMeasurable
			? overlap.route.visitorIdentifiers - overlap.shared.visitorIdentifiers
			: null,
		route: {
			alias: selectionCandidateAlias(params.siteId, params.route),
			...overlap.route,
		},
		sessionOverlapMeasurable: overlap.sessionOverlapMeasurable,
		shared: { ...overlap.shared },
		visitorOverlapMeasurable: overlap.visitorOverlapMeasurable,
	};
}

interface MarginalPortfolioSelection {
	selected: DetectedSignal[];
	status: "baseline" | "measured" | "unavailable";
}

function overlapForRoute(params: {
	fingerprint: DetectedSignal;
	overlaps: ShadowErrorCandidateOverlap[];
	route: DetectedSignal;
	siteId: string;
}): ShadowErrorCandidateOverlap | null {
	const fingerprintAlias = selectionCandidateAlias(
		params.siteId,
		params.fingerprint
	);
	const routeAlias = selectionCandidateAlias(params.siteId, params.route);
	return (
		params.overlaps.find(
			(overlap) =>
				overlap.fingerprint.alias === fingerprintAlias &&
				overlap.route.alias === routeAlias
		) ?? null
	);
}

/**
 * Evaluation-only comparator for the exact current-vs-reach error swap. It
 * intentionally declines to infer a union from partial overlap data: a live
 * generalized portfolio rule would need set-union evidence for every selected
 * error candidate, not only a pair.
 */
function marginalPortfolioSelection(params: {
	inspection: WebsitePortfolioInspection;
	overlaps: ShadowErrorCandidateOverlap[];
	siteId: string;
}): MarginalPortfolioSelection {
	if (params.inspection.status !== "signals") {
		return { selected: [], status: "baseline" };
	}
	const current = params.inspection.plan.selected;
	const reach = params.inspection.reachPlan.selected;
	const currentKeys = new Set(current.map(signalKeyForDetectedSignal));
	const reachKeys = new Set(reach.map(signalKeyForDetectedSignal));
	const currentOnly = current.filter(
		(signal) => !reachKeys.has(signalKeyForDetectedSignal(signal))
	);
	const reachOnly = reach.filter(
		(signal) => !currentKeys.has(signalKeyForDetectedSignal(signal))
	);
	if (currentOnly.length === 0 && reachOnly.length === 0) {
		return { selected: current, status: "baseline" };
	}
	if (currentOnly.length !== 1 || reachOnly.length !== 1) {
		return { selected: current, status: "unavailable" };
	}
	const currentRoute = currentOnly[0];
	const reachRoute = reachOnly[0];
	if (!(currentRoute && reachRoute)) {
		throw new Error("Marginal portfolio candidates were missing");
	}
	if (
		!(
			isRouteErrorCandidate(currentRoute) &&
			isRouteErrorCandidate(reachRoute) &&
			currentRoute.severity === reachRoute.severity &&
			isRegression(currentRoute) === isRegression(reachRoute) &&
			currentRoute.reach?.unit === "visitor_identifiers" &&
			reachRoute.reach?.unit === "visitor_identifiers"
		)
	) {
		return { selected: current, status: "unavailable" };
	}
	const sharedFingerprint = current.filter(
		(signal) =>
			isFingerprintErrorCandidate(signal) &&
			reachKeys.has(signalKeyForDetectedSignal(signal))
	);
	const fingerprint = sharedFingerprint[0];
	if (!fingerprint || sharedFingerprint.length !== 1) {
		return { selected: current, status: "unavailable" };
	}
	const currentOverlap = overlapForRoute({
		fingerprint,
		overlaps: params.overlaps,
		route: currentRoute,
		siteId: params.siteId,
	});
	const reachOverlap = overlapForRoute({
		fingerprint,
		overlaps: params.overlaps,
		route: reachRoute,
		siteId: params.siteId,
	});
	const currentMarginal = currentOverlap?.marginalRouteVisitorIdentifiers;
	const reachMarginal = reachOverlap?.marginalRouteVisitorIdentifiers;
	if (
		!(
			currentOverlap?.visitorOverlapMeasurable &&
			reachOverlap?.visitorOverlapMeasurable &&
			typeof currentMarginal === "number" &&
			typeof reachMarginal === "number" &&
			fingerprint.reach?.unit === "visitor_identifiers" &&
			fingerprint.reach.current ===
				currentOverlap.fingerprint.visitorIdentifiers &&
			fingerprint.reach.current ===
				reachOverlap.fingerprint.visitorIdentifiers &&
			currentRoute.reach.current === currentOverlap.route.visitorIdentifiers &&
			reachRoute.reach.current === reachOverlap.route.visitorIdentifiers
		)
	) {
		return { selected: current, status: "unavailable" };
	}
	if (reachMarginal <= currentMarginal) {
		return { selected: current, status: "measured" };
	}
	return {
		selected: current.map((signal) =>
			signalKeyForDetectedSignal(signal) ===
			signalKeyForDetectedSignal(currentRoute)
				? reachRoute
				: signal
		),
		status: "measured",
	};
}

async function loadSelectedErrorOverlaps(params: {
	inspection: WebsitePortfolioInspection;
	lookbackDays: number;
	loadOverlap: typeof import("./error-candidate-overlap").loadErrorCandidateOverlap;
	site: RankedWebsite;
}): Promise<{
	overlaps: ShadowErrorCandidateOverlap[];
	unavailableCount: number;
}> {
	const pairs = selectedErrorCandidatePairs(params.inspection);
	const settled = await Promise.all(
		pairs.map(async ({ fingerprint, route }) => {
			try {
				const overlap = await params.loadOverlap({
					abortSignal: AbortSignal.timeout(STATEMENT_TIMEOUT_MS),
					fingerprint: prepareInvestigation(fingerprint, params.lookbackDays)
						.signal,
					route: prepareInvestigation(route, params.lookbackDays).signal,
					timezone: params.site.timezone,
					websiteId: params.site.id,
				});
				return overlap
					? {
							kind: "measured" as const,
							value: projectErrorCandidateOverlap({
								fingerprint,
								overlap,
								route,
								siteId: params.site.id,
							}),
						}
					: { kind: "unavailable" as const };
			} catch {
				// The inventory remains valid when optional overlap evidence is absent.
				return { kind: "unavailable" as const };
			}
		})
	);
	return {
		overlaps: settled.flatMap((result) =>
			result.kind === "measured" ? [result.value] : []
		),
		unavailableCount: settled.filter((result) => result.kind === "unavailable")
			.length,
	};
}

/**
 * Removes raw signal subjects before a candidate inventory leaves the
 * read-only shadow. The aliases are stable for one website while the report
 * contains no routes, error text, event names, or configured definitions.
 */
export function projectSelectionAudit(params: {
	errorOverlapUnavailableCount?: number;
	errorOverlaps?: ShadowErrorCandidateOverlap[];
	inspection: WebsitePortfolioInspection;
	siteId: string;
}): ShadowSelectionAudit {
	const entries =
		params.inspection.status === "signals"
			? params.inspection.plan.entries
			: [];
	const eligibleKeys = new Set(
		params.inspection.eligibleSignals.map(signalKeyForDetectedSignal)
	);
	const qualificationsByKey = new Map<string, CandidateQualification>(
		params.inspection.status === "signals"
			? params.inspection.qualifications.map((qualification) => [
					signalKeyForDetectedSignal(qualification.signal),
					qualification,
				])
			: []
	);
	const reachEntriesByKey = new Map<string, CoveragePortfolioEntry>(
		params.inspection.status === "signals"
			? params.inspection.reachPlan.entries.map((entry) => [
					signalKeyForDetectedSignal(entry.signal),
					entry,
				])
			: []
	);
	const errorOverlaps = params.errorOverlaps ?? [];
	const marginalPortfolio = marginalPortfolioSelection({
		inspection: params.inspection,
		overlaps: errorOverlaps,
		siteId: params.siteId,
	});
	const marginalSelectedAtByKey = new Map(
		marginalPortfolio.selected.map((signal, index) => [
			signalKeyForDetectedSignal(signal),
			index + 1,
		])
	);
	const overlapClustering =
		params.inspection.status === "signals" &&
		params.inspection.overlapClustering
			? projectOverlapClustering(params.inspection.overlapClustering)
			: null;
	const candidates = entries.map((entry) => {
		const qualification = qualificationsByKey.get(
			signalKeyForDetectedSignal(entry.signal)
		);
		if (!qualification) {
			throw new Error(
				"Selection audit candidate is missing qualification state"
			);
		}
		return {
			alias: selectionCandidateAlias(params.siteId, entry.signal),
			baseline: entry.signal.baseline,
			changePercent: entry.signal.deltaPercent,
			current: entry.signal.current,
			eligible: eligibleKeys.has(signalKeyForDetectedSignal(entry.signal)),
			family: entry.family,
			marginalSelectedAt:
				marginalSelectedAtByKey.get(signalKeyForDetectedSignal(entry.signal)) ??
				null,
			metric: selectionMetricFamily(entry.signal),
			omittedFor: [...entry.omittedFor],
			qualification: qualification.status,
			qualificationReason: qualification.reason,
			rank: entry.rank,
			reach: entry.signal.reach ?? null,
			reachSelectedAt:
				reachEntriesByKey.get(signalKeyForDetectedSignal(entry.signal))
					?.selectedAt ?? null,
			regression: isRegression(entry.signal),
			selectedAt: entry.selectedAt,
			severity: entry.signal.severity,
		};
	});
	return {
		asOf: params.inspection.asOf,
		candidateUniverseFingerprint: candidateUniverseFingerprint(
			params.siteId,
			entries
		),
		candidates,
		detectedUniverseFingerprint: detectedUniverseFingerprint(
			params.siteId,
			params.inspection.detectedSignals
		),
		detectedCount: params.inspection.detectedSignals.length,
		dueCandidate: params.inspection.dueSignalKey !== null,
		errorOverlapUnavailableCount: params.errorOverlapUnavailableCount ?? 0,
		errorOverlaps,
		eligibleCount: params.inspection.eligibleSignals.length,
		history: "fresh_in_memory",
		marginalRankingStatus: marginalPortfolio.status,
		marginalSelectedCount: marginalPortfolio.selected.length,
		overlapClustering,
		portfolioLimit: coveragePortfolioLimit("manual"),
		qualifiedCount: candidates.filter(
			(candidate) => candidate.qualification === "qualified"
		).length,
		qualifiedSelectedCount: candidates.filter(
			(candidate) =>
				candidate.qualification === "qualified" && candidate.selectedAt !== null
		).length,
		reachSelectedCount:
			params.inspection.status === "signals"
				? params.inspection.reachPlan.selected.length
				: 0,
		screenedCount: candidates.filter(
			(candidate) => candidate.qualification === "screened"
		).length,
		screenedSelectedCount: candidates.filter(
			(candidate) =>
				candidate.qualification === "screened" && candidate.selectedAt !== null
		).length,
		selectedCount:
			params.inspection.status === "signals"
				? params.inspection.plan.selected.length
				: 0,
		status: params.inspection.status,
	};
}

function projectAgentUsage(
	result: InsightAgentResult
): ShadowAgentUsage | null {
	if (!(result.modelId && result.usage)) {
		return null;
	}
	return projectUsage(result.modelId, result.usage);
}

function projectUsage(
	modelId: string,
	modelUsage: LanguageModelUsage
): ShadowAgentUsage {
	const usage = summarizeAgentUsage(modelId, modelUsage);
	return {
		cacheReadTokens: usage.cache_read_tokens,
		cacheWriteTokens: usage.cache_write_tokens,
		costFallback: usage.cost_fallback,
		estimatedCostUsd: usage.cost_total_usd,
		inputTokens: usage.input_tokens,
		modelId,
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

export function projectBriefProvenance(
	brief: InsightAgentResult["brief"]
): ShadowCase["brief"] {
	if (!brief) {
		return null;
	}
	return {
		claimSources: {
			impact: brief.claimRefs.impact?.source ?? null,
			problem: brief.claimRefs.problem.source,
			rootCause: brief.claimRefs.rootCause?.source ?? null,
		},
		scope: brief.scope,
		userExperience: brief.userExperience,
	};
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
	const brief = projectBriefProvenance(artifact.brief);
	return {
		agent: params.agent,
		asOf: artifact.asOf,
		brief,
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
		timeout: null,
	};
}

export function projectTimeoutMetadata(error: unknown): ShadowTimeout | null {
	if (
		!(error instanceof Error) ||
		error.name !== "InsightAgentTimeoutError" ||
		!("timeout" in error)
	) {
		return null;
	}
	const timeout = error.timeout as Record<string, unknown> | null;
	if (
		!timeout ||
		typeof timeout.budgetMs !== "number" ||
		typeof timeout.elapsedMs !== "number" ||
		typeof timeout.overdueMs !== "number" ||
		typeof timeout.phase !== "string" ||
		!Number.isFinite(timeout.budgetMs) ||
		!Number.isFinite(timeout.elapsedMs) ||
		!Number.isFinite(timeout.overdueMs) ||
		timeout.budgetMs < 0 ||
		timeout.elapsedMs < 0 ||
		timeout.overdueMs < 0 ||
		(timeout.phase !== "generation" && timeout.phase !== "setup")
	) {
		return null;
	}
	if (timeout.overdueMs !== Math.max(0, timeout.elapsedMs - timeout.budgetMs)) {
		return null;
	}
	return {
		budgetMs: timeout.budgetMs,
		elapsedMs: timeout.elapsedMs,
		overdueMs: timeout.overdueMs,
		phase: timeout.phase,
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
			? cause && cause !== params.error.message
				? `${params.error.message}: ${cause}`
				: params.error.message
			: "Unknown failure";
	return {
		agent: params.agent,
		asOf: params.asOf.toISOString(),
		brief: null,
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
		timeout: projectTimeoutMetadata(params.error),
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
	const briefs = cases.flatMap((item) => (item.brief ? [item.brief] : []));
	const completed = cases.filter((item) => item.status === "completed");
	const timeouts = cases.flatMap((item) =>
		item.timeout ? [item.timeout] : []
	);
	return {
		agentCostUsd: summarizeInvestigationCosts(cases.map((item) => item.agent)),
		briefClaims: {
			completed: briefs.length,
			scopes: countBy(briefs.map((brief) => brief.scope)),
			sourcedImpact: briefs.filter(
				(brief) => brief.claimSources.impact !== null
			).length,
			sourcedRootCause: briefs.filter(
				(brief) => brief.claimSources.rootCause !== null
			).length,
			userExperience: countBy(briefs.map((brief) => brief.userExperience)),
		},
		cases: cases.length,
		durationsMs: {
			p50: percentile(
				completed.map((item) => item.durationMs),
				0.5
			),
			p95: percentile(
				completed.map((item) => item.durationMs),
				0.95
			),
		},
		status: countBy(cases.map((item) => item.status)),
		timeouts: {
			count: timeouts.length,
			maxOverdueMs: Math.max(
				0,
				...timeouts.map((timeout) => timeout.overdueMs)
			),
			phases: countBy(timeouts.map((timeout) => timeout.phase)),
		},
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

async function runSelectionAudit(params: {
	annotations: AnnotationRow[];
	funnels: FunnelRow[];
	goals: GoalRow[];
	options: CliOptions;
	referenceTime: Date;
	setup: SetupMetadata;
	sites: RankedWebsite[];
}): Promise<ShadowSelectionAudit[]> {
	const [offsetDays] = params.options.offsets;
	if (offsetDays === undefined) {
		throw new Error("selection-audit requires one frozen snapshot");
	}
	const [
		{ INSIGHT_LOOKBACK_DAYS, inspectWebsitePortfolioWithSources },
		{ loadErrorCandidateOverlap },
	] = await Promise.all([
		import("./generation"),
		import("./error-candidate-overlap"),
	]);
	return mapConcurrent(
		params.sites,
		params.options.concurrency,
		async (site) => {
			const asOf = resolveShadowAsOf(
				params.referenceTime,
				offsetDays,
				site.timezone,
				params.options.asOfMode
			);
			const attempts: ShadowAgentAttempt[] = [];
			const sources = await createSources({
				annotations: params.annotations,
				asOf,
				attempts,
				funnels: params.funnels,
				goals: params.goals,
				historical: offsetDays > 0,
				model: params.options.model,
				observations: [],
				setup: params.setup,
				site,
			});
			const inspection = await inspectWebsitePortfolioWithSources(
				{
					asOf,
					domain: site.domain,
					githubRepository: null,
					name: site.name,
					organizationId: site.organizationId,
					timezone: site.timezone,
					websiteId: site.id,
				},
				sources,
				"manual"
			);
			if (attempts.length > 0) {
				throw new Error(
					"selection-audit must not invoke the investigation agent"
				);
			}
			const errorOverlap = await loadSelectedErrorOverlaps({
				inspection,
				loadOverlap: loadErrorCandidateOverlap,
				lookbackDays: INSIGHT_LOOKBACK_DAYS,
				site,
			});
			return projectSelectionAudit({
				errorOverlapUnavailableCount: errorOverlap.unavailableCount,
				errorOverlaps: errorOverlap.overlaps,
				inspection,
				siteId: site.id,
			});
		}
	);
}

async function runProductionShadow(options: CliOptions): Promise<ShadowReport> {
	disableExternalEffects();
	configureReadOnlyClickHouse();
	const referenceTime = options.referenceTime;
	const restoreConsole = silenceLibraryConsole();
	try {
		await assertReadOnlyClickHouse();
		const ranked = options.websiteId
			? [options.websiteId]
			: await loadCohort(options.minEvents, options.limit, referenceTime);
		const metadata = await loadMetadata(ranked);
		if (options.websiteId && metadata.sites.length === 0) {
			throw new Error("The requested website was not found");
		}
		if (options.selectionAudit) {
			const selectionAudit = await runSelectionAudit({
				annotations: metadata.annotations,
				funnels: metadata.funnels,
				goals: metadata.goals,
				options,
				referenceTime,
				setup: metadata.setup,
				sites: metadata.sites,
			});
			return {
				aggregate: aggregateCases([]),
				cases: [],
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
					engine: "candidate inventory",
					generatedAt: new Date().toISOString(),
					history: "in_memory",
					minEvents: options.minEvents,
					model: null,
					offsets: options.offsets,
					referenceTime: referenceTime.toISOString(),
					sites: metadata.sites.length,
				},
				selectionAudit,
			};
		}
		const { investigateWebsitePortfolioWithSources } = await import(
			"./generation"
		);
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
					const offsetStartedAt = performance.now();
					const input = {
						asOf,
						domain: site.domain,
						githubRepository: offsetDays === 0 ? site.githubRepository : null,
						name: site.name,
						organizationId: site.organizationId,
						timezone: site.timezone,
						websiteId: site.id,
					};
					const attempts: ShadowAgentAttempt[] = [];
					let artifacts: WebsiteInvestigationArtifact[] = [];
					let portfolioError: unknown;
					try {
						const sources = await createSources({
							annotations: metadata.annotations,
							asOf,
							attempts,
							funnels: metadata.funnels,
							goals: metadata.goals,
							historical: offsetDays > 0,
							model: options.model,
							observations,
							setup: metadata.setup,
							site,
						});
						let remainingAgentSlots = options.batchSize;
						artifacts = await investigateWebsitePortfolioWithSources(
							input,
							sources,
							"manual",
							() => {
								if (remainingAgentSlots === 0) {
									return Promise.resolve(false);
								}
								remainingAgentSlots -= 1;
								return Promise.resolve(true);
							}
						);
					} catch (error) {
						portfolioError = error;
					}

					for (const [attemptIndex, attempt] of attempts.entries()) {
						const signal = attempt.input.signal;
						const subjectAlias = subjectAliasForSignal(signal, subjectAliases);
						const secrets = [
							...siteSecrets,
							signal.entity.id,
							signal.entity.label,
							...(attempt.input.relatedSignals ?? []).flatMap((related) => [
								related.entity.id,
								related.entity.label,
							]),
							...(attempt.input.coveredRouteContext ?? []).flatMap(
								(coveredRoute) => [
									coveredRoute.entity.id,
									coveredRoute.entity.label,
								]
							),
						];
						const caseId = `${caseIdPrefix}#${attemptIndex + 1}`;
						if (attempt.error !== undefined) {
							cases.push(
								failedCase({
									agent: attempt.agent,
									asOf,
									caseId,
									durationMs: attempt.durationMs,
									error: attempt.error,
									selectedSignal: signal,
									secrets,
									subjectAlias,
									trace: attempt.trace,
								})
							);
							continue;
						}
						if (!attempt.result) {
							continue;
						}
						const artifact: WebsiteInvestigationArtifact = {
							asOf: asOf.toISOString(),
							brief: attempt.result.brief,
							evidence: attempt.input.evidence,
							outcome: attempt.result.outcome,
							signal,
							status: "completed",
						};
						cases.push(
							projectCase({
								agent: attempt.agent,
								artifact,
								caseId,
								durationMs: attempt.durationMs,
								secrets,
								subjectAlias,
								trace: attempt.trace,
							})
						);
					}

					if (attempts.length === 0 && !portfolioError) {
						for (const artifact of artifacts) {
							cases.push(
								projectCase({
									agent: null,
									artifact,
									caseId: `${caseIdPrefix}#1`,
									durationMs: Math.max(
										0,
										Math.round(performance.now() - offsetStartedAt)
									),
									secrets: siteSecrets,
									subjectAlias: null,
									trace: [],
								})
							);
						}
					}
					if (
						portfolioError !== undefined &&
						!attempts.some((attempt) => attempt.error === portfolioError)
					) {
						cases.push(
							failedCase({
								agent: null,
								asOf,
								caseId: `${caseIdPrefix}#error`,
								durationMs: Math.max(
									0,
									Math.round(performance.now() - offsetStartedAt)
								),
								error: portfolioError,
								secrets: siteSecrets,
								trace: [],
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
		const shadow = await runProductionShadow(options);
		if (output) {
			await writeFile(output, `${JSON.stringify(shadow, null, 2)}\n`, {
				mode: 0o600,
			});
			await chmod(output, 0o600);
		}
		const stdout = {
			aggregate: shadow.aggregate,
			meta: shadow.meta,
			...(shadow.selectionAudit
				? { selectionAudit: shadow.selectionAudit }
				: {}),
		};
		process.stdout.write(`${JSON.stringify(stdout, null, 2)}\n`);
		if ((shadow.aggregate.status.error ?? 0) > 0) {
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
