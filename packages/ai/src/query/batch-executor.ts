import { chQuery } from "@databuddy/db/clickhouse";
import { captureWarning, mergeWideEvent } from "../lib/tracing";
import { QueryBuilders, suggestQueryTypes } from "./builders";
import {
	getClickHouseQuerySettings,
	SimpleQueryBuilder,
} from "./simple-builder";
import { resolveRequestTraitFilters } from "./trait-filters";
import type { QueryRequest, SimpleQueryConfig } from "./types";
import { applyPlugins } from "./utils";

type BatchRequest = QueryRequest & { type: string };
interface BatchResult {
	data: Record<string, unknown>[];
	error?: string;
	type: string;
}
interface BatchOptions {
	abortSignal?: AbortSignal;
	timezone?: string;
	websiteDomain?: string | null;
}

const BATCH_GROUP_CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	if (items.length <= concurrency) {
		return Promise.all(items.map(fn));
	}
	const results: R[] = new Array(items.length);
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.min(concurrency, items.length) },
		async () => {
			while (cursor < items.length) {
				const i = cursor++;
				const item = items[i] as T;
				results[i] = await fn(item);
			}
		}
	);
	await Promise.all(workers);
	return results;
}

const TRANSIENT_CLICKHOUSE_ERROR_CODES = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"EPIPE",
	"ETIMEDOUT",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_SOCKET",
]);
const TRANSIENT_CLICKHOUSE_ERROR_MESSAGES = [
	"socket connection was closed",
	"socket closed unexpectedly",
	"connection refused",
	"connection reset",
	"econnrefused",
	"econnreset",
	"etimedout",
	"network error",
];
const MAX_ERROR_CAUSE_DEPTH = 5;

function getErrorField(
	error: unknown,
	field: "cause" | "code" | "message" | "name"
) {
	if (typeof error !== "object" || error === null || !(field in error)) {
		return;
	}
	return (error as Record<string, unknown>)[field];
}

function hasAbortError(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH && current; depth++) {
		if (
			getErrorField(current, "name") === "AbortError" ||
			getErrorField(current, "code") === "ABORT_ERR"
		) {
			return true;
		}
		current = getErrorField(current, "cause");
	}
	return false;
}

function isTransientClickHouseError(error: unknown): boolean {
	if (hasAbortError(error)) {
		return false;
	}

	let current: unknown = error;
	for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH && current; depth++) {
		const code = getErrorField(current, "code");
		if (
			typeof code === "string" &&
			TRANSIENT_CLICKHOUSE_ERROR_CODES.has(code.toUpperCase())
		) {
			return true;
		}

		const message = getErrorField(current, "message");
		if (
			typeof message === "string" &&
			TRANSIENT_CLICKHOUSE_ERROR_MESSAGES.some((pattern) =>
				message.toLowerCase().includes(pattern)
			)
		) {
			return true;
		}

		current = getErrorField(current, "cause");
	}
	return false;
}

const ALIAS_REGEX = /\s+as\s+([\w]+)\s*$/i;
const TAIL_SPLIT_REGEX = /[\s.]/;
const QUOTE_STRIP_REGEX = /[`"']/g;
const SELECT_KEYWORD = "SELECT";
const FROM_KEYWORD = "FROM";
const WORD_BOUNDARY_BEFORE = /[\s(,]/;
const WORD_BOUNDARY_AFTER = /\s/;

/**
 * Replace string literals, quoted identifiers, and SQL comments with spaces of
 * the same length so byte offsets line up with the original. The result is
 * used only for structural scanning (keyword/paren/comma detection); columns
 * are sliced from the original SQL so identifiers stay intact.
 */
function maskSqlNoise(sql: string): string {
	const out = new Array<string>(sql.length);
	let i = 0;
	while (i < sql.length) {
		const ch = sql[i];
		const next = sql[i + 1];
		if (ch === "-" && next === "-") {
			while (i < sql.length && sql[i] !== "\n") {
				out[i++] = " ";
			}
			continue;
		}
		if (ch === "/" && next === "*") {
			out[i++] = " ";
			out[i++] = " ";
			while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
				out[i++] = " ";
			}
			if (i < sql.length) {
				out[i++] = " ";
				out[i++] = " ";
			}
			continue;
		}
		if (ch === "'" || ch === '"' || ch === "`") {
			const quote = ch;
			out[i++] = " ";
			while (i < sql.length) {
				if (sql[i] === "\\" && i + 1 < sql.length) {
					out[i++] = " ";
					out[i++] = " ";
					continue;
				}
				if (sql[i] === quote && sql[i + 1] === quote) {
					out[i++] = " ";
					out[i++] = " ";
					continue;
				}
				if (sql[i] === quote) {
					out[i++] = " ";
					break;
				}
				out[i++] = " ";
			}
			continue;
		}
		out[i] = ch ?? "";
		i++;
	}
	return out.join("");
}

