import { createHash } from "node:crypto";
import type {
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { tool } from "ai";
import { z } from "zod";
import {
	fetchOpsMetrics,
	OPS_INSIGHT_QUERY_TYPES,
} from "../insights/ops-context";
import {
	fetchProductMetrics,
	type ProductInsightTarget,
} from "../insights/product-context";
import { getAppContext } from "./utils";
import { executeQuery } from "../../query";
import { QueryBuilders } from "../../query/builders";
import type { QueryRequest } from "../../query/types";

const MAX_EVIDENCE_SUMMARY_CHARS = 500;
const MAX_QUERIES = 8;

function isValidQueryType(type: string): boolean {
	return type in QueryBuilders;
}

type QueryEvidenceSource = "business" | "ops" | "product" | "web";

type QueryEvidencePeriod = "current" | "previous";

export interface QueryEvidence {
	data: unknown;
	entity?: InvestigationSignal["entity"];
	error?: string;
	evidenceId: string;
	period: QueryEvidencePeriod;
	queryType: string;
	range: { from: string; to: string };
	rowCount: number;
	signalKey: string;
	source: QueryEvidenceSource;
	status: "empty" | "failed" | "ok";
}

function evidenceKind(queryType: string): InvestigationEvidence["kind"] {
	if (queryType.startsWith("revenue")) {
		return "impact";
	}
	if (
		["goals_summary", "funnels_summary", "custom_events_summary"].includes(
			queryType
		)
	) {
		return "definition";
	}
	if (
		queryType.includes("error") ||
		queryType.includes("uptime") ||
		queryType.includes("vital")
	) {
		return "data_health";
	}
	if (queryType.includes("anomaly") || queryType.includes("flag")) {
		return "related_change";
	}
	if (queryType === "summary_metrics" || queryType.includes("trend")) {
		return "trend";
	}
	return "breakdown";
}

function sourceForWebQuery(queryType: string): QueryEvidenceSource {
	if (queryType.startsWith("revenue")) {
		return "business";
	}
	if (
		queryType.includes("error") ||
		queryType.includes("uptime") ||
		queryType.includes("vital")
	) {
		return "ops";
	}
	return "web";
}

function evidenceSummary(evidence: QueryEvidence): {
	summary: string;
	truncated: boolean;
} {
	if (evidence.status === "empty") {
		return {
			summary: `${evidence.queryType} returned no rows.`,
			truncated: false,
		};
	}
	const prefix = `${evidence.queryType} returned ${evidence.rowCount} row${evidence.rowCount === 1 ? "" : "s"}: `;
	const summary = `${prefix}${canonicalJson(evidence.data)}`;
	return summary.length <= MAX_EVIDENCE_SUMMARY_CHARS
		? { summary, truncated: false }
		: {
				summary: `${summary.slice(0, MAX_EVIDENCE_SUMMARY_CHARS - 1).trimEnd()}…`,
				truncated: true,
			};
}

export function toInvestigationEvidence(
	evidence: QueryEvidence
): InvestigationEvidence {
	const base = {
		evidenceId: evidence.evidenceId,
		signalKey: evidence.signalKey,
		kind: evidenceKind(evidence.queryType),
		source: evidence.source,
		queryType: evidence.queryType,
		...(evidence.entity ? { entity: evidence.entity } : {}),
		period: evidence.period,
		range: evidence.range,
		rowCount: evidence.rowCount,
	};
	if (evidence.status === "failed") {
		return {
			...base,
			status: "failed",
			rowCount: 0,
			error: evidence.error ?? "Query failed",
		};
	}
	const summary = evidenceSummary(evidence);
	if (summary.truncated) {
		return {
			...base,
			status: "truncated",
			summary: summary.summary,
			truncationReason: "The query result exceeded the evidence summary limit.",
		};
	}
	if (evidence.status === "empty") {
		return {
			...base,
			status: "empty",
			rowCount: 0,
			summary: summary.summary,
		};
	}
	return {
		...base,
		status: "ok",
		summary: summary.summary,
	};
}

type QueryEvidenceBase = Pick<
	QueryEvidence,
	| "entity"
	| "evidenceId"
	| "period"
	| "queryType"
	| "range"
	| "signalKey"
	| "source"
>;

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

function queryEvidenceBase(input: {
	entity?: InvestigationSignal["entity"];
	period: QueryEvidencePeriod;
	query: unknown;
	queryType: string;
	range: { from: string; to: string };
	signalKey: string;
	source: QueryEvidenceSource;
}): QueryEvidenceBase {
	const digest = createHash("sha256")
		.update(canonicalJson(input))
		.digest("hex")
		.slice(0, 16);
	return {
		evidenceId: `evidence:${input.source}:${digest}`,
		...(input.entity ? { entity: input.entity } : {}),
		period: input.period,
		queryType: input.queryType,
		range: input.range,
		signalKey: input.signalKey,
		source: input.source,
	};
}

export function countEvidenceRows(data: unknown): number {
	if (Array.isArray(data)) {
		return data.length;
	}
	if (!(data && typeof data === "object")) {
		return data == null ? 0 : 1;
	}

	const entries = Object.entries(data as Record<string, unknown>);
	const arrayRows = entries
		.filter(([, value]) => Array.isArray(value))
		.map(([, value]) => (value as unknown[]).length);
	const maxArrayRows = arrayRows.length > 0 ? Math.max(...arrayRows) : 0;
	if (arrayRows.length > 0) {
		return maxArrayRows;
	}
	return entries.some(
		([, value]) =>
			!Array.isArray(value) && value !== null && value !== undefined
	)
		? 1
		: 0;
}

function snapshotEvidence(evidence: QueryEvidence): QueryEvidence {
	const { evidenceId: _requestId, ...snapshot } = evidence;
	const digest = createHash("sha256")
		.update(canonicalJson(snapshot))
		.digest("hex")
		.slice(0, 16);
	return { ...evidence, evidenceId: `evidence:${evidence.source}:${digest}` };
}

export interface CreateInsightsAgentToolsParams {
	domain: string;
	onEvidence?: (evidence: InvestigationEvidence) => void;
	signals: InvestigationSignal[];
	timezone: string;
	websiteId: string;
}

export function createInsightsAgentTools(
	params: CreateInsightsAgentToolsParams
) {
	const signalsByKey = new Map(
		params.signals.map((signal) => [signal.signalKey, signal])
	);

	function productScope(signalKey: string): {
		entity: InvestigationSignal["entity"];
		queryType: "custom_events_summary" | "funnels_summary" | "goals_summary";
		target: ProductInsightTarget;
	} {
		const signal = signalsByKey.get(signalKey);
		if (!signal) {
			throw new Error(`Unknown investigation signal key: ${signalKey}`);
		}
		let target: ProductInsightTarget;
		let queryType:
			| "custom_events_summary"
			| "funnels_summary"
			| "goals_summary";
		switch (signal.entity.type) {
			case "goal":
				target = { id: signal.entity.id, type: "goal" };
				queryType = "goals_summary";
				break;
			case "funnel":
				target = { id: signal.entity.id, type: "funnel" };
				queryType = "funnels_summary";
				break;
			case "event":
				target = { id: signal.entity.id, type: "event" };
				queryType = "custom_events_summary";
				break;
			default:
				throw new Error(
					`Product evidence is not scoped to the ${signal.entity.type} signal ${signalKey}`
				);
		}
		return {
			entity: signal.entity,
			queryType,
			target,
		};
	}

	function completeEvidence(items: QueryEvidence[]) {
		const evidence = items.map(snapshotEvidence).map(toInvestigationEvidence);
		for (const item of evidence) {
			params.onEvidence?.(item);
		}
		return { evidence };
	}

	function resolveRanges(
		period: "current" | "previous" | "both",
		signalKey: string
	) {
		const signal = signalsByKey.get(signalKey);
		if (!signal) {
			throw new Error(`Missing period bounds for signal: ${signalKey}`);
		}
		if (signal.detection.method === "zscore" && period !== "current") {
			throw new Error(
				`Z-score signal ${signalKey} has a sparse comparable-day baseline; query current only and use the supplied detector evidence for its baseline`
			);
		}
		const bounds = signal.period;
		if (period === "both") {
			return [
				{ label: "current" as const, range: bounds.current },
				{ label: "previous" as const, range: bounds.previous },
			];
		}
		return [
			{
				label: period,
				range: period === "current" ? bounds.current : bounds.previous,
			},
		];
	}

	async function fetchContextEvidence(input: {
		entity?: InvestigationSignal["entity"];
		fetch: () => Promise<{ results: Record<string, unknown>[] }>;
		period: "current" | "previous";
		queries: { limit?: number; type: string }[];
		range: { from: string; to: string };
		signalKey: string;
		source: "ops" | "product";
	}): Promise<QueryEvidence[]> {
		try {
			const response = await input.fetch();
			return input.queries.map((query, index) => {
				const base = queryEvidenceBase({
					entity: input.entity,
					period: input.period,
					query,
					queryType: query.type,
					range: input.range,
					signalKey: input.signalKey,
					source: input.source,
				});
				const result = response.results[index];
				const data = result
					? Object.fromEntries(
							Object.entries(result).filter(([key]) => key !== "type")
						)
					: [];
				const rowCount = countEvidenceRows(data);
				return {
					...base,
					data,
					rowCount,
					status: rowCount === 0 ? "empty" : "ok",
				};
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message.slice(0, 500) : "Query failed";
			return input.queries.map((query) => {
				const base = queryEvidenceBase({
					entity: input.entity,
					period: input.period,
					query,
					queryType: query.type,
					range: input.range,
					signalKey: input.signalKey,
					source: input.source,
				});
				return {
					...base,
					data: [],
					error: message,
					rowCount: 0,
					status: "failed" as const,
				};
			});
		}
	}

	const querySchema = z.object({
		type: z.string().refine(isValidQueryType, "Unknown query type"),
		limit: z.number().min(1).max(50).optional(),
		filters: z
			.array(
				z.object({
					field: z.string(),
					value: z.string(),
				})
			)
			.optional(),
	});

	const periodSchema = z.enum(["current", "previous", "both"]);
	const signalKeySchema = z
		.string()
		.min(1)
		.refine((signalKey) => signalsByKey.has(signalKey), {
			message: "Unknown investigation signal key",
		});

	const webMetricsTool = tool({
		description:
			'Query analytics data. Use period="both" to compare. Key types: summary_metrics, top_pages, entry_pages, exit_pages, recent_errors, errors_by_page, error_types, session_flow, session_pages, interesting_sessions, session_list, sessions_by_device, sessions_by_browser, web_vitals_by_page, web_vitals_by_browser, revenue_overview, revenue_by_referrer, custom_events_discovery, custom_events_trends, country, region, city, utm_campaigns, device_types. Filter by: path, country, device_type, browser_name, os_name, referrer, utm_source, utm_medium, utm_campaign.',
		inputSchema: z.object({
			period: periodSchema,
			queries: z.array(querySchema).min(1).max(MAX_QUERIES),
			signalKey: signalKeySchema,
		}),
		execute: async ({ period, queries, signalKey }) => {
			const ranges = resolveRanges(period, signalKey);

			const tasks = ranges.flatMap((p) =>
				queries.map(async (q) => {
					const base = queryEvidenceBase({
						period: p.label,
						query: q,
						queryType: q.type,
						range: p.range,
						signalKey,
						source: sourceForWebQuery(q.type),
					});
					const req: QueryRequest = {
						projectId: params.websiteId,
						type: q.type,
						from: p.range.from,
						to: p.range.to,
						timezone: params.timezone,
						limit: q.limit ?? 10,
						filters: q.filters?.map((f) => ({
							field: f.field,
							op: "eq" as const,
							value: f.value,
						})),
					};

					try {
						const data = await executeQuery(
							req,
							params.domain,
							params.timezone
						);
						const rows = Array.isArray(data) ? data : [];
						return {
							...base,
							data: rows,
							rowCount: rows.length,
							status: rows.length === 0 ? "empty" : "ok",
						} satisfies QueryEvidence;
					} catch (error) {
						return {
							...base,
							data: [],
							error:
								error instanceof Error
									? error.message.slice(0, 500)
									: "Query failed",
							rowCount: 0,
							status: "failed",
						} satisfies QueryEvidence;
					}
				})
			);

			const results = await Promise.all(tasks);
			return completeEvidence(results);
		},
	});

	const productMetricsTool = tool({
		description:
			"Read the exact goal, funnel, or event matching the signal entity.",
		inputSchema: z.object({
			period: periodSchema,
			signalKey: signalKeySchema,
		}),
		execute: async ({ period, signalKey }, options) => {
			const scope = productScope(signalKey);
			const appContext = getAppContext(options);
			const ranges = resolveRanges(period, signalKey);
			const results = await Promise.all(
				ranges.map((p) =>
					fetchContextEvidence({
						entity: scope.entity,
						fetch: () => fetchProductMetrics(appContext, p.range, scope.target),
						period: p.label,
						queries: [{ type: scope.queryType }],
						range: p.range,
						signalKey,
						source: "product",
					})
				)
			);
			return completeEvidence(results.flat());
		},
	});

	const opsContextTool = tool({
		description:
			"Errors, uptime, anomalies, flag changes. Use for reliability context.",
		inputSchema: z.object({
			period: periodSchema,
			queries: z
				.array(
					z.object({
						type: z.enum(OPS_INSIGHT_QUERY_TYPES),
						limit: z.number().min(1).max(10).optional(),
					})
				)
				.min(1)
				.max(MAX_QUERIES),
			signalKey: signalKeySchema,
		}),
		execute: async ({ period, queries, signalKey }, options) => {
			const appContext = getAppContext(options);
			const ranges = resolveRanges(period, signalKey);
			const results = await Promise.all(
				ranges.map((p) =>
					fetchContextEvidence({
						fetch: () => fetchOpsMetrics(appContext, p.range, p.label, queries),
						period: p.label,
						queries,
						range: p.range,
						signalKey,
						source: "ops",
					})
				)
			);
			return completeEvidence(results.flat());
		},
	});

	return {
		tools: {
			ops_context: opsContextTool,
			product_metrics: productMetricsTool,
			web_metrics: webMetricsTool,
		},
	};
}
