import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
	InsightEvidenceReadRequest,
	ProductMetricsFetcher,
} from "@databuddy/ai/insights/evidence-reader";
import type { GeneratedInsight } from "@databuddy/shared/insights";
import { Pool, type PoolClient } from "pg";
import type {
	InvestigationSources,
	WebsiteInvestigationArtifact,
} from "../../../apps/insights/src/generation";
import type {
	FunnelDef,
	FunnelGoalDeps,
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
const WHITESPACE_PATTERN = /\s+/;
const LOCAL_SHADOW_REDIS_URL = "redis://127.0.0.1:6379/15";
const LOCAL_SHADOW_POSTGRES_GUARD_URL =
	"postgresql://shadow_guard:shadow_guard@127.0.0.1:1/shadow_guard?sslmode=disable";
const SHADOW_DB_CONNECTION_TIMEOUT_MS = "250";
const SECRET_TOKEN_CHARACTER_PATTERN = /^[\p{L}\p{N}_-]$/u;
const SECRET_TOKEN_BOUNDARY = "[\\p{L}\\p{N}_-]";
const UNRESOLVED_IDENTIFIER_PATTERN =
	/^Identifier [`']([A-Za-z_][A-Za-z0-9_.]*)[`'] cannot be resolved from table with name ([A-Za-z_][A-Za-z0-9_]*)\./;
const CLICKHOUSE_OPS_QUERIES = new Set([
	"errors_summary",
	"errors_by_page",
	"error_fingerprints",
	"uptime_summary",
]);

export const HISTORICAL_LIMITATIONS = [
	"Definitions are limited to records that are active and undeleted now; inactive, deleted, and pre-edit revisions cannot be reconstructed.",
	"Configuration, website metadata, and annotation edits are not historized; the replay uses the current surviving records conservatively.",
	"Persisted observations respect their creation timestamps, but warehouse queries read currently retained data for past windows, so late-arriving or deleted warehouse facts and what was known at the original run time cannot be reconstructed.",
	"Persisted observations seed lifecycle state and replayed observations are appended in memory only; production state is never changed.",
] as const;

interface CliOptions {
	concurrency: number;
	limit: number | null;
	minEvents: number;
	offsets: number[];
	output: string | null;
	repeat: boolean;
}

interface RankedWebsite {
	domain: string;
	events: number;
	id: string;
	organizationId: string;
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

export interface ShadowObservation extends LatestInsightObservation {
	createdAt: Date;
	organizationId: string;
	signalKey: string;
	websiteId: string;
}

interface ShadowMetadata {
	annotations: AnnotationRow[];
	funnels: FunnelRow[];
	goals: GoalRow[];
	observations: ShadowObservation[];
	sites: RankedWebsite[];
}

export function withDefinitionSnapshot(
	base: FunnelGoalDeps,
	funnels: FunnelDef[],
	goals: GoalDef[]
): FunnelGoalDeps {
	const snapshot = {
		...base,
		fetchFunnels: async () => funnels,
		fetchGoals: async () => goals,
	};
	snapshot.fetchDefinitionWindow = undefined;
	return snapshot;
}

function percentage(part: number, total: number): number {
	return total > 0 ? Math.round((part / total) * 10_000) / 100 : 0;
}

export function createSnapshotProductMetricsFetcher(
	deps: Pick<FunnelGoalDeps, "funnelConversion" | "goalConversion">,
	funnels: FunnelDef[],
	goals: GoalDef[]
): ProductMetricsFetcher {
	const funnelsById = new Map(funnels.map((funnel) => [funnel.id, funnel]));
	const goalsById = new Map(goals.map((goal) => [goal.id, goal]));

	return async (_appContext, range, target, abortSignal) => {
		if (target.type === "goal") {
			const goal = goalsById.get(target.id);
			if (!goal) {
				throw new Error(
					`Goal ${target.id} is absent from the definition snapshot`
				);
			}
			const conversion = await deps.goalConversion(goal, range, abortSignal);
			return {
				results: [
					{
						type: "goals_summary",
						count: 1,
						goals: [
							{
								id: goal.id,
								is_active: true,
								name: goal.name,
								type: goal.type,
								target: goal.target,
								definition_updated_at: goal.updatedAt.toISOString(),
								overall_conversion_rate: conversion.rate,
								total_users_entered: conversion.entrants,
								total_users_completed: conversion.completions,
								error_context_available: false,
								error_rate: 0,
							},
						],
					},
				],
			};
		}

		if (target.type === "funnel") {
			const funnel = funnelsById.get(target.id);
			if (!funnel) {
				throw new Error(
					`Funnel ${target.id} is absent from the definition snapshot`
				);
			}
			const conversion = await deps.funnelConversion(
				funnel,
				range,
				abortSignal
			);
			const usersByStep = new Map(
				conversion.steps.map((step) => [step.stepNumber, step.users])
			);
			const steps = funnel.steps.map((step, index) => ({
				step_number: index + 1,
				name: step.name,
				target: step.target,
				type: step.type,
				users: usersByStep.get(index + 1) ?? 0,
			}));
			const dropoffs = steps.slice(1).map((step, index) => {
				const previousUsers = steps[index]?.users ?? 0;
				return {
					rate: percentage(previousUsers - step.users, previousUsers),
					step: step.step_number,
				};
			});
			const biggestDropoff = dropoffs.reduce<
				{ rate: number; step: number } | undefined
			>(
				(current, item) =>
					!current || item.rate > current.rate ? item : current,
				undefined
			);

			return {
				results: [
					{
						type: "funnels_summary",
						count: 1,
						funnels: [
							{
								id: funnel.id,
								is_active: true,
								name: funnel.name,
								definition_updated_at: funnel.updatedAt.toISOString(),
								steps,
								overall_conversion_rate: conversion.rate,
								total_users_entered: conversion.entrants,
								total_users_completed: conversion.completions,
								biggest_dropoff_step: biggestDropoff?.step ?? 1,
								biggest_dropoff_rate: biggestDropoff?.rate ?? 0,
								error_context_available: false,
								error_correlation_rate: 0,
							},
						],
					},
				],
			};
		}

		throw new Error("Snapshot product metrics support goals and funnels only");
	};
}

export function assertShadowEvidenceUsesClickHouse(
	request: InsightEvidenceReadRequest
): void {
	if (request.name !== "ops_context") {
		return;
	}
	const nonClickHouseQuery = request.input.queries.find(
		(query) => !CLICKHOUSE_OPS_QUERIES.has(query.type)
	);
	if (nonClickHouseQuery) {
		throw new Error(
			`Production shadow blocks non-ClickHouse ops evidence: ${nonClickHouseQuery.type}`
		);
	}
}

interface ShadowCase {
	caseId: string;
	detectedSignalCount: number;
	detectionComplete: boolean;
	detectionIssues: {
		definitionFailureSummaries: string[];
		failedDefinitions: number;
		failedMetricFamilies: number;
		nonComparableDefinitions: number;
		rotatedDefinitions: number;
	};
	disposition: string | null;
	durationMs: number;
	engineId: string;
	errorSummary: string | null;
	errorType: string | null;
	evidence: {
		failed: number;
		queries: Record<string, number>;
		statuses: Record<string, number>;
		total: number;
		truncated: number;
	};
	insight: null | {
		description: string;
		evidence: string[];
		impact: string | null;
		rootCause: string | null;
		suggestion: string;
		title: string;
		visibleWords: number;
	};
	offsetDays: number;
	repeatDifferences: string[];
	repeatDurationMs: number | null;
	repeatEqual: boolean | null;
	selectedSignal: null | {
		changePercent: number | null;
		current: number;
		entityType: string;
		kind: string;
		method: string;
		metric: string;
		previous: number | null;
		sentiment: string;
		severity: string;
	};
	status: string;
}

export interface ShadowGateMetrics {
	detectionFailures: number;
	detectionIncomplete: number;
	evidenceFailed: number;
	evidenceTruncated: number;
	repeatAgreement: number | null;
	status: Readonly<Record<string, number>>;
	visibleWords: { max: number };
}

export interface ShadowGateFailure {
	actual: number | null;
	comparator: "eq" | "lte";
	gate:
		| "detection_failed_probes"
		| "error_cases"
		| "evidence_failed"
		| "evidence_truncated"
		| "invalid_output_cases"
		| "repeat_agreement"
		| "visible_words_max";
	required: number;
}

interface ShadowReport {
	aggregate: {
		cases: number;
		cards: number;
		detectionFailures: number;
		detectionIncomplete: number;
		nonComparableDefinitions: number;
		rotatedDefinitions: number;
		dispositions: Record<string, number>;
		durationsMs: { p50: number; p95: number };
		evidenceFailed: number;
		evidenceTruncated: number;
		metricFamilies: Record<string, number>;
		repeatAgreement: number | null;
		repeatDurationsMs: { p50: number; p95: number } | null;
		severity: Record<string, number>;
		status: Record<string, number>;
		visibleWords: { max: number; p50: number; p95: number };
	};
	cases: ShadowCase[];
	gateFailures: ShadowGateFailure[];
	meta: {
		concurrency: number;
		engine: "current deterministic production path";
		generatedAt: string;
		historicalLimitations: readonly string[];
		history: "persisted-seed/in-memory-replay/current-records";
		isolation: {
			clickhouse: "read-only-user/verified";
			postgres: "explicit-read-only-transaction/process-quarantined";
			productEvidence: "definition-snapshot/direct-clickhouse";
			redis: "loopback-db-15";
		};
		minEvents: number;
		offsets: number[];
		productionWrites: false;
		repeat: boolean;
		sites: number;
	};
}

function positiveInteger(value: string | undefined, name: string): number {
	const parsed = Number.parseInt(value ?? "", 10);
	if (!(Number.isInteger(parsed) && parsed > 0)) {
		throw new Error(`${name} must be a positive integer`);
	}
	return parsed;
}

function nonNegativeInteger(value: string, name: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!(Number.isInteger(parsed) && parsed >= 0)) {
		throw new Error(`${name} must be a non-negative integer`);
	}
	return parsed;
}

function optionValue(args: string[], name: string): string | undefined {
	const prefix = `${name}=`;
	return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseOptions(args: string[]): CliOptions {
	if (!args.includes(REQUIRED_CONFIRMATION)) {
		throw new Error(
			`Production shadow evaluation requires ${REQUIRED_CONFIRMATION}`
		);
	}
	const offsetsValue = optionValue(args, "--offsets");
	const offsets = offsetsValue
		? offsetsValue
				.split(",")
				.map((value) => nonNegativeInteger(value, "offset"))
		: DEFAULT_OFFSETS;
	if (new Set(offsets).size !== offsets.length) {
		throw new Error("Offsets must be unique");
	}
	const limitValue = optionValue(args, "--limit");
	return {
		concurrency: positiveInteger(
			optionValue(args, "--concurrency") ?? String(DEFAULT_CONCURRENCY),
			"concurrency"
		),
		limit: limitValue ? positiveInteger(limitValue, "limit") : null,
		minEvents: positiveInteger(
			optionValue(args, "--min-events") ?? String(DEFAULT_MIN_EVENTS),
			"min-events"
		),
		offsets,
		output: optionValue(args, "--output") ?? null,
		repeat: args.includes("--repeat"),
	};
}

function disableExternalEffects(): void {
	process.env.NODE_ENV = "test";
	process.env.SERVICE_NAME = "insights-production-shadow-readonly";
	process.env.DB_POOL_MAX = "1";
	for (const key of ["AXIOM_API_KEY", "AXIOM_TOKEN", "SUPERLOG_API_KEY"]) {
		delete process.env[key];
	}
}

function postgresUrl(databaseUrl: string): string {
	let url: URL;
	try {
		url = new URL(databaseUrl);
	} catch {
		throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
	}
	if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
		throw new Error("DATABASE_URL must use the postgres protocol");
	}
	return url.toString();
}

export function quarantineShadowPostgresEnvironment(): void {
	process.env.DATABASE_URL = LOCAL_SHADOW_POSTGRES_GUARD_URL;
	process.env.DB_CONNECTION_TIMEOUT_MS = SHADOW_DB_CONNECTION_TIMEOUT_MS;
	delete process.env.PGOPTIONS;
}

function createReadOnlyMetadataLoader(): (
	ranked: Array<{ events: number; id: string }>
) => Promise<ShadowMetadata> {
	const productionUrl = process.env.DATABASE_URL;
	if (!productionUrl) {
		throw new Error("DATABASE_URL is required");
	}
	const readOnlyProductionUrl = postgresUrl(productionUrl);
	quarantineShadowPostgresEnvironment();

	let used = false;
	return (ranked) => {
		if (used) {
			throw new Error("Production shadow metadata may only be loaded once");
		}
		used = true;
		return loadMetadata(readOnlyProductionUrl, ranked);
	};
}

export function configureIsolatedShadowRedis(): void {
	process.env.REDIS_URL = LOCAL_SHADOW_REDIS_URL;
	process.env.BULLMQ_REDIS_URL = LOCAL_SHADOW_REDIS_URL;
	process.env.INSIGHTS_BULLMQ_REDIS_URL = LOCAL_SHADOW_REDIS_URL;
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
	databaseUrl: string,
	work: (client: PoolClient) => Promise<T>
): Promise<T> {
	const pool = new Pool({
		application_name: "databuddy_insights_shadow_readonly",
		connectionString: databaseUrl,
		connectionTimeoutMillis: 10_000,
		max: 1,
	});
	let client: PoolClient | undefined;
	try {
		client = await pool.connect();
		// Some managed Postgres proxies reject startup `options`. Make the private
		// one-shot session read-only before beginning the only transaction instead.
		await client.query("SET default_transaction_read_only = on");
		const defaultMode = await client.query<{
			default_transaction_read_only: string;
		}>("SHOW default_transaction_read_only");
		if (defaultMode.rows[0]?.default_transaction_read_only !== "on") {
			throw new Error("Postgres session is not read-only");
		}
		await client.query("BEGIN TRANSACTION READ ONLY");
		await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
		await client.query("SET LOCAL lock_timeout = 1000");
		const transactionMode = await client.query<{
			transaction_read_only: string;
		}>("SHOW transaction_read_only");
		if (transactionMode.rows[0]?.transaction_read_only !== "on") {
			throw new Error("Postgres transaction is not read-only");
		}
		return await work(client);
	} finally {
		if (client) {
			await client.query("ROLLBACK").catch(() => undefined);
			client.release();
		}
		await pool.end();
	}
}

async function loadCohort(
	minEvents: number,
	limit: number | null
): Promise<Array<{ events: number; id: string }>> {
	const { chQuery } = await import("@databuddy/db/clickhouse");
	const readonlySetting = await chQuery<{ readonly: number | string }>(
		"SELECT getSetting({setting:String}) AS readonly",
		{ setting: "readonly" }
	);
	if (Number(readonlySetting[0]?.readonly) < 1) {
		throw new Error("ClickHouse connection is not read-only");
	}
	const rows = await chQuery<{ events: number; id: string }>(
		`SELECT client_id AS id, count() AS events
		 FROM analytics.events
		 WHERE time >= now() - INTERVAL 60 DAY
		   AND time < toStartOfDay(now())
		 GROUP BY client_id
		 HAVING events >= {minEvents:UInt64}
		 ORDER BY events DESC, id ASC
		 ${limit ? "LIMIT {limit:UInt32}" : ""}`,
		{ minEvents, ...(limit ? { limit } : {}) }
	);
	return rows.map((row) => ({ events: Number(row.events), id: row.id }));
}

function loadMetadata(
	databaseUrl: string,
	ranked: Array<{ events: number; id: string }>
): Promise<ShadowMetadata> {
	if (ranked.length === 0) {
		return Promise.resolve({
			annotations: [],
			funnels: [],
			goals: [],
			observations: [],
			sites: [],
		});
	}
	return inReadOnlyTransaction(databaseUrl, async (client) => {
		const ids = ranked.map((item) => item.id);
		const siteResult = await client.query<{
			domain: string;
			id: string;
			organization_id: string;
			timezone: string | null;
		}>(
			`SELECT w.id, w.organization_id, w.domain, c.timezone
					 FROM websites w
					 LEFT JOIN insight_generation_configs c
					   ON c.organization_id = w.organization_id
					  AND to_jsonb(c) ->> 'website_id' IS NULL
					 WHERE w.id = ANY($1::text[])
					   AND w."deletedAt" IS NULL`,
			[ids]
		);
		const funnelResult = await client.query<{
			created_at: Date;
			filters: FunnelDef["filters"];
			id: string;
			name: string;
			steps: FunnelDef["steps"];
			updated_at: Date;
			website_id: string;
		}>(
			`SELECT id, website_id, name, steps, filters, created_at, updated_at
					 FROM funnel_definitions
					 WHERE website_id = ANY($1::text[])
					   AND is_active = true
					   AND deleted_at IS NULL
					   AND jsonb_array_length(steps) > 1`,
			[ids]
		);
		const goalResult = await client.query<{
			created_at: Date;
			filters: GoalDef["filters"];
			id: string;
			name: string;
			target: string;
			type: GoalDef["type"];
			updated_at: Date;
			website_id: string;
		}>(
			`SELECT id, website_id, name, type, target, filters, created_at, updated_at
					 FROM goals
					 WHERE website_id = ANY($1::text[])
					   AND is_active = true
					   AND deleted_at IS NULL`,
			[ids]
		);
		const annotationResult = await client.query<{
			created_at: Date;
			deleted_at: Date | null;
			text: string;
			updated_at: Date;
			website_id: string;
			x_value: Date;
		}>(
			`SELECT website_id, x_value, text, created_at, updated_at, deleted_at
					 FROM annotations
					 WHERE website_id = ANY($1::text[])`,
			[ids]
		);
		const observationResult = await client.query<{
			as_of: Date;
			created_at: Date;
			decision: LatestInsightObservation["decision"];
			evidence: LatestInsightObservation["evidence"];
			organization_id: string;
			recheck_at: Date;
			signal: LatestInsightObservation["signal"];
			signal_key: string;
			website_id: string;
		}>(
			`SELECT organization_id, website_id, signal_key, as_of,
			        decision, evidence, signal, recheck_at, created_at
			 FROM insight_observations
			 WHERE website_id = ANY($1::text[])
			 ORDER BY website_id, signal_key, as_of, created_at`,
			[ids]
		);
		const rank = new Map(ranked.map((item, index) => [item.id, index]));
		const events = new Map(ranked.map((item) => [item.id, item.events]));
		const sites = siteResult.rows
			.map((row) => ({
				domain: row.domain,
				events: events.get(row.id) ?? 0,
				id: row.id,
				organizationId: row.organization_id,
				timezone: safeTimezone(row.timezone),
			}))
			.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
		return {
			sites,
			funnels: funnelResult.rows.map((row) => ({
				createdAt: row.created_at,
				filters: row.filters,
				id: row.id,
				name: row.name,
				steps: row.steps,
				updatedAt: row.updated_at,
				websiteId: row.website_id,
			})),
			goals: goalResult.rows.map((row) => ({
				createdAt: row.created_at,
				filters: row.filters,
				id: row.id,
				name: row.name,
				target: row.target,
				type: row.type,
				updatedAt: row.updated_at,
				websiteId: row.website_id,
			})),
			observations: observationResult.rows.map((row) => ({
				asOf: row.as_of,
				createdAt: row.created_at,
				decision: row.decision,
				evidence: row.evidence,
				organizationId: row.organization_id,
				recheckAt: row.recheck_at,
				signal: row.signal,
				signalKey: row.signal_key,
				websiteId: row.website_id,
			})),
			annotations: annotationResult.rows.map((row) => ({
				createdAt: row.created_at,
				deletedAt: row.deleted_at,
				text: row.text,
				updatedAt: row.updated_at,
				websiteId: row.website_id,
				xValue: row.x_value,
			})),
		};
	});
}

function dateAtOffset(offsetDays: number, evaluationDate: Date): string {
	const date = new Date(
		Date.UTC(
			evaluationDate.getUTCFullYear(),
			evaluationDate.getUTCMonth(),
			evaluationDate.getUTCDate()
		) -
			offsetDays * 86_400_000
	);
	return date.toISOString().slice(0, 10);
}

export function chronologicalOffsets(offsets: number[]): number[] {
	return [...offsets].sort((left, right) => right - left);
}

export function observationsAt(params: {
	asOf: Date;
	organizationId: string;
	persisted: ShadowObservation[];
	signalKeys: string[];
	simulated: ReadonlyMap<string, LatestInsightObservation>;
	websiteId: string;
}): Map<string, LatestInsightObservation> {
	const requested = new Set(params.signalKeys);
	const persisted = new Map<string, ShadowObservation>();
	// A historical replay can use a backfill only after that observation existed.
	for (const observation of params.persisted) {
		if (
			observation.organizationId !== params.organizationId ||
			observation.websiteId !== params.websiteId ||
			!requested.has(observation.signalKey) ||
			observation.asOf > params.asOf ||
			observation.createdAt > params.asOf
		) {
			continue;
		}
		const current = persisted.get(observation.signalKey);
		if (
			!current ||
			observation.asOf > current.asOf ||
			(observation.asOf.getTime() === current.asOf.getTime() &&
				observation.createdAt > current.createdAt)
		) {
			persisted.set(observation.signalKey, observation);
		}
	}

	const result = new Map<string, LatestInsightObservation>(persisted);
	for (const [signalKey, observation] of params.simulated) {
		if (!requested.has(signalKey) || observation.asOf > params.asOf) {
			continue;
		}
		const current = result.get(signalKey);
		if (!current || observation.asOf >= current.asOf) {
			result.set(signalKey, observation);
		}
	}
	return result;
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
	loadObservations: InvestigationSources["loadObservations"];
	site: RankedWebsite;
	attemptSignal: AbortSignal;
}): Promise<InvestigationSources> {
	const [
		{ createInsightEvidenceReader },
		{ hasTrackedInsightData },
		{ detectSignals },
		{ defaultFunnelGoalDeps, detectFunnelGoalSignals },
		{ annotationMatchesSignal, signalAnnotationWindow },
	] = await Promise.all([
		import("@databuddy/ai/insights/evidence-reader"),
		import("@databuddy/ai/insights/fetch-context"),
		import("../../../apps/insights/src/detection"),
		import("../../../apps/insights/src/funnel-detection"),
		import("../../../apps/insights/src/investigation"),
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
	const base = defaultFunnelGoalDeps(params.site.id, params.asOf);
	const snapshotDeps = withDefinitionSnapshot(
		{
			...base,
			funnelConversion: (funnel, range, signal) =>
				base.funnelConversion(funnel, range, withAttemptSignal(signal)),
			goalConversion: (goal, range, signal) =>
				base.goalConversion(goal, range, withAttemptSignal(signal)),
		},
		siteFunnels,
		siteGoals
	);
	const fetchSnapshotProductMetrics = createSnapshotProductMetricsFetcher(
		snapshotDeps,
		siteFunnels,
		siteGoals
	);
	return {
		createEvidenceReader: (readerParams) => {
			const usesDefinitionSnapshot =
				readerParams.signal.entity.type === "goal" ||
				readerParams.signal.entity.type === "funnel";
			const readEvidence = createInsightEvidenceReader({
				...readerParams,
				...(usesDefinitionSnapshot
					? { fetchProductMetrics: fetchSnapshotProductMetrics }
					: {}),
			});
			return Promise.resolve((request, appContext, signal) => {
				assertShadowEvidenceUsesClickHouse(request);
				return readEvidence(request, appContext, withAttemptSignal(signal));
			});
		},
		createServiceAuth: () => Promise.resolve(undefined),
		detectDefinitionSignals: (detectParams, today, _deps, options) =>
			detectFunnelGoalSignals(detectParams, today, snapshotDeps, options),
		detectMetricSignals: (detectParams, queryFn, today, signal, diagnostics) =>
			detectSignals(
				detectParams,
				queryFn,
				today,
				withAttemptSignal(signal),
				diagnostics
			),
		fetchAnnotations: (_websiteId, signal, asOf, timezone) => {
			const window = signalAnnotationWindow(signal, timezone);
			return Promise.resolve(
				params.annotations
					.filter(
						(row) =>
							row.websiteId === params.site.id &&
							row.xValue >= window.from &&
							row.xValue <= window.to &&
							row.createdAt <= asOf &&
							row.updatedAt <= asOf &&
							(row.deletedAt === null || row.deletedAt > asOf)
					)
					.sort((a, b) => a.xValue.getTime() - b.xValue.getTime())
					.slice(0, 10)
					.map(
						(row): InvestigationAnnotation => ({
							date: row.xValue.toISOString().slice(0, 10),
							signalScoped: annotationMatchesSignal(row.text, signal),
							title: row.text,
						})
					)
			);
		},
		hasTrackedData: (websiteId, domain, from, to, timezone, signal) =>
			hasTrackedInsightData(
				websiteId,
				domain,
				from,
				to,
				timezone,
				withAttemptSignal(signal)
			),
		loadObservations: params.loadObservations,
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

function percentile(values: number[], quantile: number): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[
		Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))
	];
}

function wordCount(values: Array<string | null | undefined>): number {
	return values
		.filter((value): value is string => Boolean(value?.trim()))
		.join(" ")
		.trim()
		.split(WHITESPACE_PATTERN)
		.filter(Boolean).length;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function secretPattern(secret: string): RegExp {
	const escaped = escapeRegExp(secret);
	const prefix = SECRET_TOKEN_CHARACTER_PATTERN.test(secret[0] ?? "")
		? `(?<!${SECRET_TOKEN_BOUNDARY})`
		: "";
	const suffix = SECRET_TOKEN_CHARACTER_PATTERN.test(secret.at(-1) ?? "")
		? `(?!${SECRET_TOKEN_BOUNDARY})`
		: "";
	return new RegExp(`${prefix}${escaped}${suffix}`, "giu");
}

function sanitizeText(value: string, secrets: string[]): string {
	let output = value;
	for (const secret of [...new Set(secrets)]
		.filter((item) => item.length >= 2)
		.sort((a, b) => b.length - a.length)) {
		output = output.replace(secretPattern(secret), "[entity]");
	}
	return output
		.replace(/https?:\/\/[^\s"'“”]+/gi, "[url]")
		.replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[email]")
		.replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi, "[domain]")
		.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[entity]")
		.replace(/(["'“])[^"'”]{2,}(["'”])/g, "$1[entity]$2")
		.replace(/\/(?:[^\s.,;:!?()[\]{}]+\/)*[^\s.,;:!?()[\]{}]*/g, "[path]");
}

function sanitizeDefinitionFailure(value: string, secrets: string[]): string {
	const identifier = value.match(UNRESOLVED_IDENTIFIER_PATTERN);
	if (identifier) {
		return `Unknown identifier ${identifier[1]} in ${identifier[2]}.`;
	}
	return sanitizeText(value, secrets).slice(0, 300);
}

export function summarizeValidationErrors(
	errors: string[] | undefined,
	secrets: string[] = []
): string | null {
	if (!errors?.length) {
		return null;
	}
	return sanitizeText(errors.slice(0, 5).join("; "), secrets).slice(0, 300);
}

export function renderShadowInsight(
	insight: GeneratedInsight,
	isError: boolean,
	secrets: string[]
): NonNullable<ShadowCase["insight"]> {
	const evidence = (insight.evidence ?? []).map((item) =>
		sanitizeText(item.description, secrets)
	);
	const rendered = {
		description: sanitizeText(insight.description, secrets),
		evidence,
		impact: insight.impactSummary
			? sanitizeText(insight.impactSummary, secrets)
			: null,
		rootCause: insight.rootCause
			? sanitizeText(insight.rootCause, secrets)
			: null,
		suggestion: isError
			? "No patch target is established yet. Reproduce [error] and trace its first application frame."
			: sanitizeText(insight.suggestion, secrets),
		title: isError
			? "Investigate [error]"
			: sanitizeText(insight.title, secrets),
	};
	return {
		...rendered,
		visibleWords: wordCount([
			rendered.title,
			rendered.description,
			rendered.impact,
			rendered.rootCause,
			...rendered.evidence,
			rendered.suggestion,
		]),
	};
}

function safeQueryType(value: string): string {
	if (value.startsWith("detector:goal:")) {
		return "detector:goal";
	}
	if (value.startsWith("detector:funnel:")) {
		return "detector:funnel";
	}
	if (value.startsWith("detector:custom_event:")) {
		return "detector:custom_event";
	}
	return value;
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

function semanticProjection(artifact: WebsiteInvestigationArtifact): unknown {
	return {
		decision: artifact.decision,
		detectedSignals: artifact.detectedSignals.map((signal) => ({
			baseline: signal.baseline,
			current: signal.current,
			deltaPercent: signal.deltaPercent,
			kind: signal.kind,
			method: signal.method,
			metric: metricFamily(signal.metric),
			severity: signal.severity,
		})),
		insight: artifact.insight,
		signal: artifact.signal,
		status: artifact.status,
		validationErrors: artifact.validationErrors,
	};
}

function semanticDifferences(
	first: WebsiteInvestigationArtifact,
	second: WebsiteInvestigationArtifact
): string[] {
	const a = semanticProjection(first) as Record<string, unknown>;
	const b = semanticProjection(second) as Record<string, unknown>;
	return Object.keys(a).filter(
		(key) => JSON.stringify(a[key]) !== JSON.stringify(b[key])
	);
}

function projectCase(params: {
	artifact: WebsiteInvestigationArtifact;
	caseId: string;
	durationMs: number;
	offsetDays: number;
	repeatDifferences: string[];
	repeatDurationMs: number | null;
	repeatEqual: boolean | null;
	secrets: string[];
}): ShadowCase {
	const { artifact } = params;
	const recoveryCoverage = artifact.recoveryCoverage;
	const activeDefinitionKeys = new Set(
		recoveryCoverage?.activeDefinitionKeys ?? []
	);
	const eligibleDefinitionKeys = new Set(
		recoveryCoverage?.eligibleDefinitionKeys ?? []
	);
	const evidenceStatuses = countBy(
		artifact.evidence.map((item) => item.status)
	);
	const insight = artifact.insight;
	const isError = artifact.signal?.entity.type === "error";
	return {
		caseId: params.caseId,
		detectionComplete: artifact.detectionComplete,
		detectedSignalCount: artifact.detectedSignals.length,
		detectionIssues: {
			definitionFailureSummaries: [
				...new Set(recoveryCoverage?.definitionFailureMessages ?? []),
			].map((message) => sanitizeDefinitionFailure(message, params.secrets)),
			failedDefinitions: recoveryCoverage?.failedDefinitions ?? 0,
			failedMetricFamilies: recoveryCoverage?.failedMetricFamilies ?? 0,
			nonComparableDefinitions: [...activeDefinitionKeys].filter(
				(key) => !eligibleDefinitionKeys.has(key)
			).length,
			rotatedDefinitions: recoveryCoverage?.rotatedDefinitions ?? 0,
		},
		disposition: artifact.decision?.disposition ?? null,
		durationMs: params.durationMs,
		engineId: artifact.engineId,
		evidence: {
			failed: evidenceStatuses.failed ?? 0,
			queries: countBy(
				artifact.evidence.map((item) => safeQueryType(item.queryType))
			),
			statuses: evidenceStatuses,
			total: artifact.evidence.length,
			truncated: evidenceStatuses.truncated ?? 0,
		},
		errorType: artifact.validationErrors?.length ? "ValidationError" : null,
		errorSummary: summarizeValidationErrors(
			artifact.validationErrors,
			params.secrets
		),
		insight: insight
			? renderShadowInsight(insight, isError, params.secrets)
			: null,
		offsetDays: params.offsetDays,
		repeatDifferences: params.repeatDifferences,
		repeatDurationMs: params.repeatDurationMs,
		repeatEqual: params.repeatEqual,
		selectedSignal: artifact.signal
			? {
					changePercent: artifact.signal.changePercent,
					current: artifact.signal.metric.current,
					entityType: artifact.signal.entity.type,
					kind: artifact.signal.kind,
					method: artifact.signal.detection.method,
					metric: metricFamily(artifact.signal.metric.key),
					previous: artifact.signal.metric.previous ?? null,
					sentiment: artifact.signal.sentiment,
					severity: artifact.signal.severity,
				}
			: null,
		status: artifact.status,
	};
}

function failedCase(params: {
	caseId: string;
	durationMs: number;
	error: unknown;
	offsetDays: number;
	secrets: string[];
}): ShadowCase {
	return {
		caseId: params.caseId,
		detectionComplete: false,
		detectedSignalCount: 0,
		detectionIssues: {
			definitionFailureSummaries: [],
			failedDefinitions: 0,
			failedMetricFamilies: 0,
			nonComparableDefinitions: 0,
			rotatedDefinitions: 0,
		},
		disposition: null,
		durationMs: params.durationMs,
		engineId: "deterministic/v1",
		evidence: { failed: 0, queries: {}, statuses: {}, total: 0, truncated: 0 },
		errorSummary:
			params.error instanceof Error
				? sanitizeText(params.error.message, params.secrets).slice(0, 300)
				: "Unknown failure",
		errorType:
			params.error instanceof Error
				? params.error.constructor.name
				: typeof params.error,
		insight: null,
		offsetDays: params.offsetDays,
		repeatDifferences: [],
		repeatDurationMs: null,
		repeatEqual: null,
		selectedSignal: null,
		status: "error",
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
	const words = cases.flatMap((item) =>
		item.insight ? [item.insight.visibleWords] : []
	);
	const repeats = cases.filter((item) => item.repeatEqual !== null);
	const repeatDurations = cases.flatMap((item) =>
		item.repeatDurationMs === null ? [] : [item.repeatDurationMs]
	);
	return {
		cases: cases.length,
		cards: words.length,
		detectionFailures: cases.reduce(
			(sum, item) =>
				sum +
				item.detectionIssues.failedDefinitions +
				item.detectionIssues.failedMetricFamilies,
			0
		),
		detectionIncomplete: cases.filter((item) => !item.detectionComplete).length,
		nonComparableDefinitions: cases.reduce(
			(sum, item) => sum + item.detectionIssues.nonComparableDefinitions,
			0
		),
		rotatedDefinitions: cases.reduce(
			(sum, item) => sum + item.detectionIssues.rotatedDefinitions,
			0
		),
		dispositions: countBy(cases.map((item) => item.disposition)),
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
		evidenceFailed: cases.reduce((sum, item) => sum + item.evidence.failed, 0),
		evidenceTruncated: cases.reduce(
			(sum, item) => sum + item.evidence.truncated,
			0
		),
		metricFamilies: countBy(
			cases.map((item) => item.selectedSignal?.metric ?? null)
		),
		repeatAgreement:
			repeats.length === 0
				? null
				: repeats.filter((item) => item.repeatEqual).length / repeats.length,
		repeatDurationsMs:
			repeatDurations.length === 0
				? null
				: {
						p50: percentile(repeatDurations, 0.5),
						p95: percentile(repeatDurations, 0.95),
					},
		severity: countBy(
			cases.map((item) => item.selectedSignal?.severity ?? null)
		),
		status: countBy(cases.map((item) => item.status)),
		visibleWords: {
			max: Math.max(0, ...words),
			p50: percentile(words, 0.5),
			p95: percentile(words, 0.95),
		},
	};
}

export function evaluateShadowGates(
	metrics: ShadowGateMetrics,
	repeat: boolean
): ShadowGateFailure[] {
	const checks: ShadowGateFailure[] = [
		{
			actual: metrics.status.error ?? 0,
			comparator: "eq",
			gate: "error_cases",
			required: 0,
		},
		{
			actual: metrics.status.invalid_output ?? 0,
			comparator: "eq",
			gate: "invalid_output_cases",
			required: 0,
		},
		{
			actual: metrics.detectionFailures,
			comparator: "eq",
			gate: "detection_failed_probes",
			required: 0,
		},
		{
			actual: metrics.evidenceFailed,
			comparator: "eq",
			gate: "evidence_failed",
			required: 0,
		},
		{
			actual: metrics.evidenceTruncated,
			comparator: "eq",
			gate: "evidence_truncated",
			required: 0,
		},
		{
			actual: metrics.visibleWords.max,
			comparator: "lte",
			gate: "visible_words_max",
			required: 100,
		},
	];
	if (repeat) {
		checks.push({
			actual: metrics.repeatAgreement,
			comparator: "eq",
			gate: "repeat_agreement",
			required: 1,
		});
	}

	return checks.filter((check) => {
		if (check.actual === null) {
			return true;
		}
		return check.comparator === "eq"
			? check.actual !== check.required
			: check.actual > check.required;
	});
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
	const [
		{ clickHouse },
		{ shutdownPostgres },
		{ shutdownRedis },
		{ closeInsightsQueue },
	] = await Promise.all([
		import("@databuddy/db/clickhouse"),
		import("@databuddy/db"),
		import("../../../packages/redis/redis"),
		import("../../../packages/redis/insights-queue"),
	]);
	await Promise.allSettled([
		clickHouse.close(),
		shutdownPostgres(),
		shutdownRedis(),
		closeInsightsQueue(),
	]);
}

export async function runProductionShadow(
	options: CliOptions
): Promise<ShadowReport> {
	disableExternalEffects();
	const loadProductionMetadata = createReadOnlyMetadataLoader();
	configureIsolatedShadowRedis();
	configureReadOnlyClickHouse();
	const restoreConsole = silenceLibraryConsole();
	try {
		const ranked = await loadCohort(options.minEvents, options.limit);
		const metadata = await loadProductionMetadata(ranked);
		const [{ investigateWebsiteWithSources }, { nextRecheckAt }] =
			await Promise.all([
				import("../../../apps/insights/src/generation"),
				import("../../../apps/insights/src/observations"),
			]);
		const offsets = chronologicalOffsets(options.offsets);
		const evaluationDate = new Date();
		const siteCases = await mapConcurrent(
			metadata.sites,
			options.concurrency,
			async (site, siteIndex) => {
				const cases: ShadowCase[] = [];
				const simulated = new Map<string, LatestInsightObservation>();
				const persisted = metadata.observations.filter(
					(observation) =>
						observation.organizationId === site.organizationId &&
						observation.websiteId === site.id
				);
				const siteDefinitions = [
					...metadata.funnels.filter((row) => row.websiteId === site.id),
					...metadata.goals.filter((row) => row.websiteId === site.id),
				];
				const siteSecrets = [
					site.id,
					site.domain,
					site.organizationId,
					...siteDefinitions.flatMap((definition) => [
						definition.id,
						definition.name,
					]),
				];

				for (const offsetDays of offsets) {
					const caseId = `site-${String(siteIndex + 1).padStart(2, "0")}@d-${offsetDays}`;
					const asOfString = dateAtOffset(offsetDays, evaluationDate);
					const asOf = new Date(`${asOfString}T23:59:59.999Z`);
					const preAppendSimulated = new Map(simulated);
					const loadObservations: InvestigationSources["loadObservations"] = (
						params
					) =>
						Promise.resolve(
							observationsAt({
								...params,
								persisted,
								simulated: preAppendSimulated,
							})
						);
					const input = {
						asOf: asOfString,
						domain: site.domain,
						organizationId: site.organizationId,
						timezone: site.timezone,
						websiteId: site.id,
					};
					const investigate = () =>
						runCancellableAttempt(async (attemptSignal) => {
							const sources = await createSources({
								annotations: metadata.annotations,
								asOf,
								attemptSignal,
								funnels: metadata.funnels,
								goals: metadata.goals,
								loadObservations,
								site,
							});
							return investigateWebsiteWithSources(input, sources);
						});

					const firstStartedAt = Date.now();
					let artifact: WebsiteInvestigationArtifact;
					try {
						artifact = await investigate();
					} catch (error) {
						cases.push(
							failedCase({
								caseId,
								durationMs: Date.now() - firstStartedAt,
								error,
								offsetDays,
								secrets: siteSecrets,
							})
						);
						continue;
					}
					const durationMs = Date.now() - firstStartedAt;

					try {
						let repeatDifferences: string[] = [];
						let repeatDurationMs: number | null = null;
						let repeatEqual: boolean | null = null;
						if (options.repeat) {
							const repeatStartedAt = Date.now();
							try {
								const repeated = await investigate();
								repeatDifferences = semanticDifferences(artifact, repeated);
								repeatEqual = repeatDifferences.length === 0;
							} catch (error) {
								const type =
									error instanceof Error
										? error.constructor.name
										: typeof error;
								repeatDifferences = [`repeat_failed:${type}`];
								repeatEqual = false;
							} finally {
								repeatDurationMs = Date.now() - repeatStartedAt;
							}
						}

						const { decision, signal } = artifact;
						if (decision && signal) {
							const observationAsOf = new Date(artifact.asOf);
							simulated.set(signal.signalKey, {
								asOf: observationAsOf,
								decision,
								evidence: artifact.evidence.filter(
									(evidence) => evidence.signalKey === signal.signalKey
								),
								recheckAt: nextRecheckAt(
									observationAsOf,
									decision.disposition,
									signal
								),
								signal,
							});
						}

						cases.push(
							projectCase({
								artifact,
								caseId,
								durationMs,
								offsetDays,
								repeatDifferences,
								repeatDurationMs,
								repeatEqual,
								secrets: [
									...siteSecrets,
									artifact.signal?.entity.id ?? "",
									artifact.signal?.entity.label ?? "",
									artifact.signal?.expectation?.eventName ?? "",
									artifact.signal?.expectation?.stepName ?? "",
								],
							})
						);
					} catch (error) {
						cases.push(
							failedCase({
								caseId,
								durationMs,
								error,
								offsetDays,
								secrets: siteSecrets,
							})
						);
					}
				}
				return cases;
			}
		);
		const cases = siteCases.flat();
		const aggregate = aggregateCases(cases);
		return {
			aggregate,
			cases,
			gateFailures: evaluateShadowGates(aggregate, options.repeat),
			meta: {
				concurrency: options.concurrency,
				engine: "current deterministic production path",
				generatedAt: new Date().toISOString(),
				historicalLimitations: HISTORICAL_LIMITATIONS,
				history: "persisted-seed/in-memory-replay/current-records",
				isolation: {
					clickhouse: "read-only-user/verified",
					postgres: "explicit-read-only-transaction/process-quarantined",
					productEvidence: "definition-snapshot/direct-clickhouse",
					redis: "loopback-db-15",
				},
				minEvents: options.minEvents,
				offsets,
				productionWrites: false,
				repeat: options.repeat,
				sites: metadata.sites.length,
			},
		};
	} finally {
		restoreConsole();
	}
}

if (import.meta.main) {
	try {
		const options = parseOptions(process.argv.slice(2));
		const result = await runProductionShadow(options);
		if (options.output) {
			const output = assertOutsideRepository(options.output);
			await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
		}
		process.stdout.write(
			`${JSON.stringify(
				{
					aggregate: result.aggregate,
					gateFailures: result.gateFailures,
					meta: result.meta,
				},
				null,
				2
			)}\n`
		);
		if (result.gateFailures.length > 0) {
			process.exitCode = 1;
		}
	} catch (error) {
		const type = error instanceof Error ? error.constructor.name : typeof error;
		process.stderr.write(`Production shadow evaluation failed (${type}).\n`);
		process.exitCode = 1;
	} finally {
		await closeShadowConnections();
	}
}
