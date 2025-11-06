import type { StreamingUpdate } from "@databuddy/shared/types/assistant";
import type { z } from "zod";
import type { AIResponseJsonSchema } from "../prompts/agent";
import { executeQuery } from "../utils/query-executor";
import { validateSQL } from "../utils/sql-validator";

export async function handleMetricResponse(
	parsedAiJson: z.infer<typeof AIResponseJsonSchema>
): Promise<StreamingUpdate> {
	if (parsedAiJson.sql) {
		if (!validateSQL(parsedAiJson.sql)) {
			return {
				type: "error",
				content: "Generated query failed security validation.",
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
		Object.keys(firstRow).find((key) => typeof firstRow[key] === "number") ||
		Object.keys(firstRow)[0];

	return valueKey ? firstRow[valueKey] : defaultValue;
}

function generateTextResponseWithActualValue(
	textResponse: string | undefined,
	actualValue: unknown,
	metricLabel: string | undefined
): string {
	if (!textResponse) {
		const formattedValue =
			typeof actualValue === "number"
				? actualValue.toLocaleString()
				: actualValue;
		return `${metricLabel || "Result"}: ${String(formattedValue)}`;
	}

	// Handle [RESULT] placeholders first - this is what the AI should use
	if (textResponse.includes("[RESULT]")) {
		const formattedValue =
			typeof actualValue === "number"
				? actualValue.toLocaleString()
				: String(actualValue);
		return textResponse.replace(/\[RESULT\]/g, formattedValue);
	}

	if (typeof actualValue === "number") {
		const roundedValue = Math.round(actualValue * 100) / 100;
		const formattedValue = roundedValue.toLocaleString();

		const numberPattern = /\b\d+(?:\.\d+)?\b/g;

		const numbersInText = textResponse.match(numberPattern);
		if (numbersInText && numbersInText.length > 0) {
			let hasReplaced = false;
			return textResponse.replace(numberPattern, (match) => {
				if (!hasReplaced) {
					hasReplaced = true;
					return formattedValue;
				}
				return match;
			});
		}
	}

	return textResponse;
}

function sendMetricResponse(
	parsedAiJson: z.infer<typeof AIResponseJsonSchema>,
	metricValue: unknown
): StreamingUpdate {
	const textResponse = generateTextResponseWithActualValue(
		parsedAiJson.text_response,
		metricValue,
		parsedAiJson.metric_label
	);

	const typedMetricValue =
		typeof metricValue === "string" ||
		typeof metricValue === "number" ||
		metricValue === undefined
			? metricValue
			: String(metricValue);

	return {
		type: "complete",
		content: textResponse,
		data: {
			hasVisualization: false,
			responseType: "metric",
			metricValue: typedMetricValue,
			metricLabel: parsedAiJson.metric_label,
		},
	};
}
