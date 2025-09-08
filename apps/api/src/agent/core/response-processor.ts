import type { StreamingUpdate } from '@databuddy/shared';
import type { z } from 'zod';
import { handleChartResponse } from '../handlers/chart-handler';
import { handleMetricResponse } from '../handlers/metric-handler';
import type { AIResponseJsonSchema } from '../prompts/agent';
import { generateThinkingSteps } from '../utils/stream-utils';
import type { AssistantSession } from './assistant-session';

export type AIResponseContent = z.infer<typeof AIResponseJsonSchema>;

/**
 * Processes AI responses and converts them to streaming updates
 * Handles different response types (text, chart, metric)
 */
export class ResponseProcessor {
	async process(
		aiResponse: AIResponseContent,
		session: AssistantSession
	): Promise<StreamingUpdate[]> {
		session.log(`Processing ${aiResponse.response_type} response`);

		const updates: StreamingUpdate[] = [];

		// Add thinking steps if present
		if (aiResponse.thinking_steps) {
			updates.push(...generateThinkingSteps(aiResponse.thinking_steps));
			session.log(`Added ${aiResponse.thinking_steps.length} thinking steps`);
		}

		// Process the main response
		const mainResponse = await this.processResponseByType(aiResponse, session);
		updates.push(mainResponse);

		return updates;
	}

	private async processResponseByType(
		response: AIResponseContent,
		session: AssistantSession
	): Promise<StreamingUpdate> {
		const startTime = Date.now();

		try {
			let result: StreamingUpdate;

			switch (response.response_type) {
				case 'text': {
					result = {
						type: 'complete',
						content:
							response.text_response || "Here's the answer to your question.",
						data: { hasVisualization: false, responseType: 'text' },
					};
					break;
				}

				case 'metric': {
					result = await handleMetricResponse(response);
					break;
				}

				case 'chart': {
					if (response.sql) {
						result = await handleChartResponse(response);
					} else {
						result = {
							type: 'error',
							content: 'Invalid chart configuration.',
						};
					}
					break;
				}

				default: {
					result = {
						type: 'error',
						content: 'Invalid response format from AI.',
					};
				}
			}

			const processingTime = Date.now() - startTime;
			session.log(
				`Response processed in ${processingTime}ms, result: ${result.type}`
			);

			return result;
		} catch (error) {
			const processingTime = Date.now() - startTime;
			session.log(
				`Response processing failed in ${processingTime}ms: ${error instanceof Error ? error.message : 'Unknown error'}`
			);

			return {
				type: 'error',
				content: 'Failed to process the response.',
			};
		}
	}
}
