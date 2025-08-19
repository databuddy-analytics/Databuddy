import type { User } from '@databuddy/auth';
import type { Website } from '@databuddy/shared';
import type { z } from 'zod';
import type { AIResponseJsonSchema } from '../prompts/agent';
import { executeQuery } from '../utils/query-executor';
import { validateSQL } from '../utils/sql-validator';
import type { StreamingUpdate } from '../utils/stream-utils';

export interface MetricHandlerContext {
	user?: User | null;
	website: Website;
	debugInfo: Record<string, unknown>;
}

export async function handleMetricResponse(
	parsedAiJson: z.infer<typeof AIResponseJsonSchema>,
	context: MetricHandlerContext
): Promise<StreamingUpdate> {
	if (parsedAiJson.sql) {
		if (!validateSQL(parsedAiJson.sql)) {
			return {
				type: 'error',
				content: 'Generated query failed security validation.',
				debugInfo:
					context.user?.role === 'ADMIN' ? context.debugInfo : undefined,
			};
		}

		try {
			const queryResult = await executeQuery(parsedAiJson.sql);
			const metricValue = extractMetricValue(
				queryResult.data,
				parsedAiJson.metric_value
			);
			return sendMetricResponse(parsedAiJson, metricValue, context);
		} catch (queryError: unknown) {
			console.error('❌ Metric SQL execution error', {
				error:
					queryError instanceof Error ? queryError.message : 'Unknown error',
				sql: parsedAiJson.sql,
			});
			return sendMetricResponse(
				parsedAiJson,
				parsedAiJson.metric_value,
				context
			);
		}
	} else {
		return sendMetricResponse(parsedAiJson, parsedAiJson.metric_value, context);
	}
}

function extractMetricValue(
	queryData: unknown[],
	defaultValue: unknown
): unknown {
	if (!(queryData.length && queryData[0])) {
		return defaultValue;
	}

	const firstRow = queryData[0] as Record<string, unknown>;
	const valueKey =
		Object.keys(firstRow).find((key) => typeof firstRow[key] === 'number') ||
		Object.keys(firstRow)[0];

	return valueKey ? firstRow[valueKey] : defaultValue;
}

function sendMetricResponse(
	parsedAiJson: z.infer<typeof AIResponseJsonSchema>,
	metricValue: unknown,
	context: MetricHandlerContext
): StreamingUpdate {
	const formattedValue =
		typeof metricValue === 'number'
			? metricValue.toLocaleString()
			: metricValue;

	return {
		type: 'complete',
		content:
			parsedAiJson.text_response ||
			`${parsedAiJson.metric_label || 'Result'}: ${formattedValue}`,
		data: {
			hasVisualization: false,
			responseType: 'metric',
			metricValue,
			metricLabel: parsedAiJson.metric_label,
		},
		debugInfo: context.user?.role === 'ADMIN' ? context.debugInfo : undefined,
	};
}
