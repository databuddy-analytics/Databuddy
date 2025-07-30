import { chQuery } from '@databuddy/db';
import { NextResponse } from 'next/server';

export async function GET() {
	try {
		// Get table statistics
		const tableStats = await chQuery(`
      SELECT 
        count() as total_tables,
        sum(total_rows) as total_rows,
        sum(total_bytes) as total_bytes
      FROM system.tables 
      WHERE database != 'system' 
        AND database != 'information_schema' 
        AND database != 'INFORMATION_SCHEMA'
    `);

		// Get database list with sizes
		const databases = await chQuery(`
      SELECT 
        database,
        count() as table_count,
        sum(total_rows) as total_rows,
        sum(total_bytes) as total_bytes
      FROM system.tables 
      WHERE database != 'system' 
        AND database != 'information_schema' 
        AND database != 'INFORMATION_SCHEMA'
      GROUP BY database
      ORDER BY total_bytes DESC
    `);

		// Get system information
		const systemInfo = await chQuery(`
      SELECT 
        version() as version,
        uptime() as uptime
      FROM system.one
    `);

		// Try to get memory usage (may not be available in all versions)
		let memoryInfo = [];
		try {
			memoryInfo = await chQuery(`
        SELECT formatReadableSize(value) as memory_usage
        FROM system.metrics 
        WHERE metric = 'MemoryTracking'
        LIMIT 1
      `);
		} catch (error) {
			console.warn('Memory metrics not available:', error);
		}

		// Get recent query performance (simplified for compatibility)
		let recentQueries = [
			{
				avg_duration: 0,
				query_count: 0,
				total_rows_read: 0,
				total_bytes_read: 0,
			},
		];
		try {
			recentQueries = await chQuery(`
        SELECT 
          avg(query_duration_ms) as avg_duration,
          count() as query_count,
          sum(read_rows) as total_rows_read,
          sum(read_bytes) as total_bytes_read
        FROM system.query_log 
        WHERE event_time >= now() - INTERVAL 1 HOUR
          AND type = 'QueryFinish'
      `);
		} catch (error) {
			// Query log might not be available or accessible
			console.warn('Query log not accessible:', error);
		}

		return NextResponse.json({
			success: true,
			data: {
				overview: tableStats[0] || {
					total_tables: 0,
					total_rows: 0,
					total_bytes: 0,
				},
				databases: databases || [],
				system: {
					...(systemInfo[0] || {}),
					memory_usage: memoryInfo[0]?.memory_usage || undefined,
				},
				performance: recentQueries[0] || {
					avg_duration: 0,
					query_count: 0,
					total_rows_read: 0,
					total_bytes_read: 0,
				},
			},
		});
	} catch (error) {
		console.error('Error fetching database stats:', error);
		return NextResponse.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: 'Failed to fetch database statistics',
			},
			{ status: 500 }
		);
	}
}