function isKeywordAt(sql: string, idx: number, keyword: string): boolean {
	if (sql.slice(idx, idx + keyword.length) !== keyword) {
		return false;
	}
	const before = idx === 0 ? " " : sql[idx - 1];
	const after = sql[idx + keyword.length] ?? " ";
	return (
		before !== undefined &&
		WORD_BOUNDARY_BEFORE.test(before) &&
		WORD_BOUNDARY_AFTER.test(after)
	);
}

function findOuterProjectionRange(sql: string): [number, number] | null {
	const masked = maskSqlNoise(sql);
	let depth = 0;
	let outerSelect = -1;
	for (let i = 0; i < masked.length; i++) {
		const ch = masked[i];
		if (ch === "(") {
			depth++;
			continue;
		}
		if (ch === ")") {
			depth--;
			continue;
		}
		if (depth !== 0) {
			continue;
		}
		if (isKeywordAt(masked, i, SELECT_KEYWORD)) {
			outerSelect = i;
			i += SELECT_KEYWORD.length - 1;
			continue;
		}
		if (outerSelect !== -1 && isKeywordAt(masked, i, FROM_KEYWORD)) {
			return [outerSelect + SELECT_KEYWORD.length, i];
		}
	}
	return null;
}

export function extractOuterSelectColumns(sql: string): string[] {
	const range = findOuterProjectionRange(sql);
	if (!range) {
		return [];
	}
	const masked = maskSqlNoise(sql);
	const parts: string[] = [];
	let depth = 0;
	let start = range[0];
	for (let i = range[0]; i < range[1]; i++) {
		const ch = masked[i];
		if (ch === "(") {
			depth++;
		} else if (ch === ")") {
			depth--;
		} else if (ch === "," && depth === 0) {
			parts.push(masked.slice(start, i).trim());
			start = i + 1;
		}
	}
	const tail = masked.slice(start, range[1]).trim();
	if (tail) {
		parts.push(tail);
	}
	return parts.map((part) => {
		const aliasMatch = part.match(ALIAS_REGEX);
		if (aliasMatch?.[1]) {
			return aliasMatch[1];
		}
		const lastToken = part.split(TAIL_SPLIT_REGEX).pop() ?? part;
		return lastToken.replace(QUOTE_STRIP_REGEX, "");
	});
}

const signatureCache = new Map<string, string | null>();

function getSchemaSignature(
	type: string,
	config: SimpleQueryConfig
): string | null {
	if (signatureCache.has(type)) {
		return signatureCache.get(type) ?? null;
	}

	let signature: string | null = null;
	try {
		const builder = new SimpleQueryBuilder(config, {
			projectId: "__signature_probe__",
			type,
			from: "2026-01-01",
			to: "2026-01-02",
			timeUnit: "day",
			filters: (config.requiredFilters ?? []).map((field) => ({
				field,
				op: "eq",
				value: "__probe__",
			})),
		});
		const columns = extractOuterSelectColumns(builder.compile().sql);
		signature = columns.length ? columns.join(",") : null;
	} catch {
		signature = null;
	}

	signatureCache.set(type, signature);
	return signature;
}

function unknownTypeError(type: string): string {
	const suggestions = suggestQueryTypes(type);
	return suggestions.length
		? `Unknown query type: ${type}. Did you mean: ${suggestions.join(", ")}?`
		: `Unknown query type: ${type}`;
}

