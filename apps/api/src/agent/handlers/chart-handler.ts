import type { User } from '@databuddy/auth';
import { logger, type Website } from '@databuddy/shared';
import type { z } from 'zod';
import type { AIResponseJsonSchema } from '../prompts/agent';
import { executeQuery } from '../utils/query-executor';
import { validateSQL } from '../utils/sql-validator';
import type { StreamingUpdate } from '../utils/stream-utils';

export interface ChartHandlerContext {
	user: User;
	website: Website;
	debugInfo: Record<string, unknown>;
	startTime: number;
	aiTime: number;
}

export async function* handleChartResponse(
	parsedAiJson: z.infer<typeof AIResponseJsonSchema>,
	context: ChartHandlerContext
): AsyncGenerator<StreamingUpdate> {
	if (!parsedAiJson.sql) {
		yield {
			type: 'error',
			content: 'AI did not provide a query for the chart.',
			debugInfo: context.user.role === 'ADMIN' ? context.debugInfo : undefined,
		};
		return;
	}

	if (!validateSQL(parsedAiJson.sql)) {
		yield {
			type: 'error',
			content: 'Generated query failed security validation.',
			debugInfo: context.user.role === 'ADMIN' ? context.debugInfo : undefined,
		};
		return;
	}

	try {
		const queryResult = await executeQuery(parsedAiJson.sql);
		const totalTime = Date.now() - context.startTime;

		if (context.user.role === 'ADMIN') {
			context.debugInfo.processing = {
				aiTime: context.aiTime,
				queryTime: Date.now() - context.startTime - context.aiTime,
				totalTime,
			};
		}

		yield {
			type: 'complete',
			content:
				queryResult.data.length > 0
					? `Found ${queryResult.data.length} data points. Displaying as a ${parsedAiJson.chart_type?.replace(/_/g, ' ') || 'chart'}.`
					: 'No data found for your query.',
			data: {
				hasVisualization: queryResult.data.length > 0,
				chartType: parsedAiJson.chart_type,
				data: queryResult.data,
				responseType: 'chart',
			},
			debugInfo: context.user.role === 'ADMIN' ? context.debugInfo : undefined,
		};
	} catch (queryError: unknown) {
		const errorMessage =
			queryError instanceof Error ? queryError.message : 'Unknown error';

		logger.error('❌ [Chart Handler]', 'SQL execution error', {
			error: errorMessage,
			sql: parsedAiJson.sql,
		});
		yield {
			type: 'error',
			content: 'Database query failed. The data might not be available.',
			debugInfo: context.user.role === 'ADMIN' ? context.debugInfo : undefined,
		};
	}
}
