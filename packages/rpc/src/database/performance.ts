import type {
	PerformanceFilters,
	PerformanceMetrics,
	PgStatStatement,
	QueryDistribution,
	QueryPerformanceSummary,
} from '@databuddy/shared';
import { Client } from 'pg';

async function createClient(connectionUrl: string): Promise<Client> {
	const client = new Client({
		connectionString: connectionUrl,
		connectionTimeoutMillis: 10_000,
		query_timeout: 30_000,
	});
	await client.connect();
	return client;
}

export async function getPerformanceStatements(
	connectionUrl: string,
	filters: PerformanceFilters = {}
): Promise<PgStatStatement[]> {
	const client = await createClient(connectionUrl);

	try {
		const {
			limit = 100,
			min_calls = 1,
			min_exec_time = 0,
			order_by = 'total_exec_time',
			order_direction = 'desc',
		} = filters;

		const query = `
			SELECT * FROM pg_stat_statements
			WHERE calls >= $1 AND total_exec_time >= $2
			ORDER BY ${order_by} ${order_direction.toUpperCase()}
			LIMIT $3
		`;

		const result = await client.query(query, [min_calls, min_exec_time, limit]);
		return result.rows as PgStatStatement[];
	} finally {
		await client.end();
	}
}

function formatQuery(
	query: string,
	queryid: string,
	mean_exec_time: number
): string {
	if (query === '<insufficient privilege>') {
		const speed =
			mean_exec_time < 1 ? 'Fast' : mean_exec_time < 100 ? 'Medium' : 'Slow';
		return `Query ID: ${queryid} (${speed} query)`;
	}
	return query.substring(0, 200);
}

async function getTopQueries(
	client: Client,
	orderBy: string,
	limit = 10
): Promise<QueryPerformanceSummary[]> {
	const query = `
		WITH total_time AS (SELECT SUM(total_exec_time) as total FROM pg_stat_statements)
		SELECT 
			queryid,
			query,
			calls,
			total_exec_time,
			mean_exec_time,
			min_exec_time,
			max_exec_time,
			stddev_exec_time,
			rows,
			shared_blks_hit,
			shared_blks_read,
			CASE 
				WHEN (shared_blks_hit + shared_blks_read) > 0 
				THEN (shared_blks_hit::float / (shared_blks_hit + shared_blks_read) * 100)
				ELSE 0 
			END as cache_hit_ratio,
			CASE 
				WHEN (SELECT total FROM total_time) > 0 
				THEN (total_exec_time / (SELECT total FROM total_time) * 100)
				ELSE 0 
			END as percentage_of_total_time
		FROM pg_stat_statements
		WHERE calls > ${orderBy === 'mean_exec_time' ? '5' : '0'}
		ORDER BY ${orderBy} DESC
		LIMIT $1
	`;

	const result = await client.query(query, [limit]);
	return result.rows.map((row) => ({
		...row,
		query: formatQuery(row.query, row.queryid, row.mean_exec_time),
	}));
}

