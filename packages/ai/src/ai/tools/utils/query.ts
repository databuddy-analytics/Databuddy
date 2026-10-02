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

function sanitizeUnknown(value: unknown): unknown {
	if (typeof value === "string") {
		return stripHtmlTags(value, MAX_STRING_LENGTH);
	}
	if (Array.isArray(value)) {
		return value.map(sanitizeUnknown);
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				TRUSTED_FIELDS.has(key) ? item : sanitizeUnknown(item),
			])
		);
	}
	return value;
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
	const sqlPreview = `${sql.slice(0, 100)}${sql.length > 100 ? "..." : ""}`;

	try {
		const raw = await chQuery<T>(sql, params, {
			abort_signal: abortSignal,
			readonly: true,
			...(clickhouseSettings && { clickhouse_settings: clickhouseSettings }),
		});
		const executionTime = Date.now() - queryStart;
		const result = raw.map((row) => sanitizeUnknown(row) as T);

		logger.info("Query completed", {
			...logContext,
			executionTime: `${executionTime}ms`,
			rowCount: result.length,
			sql: sqlPreview,
		});

		return {
			data: result,
			executionTime,
			rowCount: result.length,
		};
	} catch (error) {
		const executionTime = Date.now() - queryStart;

		logger.warn("Query failed", {
			...logContext,
			executionTime: `${executionTime}ms`,
			error: error instanceof Error ? error.message : "Unknown error",
			sql: sqlPreview,
		});

		throw error;
	}
}
