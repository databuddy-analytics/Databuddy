import type { User } from '@databuddy/auth';
import { createId, type Website } from '@databuddy/shared';
import type { AssistantRequestType } from '../schemas';
import { handleChartResponse } from './handlers/chart-handler';
import { handleMetricResponse } from './handlers/metric-handler';
import type 
{ AIResponse } from './prompts/agent';
import { getAICompletion } from './utils/ai-client';
import {
	addMessageToConversation,
	createNewConversation,
} from './utils/conversation-utils';
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

export interface AssistantRequest extends Omit<AssistantRequestType, 'model'> {
	websiteHostname: string;
	model: NonNullable<AssistantRequestType['model']>;
}

export interface AssistantContext {
	user: User;
	website: Website;
	debugInfo: Record<string, unknown>;
}

async function processResponseByType(
	parsedResponse: AIResponse,
	context: AssistantContext,
	startTime: number,
	aiTime: number
): Promise<StreamingUpdate> {
	switch (parsedResponse.response_type) {
		case 'text': {
			const textResult = {
				type: 'complete',
				content:
					parsedResponse.text_response || "Here's the answer to your question.",
				data: { hasVisualization: false, responseType: 'text' },
				debugInfo:
					context.user.role === 'ADMIN' ? context.debugInfo : undefined,
			} as const;
			return textResult;
		}

		case 'metric': {
			return await handleMetricResponse(parsedResponse, context);
		}

		case 'chart': {
			if (parsedResponse.sql) {
				return await handleChartResponse(parsedResponse, {
					...context,
					startTime,
					aiTime,
				});
			}
			return {
				type: 'error',
				content: 'Invalid chart configuration.',
				debugInfo:
					context.user.role === 'ADMIN' ? context.debugInfo : undefined,
			};
		}
		default: {
			return {
				type: 'error',
				content: 'Invalid response format from AI.',
				debugInfo:
					context.user.role === 'ADMIN' ? context.debugInfo : undefined,
			};
		}
	}
}

function saveConversationWithResult(
	request: AssistantRequest,
	context: AssistantContext,
	parsedResponse: AIResponse,
	finalResult: StreamingUpdate,
	conversationId: string
) {
	const numberOfUserMessages = request.messages.filter(
		(message) => message.role === 'user'
	).length;
	const isNewConversation = numberOfUserMessages === 1;

	const conversationMessages = [
		{
			id: createId(),
			role: 'user',
			content: request.messages.at(-1)?.content as string,
			conversationId,
			modelType: request.model,
		},
		{
			id: createId(),
			role: 'assistant',
			content: finalResult.content,
			conversationId,
			modelType: request.model,
			sql: parsedResponse.sql,
			chartType: parsedResponse.chart_type,
			responseType: parsedResponse.response_type,
			textResponse: parsedResponse.text_response,
			thinkingSteps: parsedResponse.thinking_steps,
			hasError: finalResult.type === 'error',
			errorMessage: finalResult.type === 'error' ? finalResult.content : '',
			finalResult,
		},
	];

	if (isNewConversation) {
		createNewConversation(
			conversationId,
			request.websiteId,
			context.user.id,
			'New Conversation',
			request.model,
			conversationMessages
		);
	} else {
		addMessageToConversation(
			conversationId,
			request.model,
			conversationMessages
		);
	}
}

export async function processAssistantRequest(
	request: AssistantRequest,
	context: AssistantContext
): Promise<StreamingUpdate[]> {
	const startTime = Date.now();

	try {
		console.info('✅ [Assistant Processor] Input validated', {
			message: request.messages.at(-1),
			websiteId: request.websiteId,
			websiteHostname: request.websiteHostname,
		});

		if (context.user.role === 'ADMIN') {
			context.debugInfo.validatedInput = {
				message: request.messages.at(-1),
				websiteId: request.websiteId,
				websiteHostname: request.websiteHostname,
			};
		}

		const aiStart = Date.now();

		const aiResponse = await getAICompletion(request);
		const aiTime = Date.now() - aiStart;

		const parsedResponse = aiResponse.content;

		if (!parsedResponse) {
			return [
				{
					type: 'error',
					content: getRandomMessage(parseErrorMessages),
					debugInfo:
						context.user.role === 'ADMIN' ? context.debugInfo : undefined,
				},
			];
		}

		console.info('✅ [Assistant Processor] AI response parsed', {
			responseType: parsedResponse.response_type,
			hasSQL: !!parsedResponse.sql,
			thinkingSteps: parsedResponse.thinking_steps?.length || 0,
		});

		const conversationId = request.conversationId || createId();
		const assistantResponse: StreamingUpdate[] = [];

		if (parsedResponse.thinking_steps) {
			assistantResponse.push(
				...generateThinkingSteps(parsedResponse.thinking_steps)
			);
		}

		const finalResult = await processResponseByType(
			parsedResponse,
			context,
			startTime,
			aiTime
		);

		assistantResponse.push(finalResult);

		setImmediate(() => {
			saveConversationWithResult(
				request,
				context,
				parsedResponse,
				finalResult,
				conversationId
			);
		});

		return assistantResponse;
	} catch (error: unknown) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error';
		console.error('💥 [Assistant Processor] Processing error', {
			error: errorMessage,
		});

		return [
			{
				type: 'error',
				content: getRandomMessage(unexpectedErrorMessages),
				debugInfo:
					context.user.role === 'ADMIN' ? { error: errorMessage } : undefined,
			},
		];
	}
}
