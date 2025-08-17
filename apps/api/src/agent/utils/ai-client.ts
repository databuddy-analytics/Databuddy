import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import type { z } from 'zod';
import { AIResponseJsonSchema } from '../prompts/agent';

const openrouter = createOpenRouter({
	apiKey: process.env.AI_API_KEY,
});

const AI_MODEL = 'google/gemini-2.5-flash-lite-preview-06-17';
// const AI_MODEL = 'openrouter/horizon-beta';

interface AICompletionRequest {
	prompt: string;
	temperature?: number;
}

interface AICompletionResponse {
	content: z.infer<typeof AIResponseJsonSchema>;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export async function getAICompletion(
	request: AICompletionRequest
): Promise<AICompletionResponse> {
	const startTime = Date.now();

	try {
		const chat = await generateObject({
			model: openrouter.chat(AI_MODEL),
			messages: [{ role: 'user', content: request.prompt }],
			temperature: request.temperature ?? 0.1,
			schema: AIResponseJsonSchema,
		});

		const content = chat.object;
		const aiTime = Date.now() - startTime;

		console.info('🤖 [AI Client] Completion completed', {
			timeTaken: `${aiTime}ms`,
			contentLength: JSON.stringify(content).length,
			usage: chat.usage,
			content,
		});

		return {
			content,
			usage: {
				prompt_tokens: chat.usage.inputTokens ?? 0,
				completion_tokens: chat.usage.outputTokens ?? 0,
				total_tokens: chat.usage.totalTokens ?? 0,
			},
		};
	} catch (error) {
		console.error('❌ [AI Client] Completion failed', {
			error: error instanceof Error ? error.message : 'Unknown error',
			timeTaken: Date.now() - startTime,
		});
		throw error;
	}
}
