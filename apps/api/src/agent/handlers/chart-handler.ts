import type { StreamingUpdate } from '@databuddy/shared';
import type { z } from 'zod';
import type { AIResponseJsonSchema } from '../prompts/agent';
import { executeQuery } from '../utils/query-executor';
import { validateSQL } from '../utils/sql-validator';

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

export async function handleChartResponse(
	parsedAiJson: z.infer<typeof AIResponseJsonSchema>
): Promise<StreamingUpdate> {
	if (!parsedAiJson.sql) {
		return {
			type: 'error',
			content: 'AI did not provide a query for the chart.',
		};
	}

	if (!validateSQL(parsedAiJson.sql)) {
		return {
			type: 'error',
			content: 'Generated query failed security validation.',
		};
	}

	try {
		const queryResult = await executeQuery(parsedAiJson.sql);

		return {
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
		};
	} catch {
		return {
			type: 'error',
			content: getRandomMessage(queryFailedMessages),
		};
	}
}