export async function getPerformanceMetrics(
	connectionUrl: string
): Promise<PerformanceMetrics> {
	const client = await createClient(connectionUrl);

	try {
		// Overall metrics
		const overallQuery = `
			WITH exec_times AS (
				SELECT mean_exec_time FROM pg_stat_statements WHERE calls > 0
			),
			percentiles AS (
				SELECT 
					PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mean_exec_time) as p50,
					PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY mean_exec_time) as p95,
					PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY mean_exec_time) as p99
				FROM exec_times
			)
			SELECT 
				COUNT(*) as total_queries,
				SUM(calls) as total_calls,
				SUM(total_exec_time) as total_exec_time,
				AVG(mean_exec_time) as avg_exec_time,
				CASE 
					WHEN SUM(shared_blks_hit + shared_blks_read) > 0 
					THEN (SUM(shared_blks_hit)::float / SUM(shared_blks_hit + shared_blks_read) * 100)
					ELSE 0 
				END as cache_hit_ratio,
				(SELECT p50 FROM percentiles) as p50_exec_time,
				(SELECT p95 FROM percentiles) as p95_exec_time,
				(SELECT p99 FROM percentiles) as p99_exec_time
			FROM pg_stat_statements
		`;

		const [overallResult, topByTime, topByCalls, slowest] = await Promise.all([
			client.query(overallQuery),
			getTopQueries(client, 'total_exec_time'),
			getTopQueries(client, 'calls'),
			getTopQueries(client, 'mean_exec_time'),
		]);

		// Query distribution
		const distributionQuery = `
			SELECT 
				CASE 
					WHEN mean_exec_time < 1 THEN '< 1ms'
					WHEN mean_exec_time < 10 THEN '1-10ms'
					WHEN mean_exec_time < 100 THEN '10-100ms'
					WHEN mean_exec_time < 1000 THEN '100ms-1s'
					WHEN mean_exec_time < 10000 THEN '1-10s'
					ELSE '> 10s'
				END as time_bucket,
				COUNT(*) as query_count,
				SUM(total_exec_time) as total_time,
				AVG(mean_exec_time) as avg_time
			FROM pg_stat_statements
			WHERE calls > 0
			GROUP BY 1
			ORDER BY avg_time
		`;

		const distributionResult = await client.query(distributionQuery);
		const overall = overallResult.rows[0];

		return {
			total_queries: Number.parseInt(overall.total_queries, 10),
			total_calls: Number.parseInt(overall.total_calls, 10),
			total_exec_time: Number.parseFloat(overall.total_exec_time),
			avg_exec_time: Number.parseFloat(overall.avg_exec_time),
			cache_hit_ratio: Number.parseFloat(overall.cache_hit_ratio),
			p50_exec_time: Number.parseFloat(overall.p50_exec_time || '0'),
			p95_exec_time: Number.parseFloat(overall.p95_exec_time || '0'),
			p99_exec_time: Number.parseFloat(overall.p99_exec_time || '0'),
			top_queries_by_time: topByTime,
			top_queries_by_calls: topByCalls,
			slowest_queries: slowest,
			query_distribution: distributionResult.rows as QueryDistribution[],
		};
	} finally {
		await client.end();
	}
}

export async function resetPerformanceStats(
	connectionUrl: string
): Promise<void> {
	const client = await createClient(connectionUrl);
	try {
		await client.query('SELECT pg_stat_statements_reset()');
	} finally {
		await client.end();
	}
}

export async function checkPgStatStatementsEnabled(
	connectionUrl: string
): Promise<boolean> {
	const client = await createClient(connectionUrl);
	try {
		// Check extension exists
		const extensionResult = await client.query(
			`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') as extension_exists`
		);

		if (!extensionResult.rows[0].extension_exists) {
			return false;
		}

		// Test access
		await client.query('SELECT COUNT(*) FROM pg_stat_statements LIMIT 1');
		return true;
	} catch {
		return false;
	} finally {
		await client.end();
	}
}

export async function getCurrentUserInfo(connectionUrl: string): Promise<{
	username: string;
	hasReadAllStats: boolean;
	roles: string[];
}> {
	const client = await createClient(connectionUrl);

	try {
		const [userInfoResult, rolesResult] = await Promise.all([
			client.query(`
				SELECT 
					current_user as username,
					EXISTS (
						SELECT 1 FROM pg_roles r 
						JOIN pg_auth_members am ON r.oid = am.roleid 
						JOIN pg_roles m ON am.member = m.oid 
						WHERE r.rolname = 'pg_read_all_stats' AND m.rolname = current_user
					) as has_read_all_stats
			`),
			client.query(`
				SELECT r.rolname 
				FROM pg_roles r 
				JOIN pg_auth_members am ON r.oid = am.roleid 
				JOIN pg_roles m ON am.member = m.oid 
				WHERE m.rolname = current_user
			`),
		]);

		return {
			username: userInfoResult.rows[0].username,
			hasReadAllStats: userInfoResult.rows[0].has_read_all_stats,
			roles: rolesResult.rows.map((row) => row.rolname),
		};
	} finally {
		await client.end();
	}
}

