import type { StreamingUpdate } from '@databuddy/shared';
import type { z } from 'zod';
import type { AIResponseJsonSchema } from '../prompts/agent';
import { executeQuery } from '../utils/query-executor';
import { validateSQL } from '../utils/sql-validator';

export async function handleMetricResponse(
	parsedAiJson: z.infer<typeof AIResponseJsonSchema>
): Promise<StreamingUpdate> {
	if (parsedAiJson.sql) {
		if (!validateSQL(parsedAiJson.sql)) {
			return {
				type: 'error',
				content: 'Generated query failed security validation.',
			};
		}

		try {
			const queryResult = await executeQuery(parsedAiJson.sql);
			const metricValue = extractMetricValue(
				queryResult.data,
				parsedAiJson.metric_value
			);
			return sendMetricResponse(parsedAiJson, metricValue);
		} catch {
			return sendMetricResponse(parsedAiJson, parsedAiJson.metric_value);
		}
	} else {
		return sendMetricResponse(parsedAiJson, parsedAiJson.metric_value);
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
	metricValue: unknown
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
	};
}
