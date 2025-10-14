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
	for (const chunk of chunkArray(records, batchSize)) {
		await ctx.clickHouse.insert({
			table,
			format: 'JSONEachRow',
			values: chunk,
		});
	}
}