// Online Advisor Extension Functions

export async function checkOnlineAdvisorEnabled(
	connectionUrl: string
): Promise<boolean> {
	const client = await createClient(connectionUrl);
	try {
		// Check extension exists
		const extensionResult = await client.query(
			`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'online_advisor') as extension_exists`
		);

		if (!extensionResult.rows[0].extension_exists) {
			return false;
		}

		// Test access to views
		await client.query('SELECT COUNT(*) FROM proposed_indexes LIMIT 1');
		return true;
	} catch {
		return false;
	} finally {
		await client.end();
	}
}

export async function getOnlineAdvisorIndexes(
	connectionUrl: string
): Promise<any[]> {
	const client = await createClient(connectionUrl);

	try {
		const query = `
			SELECT 
				create_index,
				n_filtered,
				n_called,
				elapsed_sec,
				-- Extract table name from CREATE INDEX statement
				CASE 
					WHEN create_index ~ ' ON ([^\\(\\s]+)' 
					THEN regexp_replace(create_index, '.* ON ([^\\(\\s]+).*', '\\1')
					ELSE 'unknown'
				END as table_name,
				-- Extract columns from CREATE INDEX statement  
				CASE 
					WHEN create_index ~ '\\(([^\\)]+)\\)'
					THEN regexp_replace(create_index, '.*\\(([^\\)]+)\\).*', '\\1')
					ELSE 'unknown'
				END as column_names
			FROM proposed_indexes 
			ORDER BY elapsed_sec DESC
		`;

		const result = await client.query(query);
		return result.rows;
	} finally {
		await client.end();
	}
}

export async function getOnlineAdvisorStatistics(
	connectionUrl: string
): Promise<any[]> {
	const client = await createClient(connectionUrl);

	try {
		const query = `
			SELECT 
				create_statistics,
				misestimation,
				n_called,
				elapsed_sec
			FROM proposed_statistics 
			ORDER BY misestimation DESC
		`;

		const result = await client.query(query);
		return result.rows;
	} finally {
		await client.end();
	}
}

export async function getExecutorStats(
	connectionUrl: string,
	reset = false
): Promise<any> {
	const client = await createClient(connectionUrl);

	try {
		const result = await client.query('SELECT * FROM get_executor_stats($1)', [
			reset,
		]);
		return result.rows[0];
	} finally {
		await client.end();
	}
}

export async function applyIndexRecommendation(
	connectionUrl: string,
	createIndexSQL: string
): Promise<{ success: boolean; message?: string }> {
	const client = await createClient(connectionUrl);

	try {
		// Execute the CREATE INDEX statement
		await client.query(createIndexSQL);
		return { success: true };
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error';
		return { success: false, message: errorMessage };
	} finally {
		await client.end();
	}
}

export async function applyStatisticsRecommendation(
	connectionUrl: string,
	createStatsSQL: string
): Promise<{ success: boolean; message?: string }> {
	const client = await createClient(connectionUrl);

	try {
		// Execute the CREATE STATISTICS statement
		await client.query(createStatsSQL);
		return { success: true };
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error';
		return { success: false, message: errorMessage };
	} finally {
		await client.end();
	}
}

export async function activateOnlineAdvisor(
	connectionUrl: string
): Promise<{ success: boolean; message?: string }> {
	const client = await createClient(connectionUrl);

	try {
		// Activate online_advisor by calling get_executor_stats()
		await client.query('SELECT get_executor_stats()');
		return { success: true };
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error';
		return { success: false, message: errorMessage };
	} finally {
		await client.end();
	}
}
