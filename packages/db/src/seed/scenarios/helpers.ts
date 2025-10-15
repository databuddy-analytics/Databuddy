import type { SeedContext } from '../context';
import { chunkArray } from '../utils/chunk';

export async function insertClickHouseBatched<T>(
	ctx: SeedContext,
	table: string,
	records: T[]
) {
	if (records.length === 0) {
		return;
	}

	const batchSize = ctx.config.batchSizeEvents ?? records.length;
	const chunks = chunkArray(records, batchSize);
	
	for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
		const chunk = chunks[chunkIndex];
		const queryId = `seed-${table}-${chunkIndex}`;
		const deduplicationToken = `seed-${table}-${chunkIndex}`;
		
		await ctx.clickHouse.insert({
			table,
			format: 'JSONEachRow',
			values: chunk,
			query_id: queryId,
			clickhouse_settings: {
				insert_deduplicate: 1,
				insert_deduplication_token: deduplicationToken,
				async_insert: 1,
				wait_for_async_insert: 1,
				async_insert_deduplicate: 1,
			},
		});
	}
}
