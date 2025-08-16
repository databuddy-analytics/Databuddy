import type { User } from '@databuddy/auth';
import type { Website } from '@databuddy/shared';
import type { z } from 'zod';
import type { AIResponseJsonSchema } from '../prompts/agent';
import { executeQuery } from '../utils/query-executor';
import { validateSQL } from '../utils/sql-validator';
import type { StreamingUpdate } from '../utils/stream-utils';

const getRandomMessage = (messages: string[]): string =>
	messages[Math.floor(Math.random() * messages.length)] ||
	'An error occurred while processing your request.';

const queryFailedMessages = [
	'I ran into an issue getting that data. The information might not be available right now.',
	'Something went wrong while fetching your analytics data. Try asking again in a moment?',
	"I couldn't retrieve that data - there might be a temporary issue. Want to try a different question?",
];

const noDataMessages = [
	"I couldn't find any data for that query. Try asking about a different time period or metric?",
	'No data showed up for that request. Maybe try a different date range or ask about something else?',
	'That search came up empty! Want to try asking about a different metric or time frame?',
];

export interface ChartHandlerContext {
	user?: User | null;
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
			debugInfo: context.user?.role === 'ADMIN' ? context.debugInfo : undefined,
		};
		return;
	}

	if (!validateSQL(parsedAiJson.sql)) {
		yield {
			type: 'error',
			content: 'Generated query failed security validation.',
			debugInfo: context.user?.role === 'ADMIN' ? context.debugInfo : undefined,
		};
		return;
	}

	try {
		const queryResult = await executeQuery(parsedAiJson.sql);
		const totalTime = Date.now() - context.startTime;

		if (context.user?.role === 'ADMIN') {
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
					? `Found ${queryResult.data.length} data points. Displaying as a ${parsedAiJson.chart_type ? parsedAiJson.chart_type.replace(/_/g, ' ') : 'chart'}.`
					: getRandomMessage(noDataMessages),
			data: {
				hasVisualization: queryResult.data.length > 0,
				chartType: parsedAiJson.chart_type || 'bar',
				data: queryResult.data,
				responseType: 'chart',
			},
			debugInfo: context.user?.role === 'ADMIN' ? context.debugInfo : undefined,
		};
	} catch (queryError: unknown) {
		console.error('❌ SQL execution error', {
			error: queryError instanceof Error ? queryError.message : 'Unknown error',
			sql: parsedAiJson.sql,
		});
		yield {
			type: 'error',
			content: getRandomMessage(queryFailedMessages),
			debugInfo: context.user?.role === 'ADMIN' ? context.debugInfo : undefined,
		};
	}
}
