import { chQuery } from "@databuddy/db";
import { createToolLogger } from "./logger";

export interface QueryResult<T = unknown> {
	data: T[];
	executionTime: number;
	rowCount: number;
}

/**
 * Executes a timed ClickHouse query with logging.
 * Centralizes the common query execution pattern.
 */
export async function executeTimedQuery<T extends Record<string, unknown>>(
	toolName: string,
	sql: string,
	params: Record<string, unknown> = {},
	logContext?: Record<string, unknown>
): Promise<QueryResult<T>> {
	const logger = createToolLogger(toolName);
	const queryStart = Date.now();

	try {
		const result = await chQuery<T>(sql, params);
		const executionTime = Date.now() - queryStart;

		logger.info("Query completed", {
			...logContext,
			executionTime: `${executionTime}ms`,
			rowCount: result.length,
			sql: sql.substring(0, 100) + (sql.length > 100 ? "..." : ""),
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
			sql: sql.substring(0, 100) + (sql.length > 100 ? "..." : ""),
		});

		throw error;
	}
}

/**
 * Wraps an error with a consistent message format.
 */
export function wrapError(error: unknown, defaultMessage: string): Error {
	if (error instanceof Error) {
		return error;
	}
	return new Error(defaultMessage);
}
