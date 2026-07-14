import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import type {
	InvestigationSources,
	WebsiteInvestigationArtifact,
} from "../../../apps/insights/src/generation";
import type {
	FunnelDef,
	GoalDef,
} from "../../../apps/insights/src/funnel-detection";
import type { InvestigationAnnotation } from "../../../apps/insights/src/investigation";

const REQUIRED_CONFIRMATION = "--confirm-read-only-production";
const DEFAULT_OFFSETS = [60, 30, 7, 0];
const DEFAULT_MIN_EVENTS = 25_000;
const DEFAULT_CONCURRENCY = 2;
const STATEMENT_TIMEOUT_MS = 60_000;
const CASE_ATTEMPT_TIMEOUT_MS = 150_000;
const WHITESPACE_PATTERN = /\s+/;

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

interface ShadowCase {
	caseId: string;
	detectedSignalCount: number;
	detectionComplete: boolean;
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

interface ShadowReport {
	aggregate: {
		cases: number;
		cards: number;
		detectionIncomplete: number;
		dispositions: Record<string, number>;
		durationsMs: { p50: number; p95: number };
		evidenceFailed: number;
		evidenceTruncated: number;
		metricFamilies: Record<string, number>;
		repeatAgreement: number | null;
		severity: Record<string, number>;
		status: Record<string, number>;
		visibleWords: { max: number; p50: number; p95: number };
	};
	cases: ShadowCase[];
	meta: {
		concurrency: number;
		engine: "current deterministic production path";
		generatedAt: string;
		history: "disabled";
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

function loadMetadata(ranked: Array<{ events: number; id: string }>): Promise<{
	annotations: AnnotationRow[];
	funnels: FunnelRow[];
	goals: GoalRow[];
	sites: RankedWebsite[];
}> {
	if (ranked.length === 0) {
		return Promise.resolve({
			annotations: [],
			funnels: [],
			goals: [],
			sites: [],
		});
	}
	return inReadOnlyTransaction(async (client) => {
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

function dateAtOffset(offsetDays: number): string {
	const now = new Date();
	const date = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
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
	return {
		createEvidenceReader: (readerParams) => {
			const readEvidence = createInsightEvidenceReader(readerParams);
			return Promise.resolve((request, appContext, signal) =>
				readEvidence(request, appContext, withAttemptSignal(signal))
			);
		},
		createServiceAuth: () => Promise.resolve(undefined),
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
		loadObservations: () => Promise.resolve(new Map()),
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

function sanitizeText(value: string, secrets: string[]): string {
	let output = value;
	for (const secret of [...new Set(secrets)]
		.filter((item) => item.length >= 2)
		.sort((a, b) => b.length - a.length)) {
		output = output.replace(new RegExp(escapeRegExp(secret), "gi"), "[entity]");
	}
	return output
		.replace(/https?:\/\/[^\s"'“”]+/gi, "[url]")
		.replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[email]")
		.replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi, "[domain]")
		.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[entity]")
		.replace(/(["'“])[^"'”]{2,}(["'”])/g, "$1[entity]$2")
		.replace(/\/(?:[^\s.,;:!?()[\]{}]+\/)*[^\s.,;:!?()[\]{}]*/g, "[path]");
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
	repeatEqual: boolean | null;
	secrets: string[];
}): ShadowCase {
	const { artifact } = params;
	const evidenceStatuses = countBy(
		artifact.evidence.map((item) => item.status)
	);
	const insight = artifact.insight;
	const isError = artifact.signal?.entity.type === "error";
	const visibleEvidence =
		insight?.evidence?.map((item) => item.description) ?? [];
	return {
		caseId: params.caseId,
		detectionComplete: artifact.detectionComplete,
		detectedSignalCount: artifact.detectedSignals.length,
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
		errorType: null,
		errorSummary: null,
		insight: insight
			? {
					description: sanitizeText(insight.description, params.secrets),
					evidence: visibleEvidence.map((value) =>
						sanitizeText(value, params.secrets)
					),
					impact: insight.impactSummary
						? sanitizeText(insight.impactSummary, params.secrets)
						: null,
					rootCause: insight.rootCause
						? sanitizeText(insight.rootCause, params.secrets)
						: null,
					suggestion: isError
						? "No patch target is established yet. Reproduce [error] and trace its first application frame."
						: sanitizeText(insight.suggestion, params.secrets),
					title: isError
						? "Investigate [error]"
						: sanitizeText(insight.title, params.secrets),
					visibleWords: wordCount([
						insight.title,
						insight.description,
						insight.impactSummary,
						insight.rootCause,
						...visibleEvidence,
						insight.suggestion,
					]),
				}
			: null,
		offsetDays: params.offsetDays,
		repeatDifferences: params.repeatDifferences,
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
	return {
		cases: cases.length,
		cards: words.length,
		detectionIncomplete: cases.filter((item) => !item.detectionComplete).length,
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
	const restoreConsole = silenceLibraryConsole();
	try {
		const ranked = await loadCohort(options.minEvents, options.limit);
		const metadata = await loadMetadata(ranked);
		const jobs = metadata.sites.flatMap((site, siteIndex) =>
			options.offsets.map((offsetDays) => ({ offsetDays, site, siteIndex }))
		);
		const { investigateWebsiteWithSources } = await import(
			"../../../apps/insights/src/generation"
		);
		const cases = await mapConcurrent(
			jobs,
			options.concurrency,
			async ({ offsetDays, site, siteIndex }) => {
				const caseId = `site-${String(siteIndex + 1).padStart(2, "0")}@d-${offsetDays}`;
				const asOfString = dateAtOffset(offsetDays);
				const asOf = new Date(`${asOfString}T23:59:59.999Z`);
				const startedAt = Date.now();
				try {
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
								site,
							});
							return investigateWebsiteWithSources(input, sources);
						});
					const artifact = await investigate();
					let repeatEqual: boolean | null = null;
					let repeatDifferences: string[] = [];
					if (options.repeat) {
						const repeated = await investigate();
						repeatDifferences = semanticDifferences(artifact, repeated);
						repeatEqual = repeatDifferences.length === 0;
					}
					const secrets = [
						site.id,
						site.domain,
						site.organizationId,
						artifact.signal?.entity.id ?? "",
						artifact.signal?.entity.label ?? "",
						artifact.signal?.expectation?.eventName ?? "",
						artifact.signal?.expectation?.stepName ?? "",
					];
					return projectCase({
						artifact,
						caseId,
						durationMs: Date.now() - startedAt,
						offsetDays,
						repeatDifferences,
						repeatEqual,
						secrets,
					});
				} catch (error) {
					const siteDefinitions = [
						...metadata.funnels.filter((row) => row.websiteId === site.id),
						...metadata.goals.filter((row) => row.websiteId === site.id),
					];
					return failedCase({
						caseId,
						durationMs: Date.now() - startedAt,
						error,
						offsetDays,
						secrets: [
							site.id,
							site.domain,
							site.organizationId,
							...siteDefinitions.flatMap((definition) => [
								definition.id,
								definition.name,
							]),
						],
					});
				}
			}
		);
		return {
			aggregate: aggregateCases(cases),
			cases,
			meta: {
				concurrency: options.concurrency,
				engine: "current deterministic production path",
				generatedAt: new Date().toISOString(),
				history: "disabled",
				minEvents: options.minEvents,
				offsets: options.offsets,
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
			`${JSON.stringify({ aggregate: result.aggregate, meta: result.meta }, null, 2)}\n`
		);
		if ((result.aggregate.status.error ?? 0) > 0) {
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
