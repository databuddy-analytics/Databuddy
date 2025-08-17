import type { User } from '@databuddy/auth';
import type { Website } from '@databuddy/shared';
import { handleChartResponse } from './handlers/chart-handler';
import { handleMetricResponse } from './handlers/metric-handler';
import { comprehensiveUnifiedPrompt } from './prompts/agent';
import { getAICompletion } from './utils/ai-client';
import type { StreamingUpdate } from './utils/stream-utils';
import { generateThinkingSteps } from './utils/stream-utils';

const getRandomMessage = (messages: string[]): string =>
	messages[Math.floor(Math.random() * messages.length)] ||
	'An error occurred while processing your request.';

const parseErrorMessages = [
	"I'm having trouble understanding that request. Could you try asking in a different way?",
	'Something went wrong while I was processing your question. Mind rephrasing it?',
	"I didn't quite catch that - could you ask me again, maybe with different words?",
];

const unexpectedErrorMessages = [
	'Oops! Something unexpected happened. Mind trying that again?',
	'I hit a snag there! Could you give that another shot?',
	'Something went a bit wonky on my end. Try asking me again?',
];

export interface AssistantRequest {
	message: string;
	website_id: string;
	website_hostname: string;
	model?: 'chat' | 'agent' | 'agent-max';
	context?: {
		previousMessages?: Array<{
			role?: string;
			content: string;
		}>;
	};
}

export interface AssistantContext {
	user?: User | null;
	website: Website;
	debugInfo: Record<string, unknown>;
}

export async function* processAssistantRequest(
	request: AssistantRequest,
	context: AssistantContext
): AsyncGenerator<StreamingUpdate> {
	const startTime = Date.now();

	try {
		console.info('✅ [Assistant Processor] Input validated', {
			message: request.message,
			website_id: request.website_id,
			website_hostname: request.website_hostname,
		});

		if (context.user?.role === 'ADMIN') {
			context.debugInfo.validatedInput = {
				message: request.message,
				website_id: request.website_id,
				website_hostname: request.website_hostname,
			};
		}

		const aiStart = Date.now();
		const fullPrompt = comprehensiveUnifiedPrompt(
			request.message,
			request.website_id,
			request.website_hostname,
			'execute_chat',
			request.context?.previousMessages?.map((msg) => ({
				role: msg.role || 'user',
				content: msg.content,
			})),
			undefined,
			request.model
		);

		const aiResponse = await getAICompletion({ prompt: fullPrompt });
		const aiTime = Date.now() - aiStart;

		const parsedResponse = aiResponse.content;

		if (!parsedResponse) {
			yield {
				type: 'error',
				content: getRandomMessage(parseErrorMessages),
				debugInfo:
					context.user?.role === 'ADMIN' ? context.debugInfo : undefined,
			};
			return;
		}

		console.info('✅ [Assistant Processor] AI response parsed', {
			responseType: parsedResponse.response_type,
			hasSQL: !!parsedResponse.sql,
			thinkingSteps: parsedResponse.thinking_steps?.length || 0,
		});

		// Process thinking steps
		if (parsedResponse.thinking_steps?.length) {
			yield* generateThinkingSteps(parsedResponse.thinking_steps);
		}

		// Handle different response types
		switch (parsedResponse.response_type) {
			case 'text':
				yield {
					type: 'complete',
					content:
						parsedResponse.text_response ||
						"Here's the answer to your question.",
					data: { hasVisualization: false, responseType: 'text' },
					debugInfo:
						context.user?.role === 'ADMIN' ? context.debugInfo : undefined,
				};
				break;

			case 'metric':
				yield* handleMetricResponse(parsedResponse, context);
				break;

			case 'chart':
				if (parsedResponse.sql) {
					yield* handleChartResponse(parsedResponse, {
						...context,
						startTime,
						aiTime,
					});
				} else {
					yield {
						type: 'error',
						content: 'Invalid chart configuration.',
						debugInfo:
							context.user?.role === 'ADMIN' ? context.debugInfo : undefined,
					};
				}
				break;

			default:
				yield {
					type: 'error',
					content: 'Invalid response format from AI.',
					debugInfo:
						context.user?.role === 'ADMIN' ? context.debugInfo : undefined,
				};
		}
	} catch (error: unknown) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error';
		console.error('💥 [Assistant Processor] Processing error', {
			error: errorMessage,
		});

		yield {
			type: 'error',
			content: getRandomMessage(unexpectedErrorMessages),
			debugInfo:
				context.user?.role === 'ADMIN' ? { error: errorMessage } : undefined,
		};
	}
}
