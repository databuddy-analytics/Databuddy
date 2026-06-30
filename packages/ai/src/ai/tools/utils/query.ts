import { chQuery } from "@databuddy/db/clickhouse";
import { stripHtmlTags } from "../../../lib/sanitize";
import { createToolLogger } from "./logger";

export interface QueryResult<T = unknown> {
	data: T[];
	executionTime: number;
	rowCount: number;
}

const TRUSTED_FIELDS = new Set([
	"client_id",
	"website_id",
	"organization_id",
	"owner_id",
	"id",
	"session_id",
	"anonymous_id",
	"user_id",
	"time",
	"timestamp",
	"createdAt",
	"created_at",
	"updatedAt",
	"updated_at",
	"count",
	"total",
	"value",
	"score",
	"latency",
	"duration",
	"page",
	"rank",
	"is_bot",
]);

const MAX_STRING_LENGTH = 2000;

function sanitizeValue(value: string): string {
	return stripHtmlTags(value, MAX_STRING_LENGTH);
}

function sanitizeUnknown(value: unknown): unknown {
	if (typeof value === "string") {
		return sanitizeValue(value);
	}
	if (Array.isArray(value)) {
		return value.map(sanitizeUnknown);
	}
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = TRUSTED_FIELDS.has(k) ? v : sanitizeUnknown(v);
		}
		return out;
	}
	return value;
}

function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
	const out = { ...row };
	for (const [key, value] of Object.entries(out)) {
		if (TRUSTED_FIELDS.has(key)) {
			continue;
		}
		(out as Record<string, unknown>)[key] = sanitizeUnknown(value);
	}
	return out;
}

export async function executeTimedQuery<T extends Record<string, unknown>>(
	toolName: string,
	sql: string,
	params: Record<string, unknown> = {},
	logContext?: Record<string, unknown>,
	clickhouseSettings?: Record<string, string | number>,
	abortSignal?: AbortSignal
): Promise<QueryResult<T>> {
	const logger = createToolLogger(toolName);
	const queryStart = Date.now();

	try {
		const raw = await chQuery<T>(sql, params, {
			abort_signal: abortSignal,
			readonly: true,
			...(clickhouseSettings && { clickhouse_settings: clickhouseSettings }),
		});
		const executionTime = Date.now() - queryStart;
		const result = raw.map(sanitizeRow);

		logger.info("Query completed", {
			...logContext,
			executionTime: `${executionTime}ms`,
			rowCount: result.length,
			sql: `${sql.slice(0, 100)}${sql.length > 100 ? "..." : ""}`,
		});

		return {
			data: result,
			executionTime,
			rowCount: result.length,
		};
	} catch (error) {
		const executionTime = Date.now() - queryStart;

		logger.error("Query failed", {
			...logContext,
			executionTime: `${executionTime}ms`,
			error: error instanceof Error ? error.message : "Unknown error",
			sql: `${sql.slice(0, 100)}${sql.length > 100 ? "..." : ""}`,
		});

		throw error;
	}
}