async function runSingle(
	req: BatchRequest,
	opts?: BatchOptions
): Promise<BatchResult> {
	const config = QueryBuilders[req.type];
	if (!config) {
		return {
			type: req.type,
			data: [],
			error: unknownTypeError(req.type),
		};
	}

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const builder = new SimpleQueryBuilder(
				config,
				{ ...req, timezone: opts?.timezone ?? req.timezone },
				opts?.websiteDomain
			);
			const data = await builder.execute(opts?.abortSignal);

			mergeWideEvent({
				query_type: req.type,
				query_from: req.from,
				query_to: req.to,
				query_rows: data.length,
			});

			return { type: req.type, data };
		} catch (e) {
			if (attempt === 0 && isTransientClickHouseError(e)) {
				continue;
			}

			const error = e instanceof Error ? e.message : "Query failed";
			mergeWideEvent({ query_error: error });
			return { type: req.type, data: [], error };
		}
	}

	return { type: req.type, data: [], error: "Query failed" };
}

function groupBySchema(
	items: { index: number; req: BatchRequest }[]
): Map<string, { index: number; req: BatchRequest }[]> {
	const groups = new Map<string, { index: number; req: BatchRequest }[]>();

	for (const { index, req } of items) {
		const config = QueryBuilders[req.type];
		if (!config) {
			continue;
		}

		const sig = getSchemaSignature(req.type, config) || `__solo_${req.type}`;
		const list = groups.get(sig) || [];
		list.push({ index, req });
		groups.set(sig, list);
	}

	return groups;
}

export function buildUnionQuery(
	items: { index: number; req: BatchRequest }[],
	opts?: BatchOptions
) {
	const queries: string[] = [];
	const params: Record<string, unknown> = {};
	const indices: number[] = [];
	const failures: { index: number; type: string; error: string }[] = [];

	for (const { index, req } of items) {
		const config = QueryBuilders[req.type];
		if (!config) {
			failures.push({
				index,
				type: req.type,
				error: unknownTypeError(req.type),
			});
			continue;
		}

		try {
			const builder = new SimpleQueryBuilder(
				config,
				{ ...req, timezone: opts?.timezone ?? req.timezone },
				opts?.websiteDomain
			);

			let { sql, params: queryParams } = builder.compile();

			for (const [key, value] of Object.entries(queryParams)) {
				const prefixedKey = `q${index}_${key}`;
				params[prefixedKey] = value;
				sql = sql.replaceAll(`{${key}:`, `{${prefixedKey}:`);
			}

			indices.push(index);
			queries.push(`SELECT ${index} as __query_idx, * FROM (${sql})`);
		} catch (error) {
			failures.push({
				index,
				type: req.type,
				error: error instanceof Error ? error.message : "Query failed",
			});
		}
	}

	return { sql: queries.join("\nUNION ALL\n"), params, indices, failures };
}

function splitResults(
	rows: Array<Record<string, unknown> & { __query_idx: number }>,
	indices: number[]
): Map<number, Record<string, unknown>[]> {
	const byIndex = new Map<number, Record<string, unknown>[]>(
		indices.map((i) => [i, []])
	);

	for (const { __query_idx, ...rest } of rows) {
		byIndex.get(__query_idx)?.push(rest);
	}

	return byIndex;
}

