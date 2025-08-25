import { chQuery } from '@databuddy/db';
import { validateSQL } from './sql-validator';

export interface QueryResult {
	data: unknown[];
	executionTime: number;
	rowCount: number;
}

export async function executeQuery(sql: string): Promise<QueryResult> {
	// Validate SQL before execution
	if (!validateSQL(sql)) {
		throw new Error('SQL query validation failed - potential security risk detected');
	}

	const queryStart = Date.now();
	const result = await chQuery(sql);
	const queryTime = Date.now() - queryStart;

	console.info('🔍 [Query Executor] Query completed', {
		timeTaken: `${queryTime}ms`,
		resultCount: result.length,
		sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
	});

	return {
		data: result,
		executionTime: queryTime,
		rowCount: result.length,
	};
}
