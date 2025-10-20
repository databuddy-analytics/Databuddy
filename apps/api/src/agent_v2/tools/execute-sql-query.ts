import { chQuery } from '@databuddy/db';
import { tool } from 'ai';
import { z } from 'zod';

export interface QueryResult {
	data: unknown[];
	executionTime: number;
	rowCount: number;
}

const FORBIDDEN_SQL_KEYWORDS = [
	'INSERT INTO',
	'UPDATE SET',
	'DELETE FROM',
	'DROP TABLE',
	'DROP DATABASE',
	'CREATE TABLE',
	'CREATE DATABASE',
	'ALTER TABLE',
	'EXEC ',
	'EXECUTE ',
	'TRUNCATE',
	'MERGE',
	'BULK',
	'RESTORE',
	'BACKUP',
] as const;

function validateSQL(sql: string): boolean {
	const upperSQL = sql.toUpperCase();
	const trimmed = upperSQL.trim();

	for (const keyword of FORBIDDEN_SQL_KEYWORDS) {
		if (upperSQL.includes(keyword)) {
			return false;
		}
	}

	return trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');
}

export const executeSqlQueryTool = tool({
	description:
		'Executes a validated, read-only ClickHouse SQL query against analytics data. Only SELECT and WITH statements are allowed for security.',
	inputSchema: z.object({
		sql: z
			.string()
			.describe(
				'The SQL query to execute. Must be a SELECT or WITH statement.'
			),
	}),
	execute: async ({ sql }) => {
		if (!validateSQL(sql)) {
			throw new Error(
				'Query failed security validation. Only SELECT and WITH statements are allowed.'
			);
		}

		try {
			const queryStart = Date.now();
			const result = await chQuery(sql);
			const queryTime = Date.now() - queryStart;

			console.info('🔍 [Execute SQL Tool] Query completed', {
				timeTaken: `${queryTime}ms`,
				resultCount: result.length,
				sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
			});

			return {
				data: result,
				executionTime: queryTime,
				rowCount: result.length,
			};
		} catch (error) {
			console.error('❌ [Execute SQL Tool] Query failed', {
				error: error instanceof Error ? error.message : 'Unknown error',
				sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
			});

			throw new Error(
				error instanceof Error ? error.message : 'Unknown query error'
			);
		}
	},
});