export async function executeBatch(
	requests: BatchRequest[],
	opts?: BatchOptions
): Promise<BatchResult[]> {
	if (requests.length === 0) {
		return [];
	}

	mergeWideEvent({
		batch_size: requests.length,
		batch_types: requests.map((r) => r.type).join(","),
	});

	const traitFailures = new Map<number, BatchResult>();
	const resolvedRequests = await Promise.all(
		requests.map(async (req, index) => {
			try {
				return await resolveRequestTraitFilters(req);
			} catch (e) {
				const error = e instanceof Error ? e.message : "Trait filter failed";
				mergeWideEvent({ query_error: error });
				traitFailures.set(index, { type: req.type, data: [], error });
				return req;
			}
		})
	);

	if (
		traitFailures.size === 0 &&
		resolvedRequests.length === 1 &&
		resolvedRequests[0]
	) {
		return [await runSingle(resolvedRequests[0], opts)];
	}

	const successfulRequests = resolvedRequests.flatMap((req, index) =>
		traitFailures.has(index) ? [] : [{ index, req }]
	);
	const groups = groupBySchema(successfulRequests);
	const results: BatchResult[] = Array.from({ length: requests.length });
	for (const [index, failure] of traitFailures) {
		results[index] = failure;
	}

	async function runGroup(
		groupItems: { index: number; req: BatchRequest }[]
	): Promise<{ unionCount: number; singleCount: number }> {
		if (groupItems.length === 0) {
			return { unionCount: 0, singleCount: 0 };
		}

		if (groupItems.length === 1 && groupItems[0]) {
			const { index, req } = groupItems[0];
			results[index] = await runSingle(req, opts);
			return { unionCount: 0, singleCount: 1 };
		}

		const { sql, params, indices, failures } = buildUnionQuery(
			groupItems,
			opts
		);
		for (const failure of failures) {
			mergeWideEvent({ query_error: failure.error });
			results[failure.index] = {
				type: failure.type,
				data: [],
				error: failure.error,
			};
		}

		const compiledIndices = new Set(indices);
		const compiledItems = groupItems.filter(({ index }) =>
			compiledIndices.has(index)
		);
		if (compiledItems.length === 0) {
			return { unionCount: 0, singleCount: 0 };
		}
		if (compiledItems.length === 1 && compiledItems[0]) {
			const { index, req } = compiledItems[0];
			results[index] = await runSingle(req, opts);
			return { unionCount: 0, singleCount: 1 };
		}

		try {
			const groupNoCache = compiledItems.some(
				({ req }) => QueryBuilders[req.type]?.noCache
			);
			const rawRows = await chQuery(sql, params, {
				abort_signal: opts?.abortSignal,
				clickhouse_settings: getClickHouseQuerySettings(groupNoCache),
			});

			mergeWideEvent({
				batch_union_query_count: indices.length,
				batch_union_rows: rawRows.length,
			});

			const split = splitResults(
				rawRows as Array<Record<string, unknown> & { __query_idx: number }>,
				indices
			);

			for (const { index, req } of compiledItems) {
				const config = QueryBuilders[req.type];
				const raw = split.get(index) || [];
				results[index] = {
					type: req.type,
					data: config ? applyPlugins(raw, config, opts?.websiteDomain) : raw,
				};
			}
			return { unionCount: 1, singleCount: 0 };
		} catch (error) {
			const batchUnionError =
				error instanceof Error ? error.message : "Union query failed";
			captureWarning(error, {
				operation: "batch_union",
				batch_types: compiledItems.map((g) => g.req.type).join(","),
				batch_size: compiledItems.length,
				batch_union_fallback: 1,
				batch_union_error: batchUnionError,
			});
			mergeWideEvent({
				batch_union_fallback: 1,
				batch_union_error: batchUnionError,
			});
			for (const { index, req } of compiledItems) {
				results[index] = await runSingle(req, opts);
			}
			return { unionCount: 0, singleCount: compiledItems.length };
		}
	}

	const groupResults = await mapWithConcurrency(
		Array.from(groups.values()),
		BATCH_GROUP_CONCURRENCY,
		runGroup
	);
	const unionCount = groupResults.reduce((s, r) => s + r.unionCount, 0);
	const singleCount = groupResults.reduce((s, r) => s + r.singleCount, 0);

	mergeWideEvent({
		batch_union_groups: unionCount,
		batch_single_queries: singleCount,
	});

	return results.map(
		(r, i) => r || { type: requests[i]?.type || "unknown", data: [] }
	);
}

export function areQueriesCompatible(type1: string, type2: string): boolean {
	const [c1, c2] = [QueryBuilders[type1], QueryBuilders[type2]];
	if (!(c1 && c2)) {
		return false;
	}
	const [s1, s2] = [
		getSchemaSignature(type1, c1),
		getSchemaSignature(type2, c2),
	];
	return Boolean(s1 && s2 && s1 === s2);
}

export function getCompatibleQueries(type: string): string[] {
	const config = QueryBuilders[type];
	const sig = config ? getSchemaSignature(type, config) : null;
	if (!sig) {
		return [];
	}

	return Object.entries(QueryBuilders)
		.filter(([t, c]) => t !== type && getSchemaSignature(t, c) === sig)
		.map(([t]) => t);
}

export function getSchemaGroups(): Map<string, string[]> {
	const groups = new Map<string, string[]>();

	for (const [type, config] of Object.entries(QueryBuilders)) {
		const sig = getSchemaSignature(type, config);
		if (!sig) {
			continue;
		}
		const list = groups.get(sig) || [];
		list.push(type);
		groups.set(sig, list);
	}

	return groups;
}
