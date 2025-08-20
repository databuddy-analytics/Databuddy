import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import type { z } from 'zod';
import {
	AIResponseJsonSchema,
	comprehensiveSystemPrompt,
} from '../prompts/agent';
import type { AssistantSession } from './assistant-session';

const openrouter = createOpenRouter({
	apiKey: process.env.AI_API_KEY,
});

const AI_MODEL = 'google/gemini-2.5-flash-lite-preview-06-17';

export interface AIResponse {
	content: z.infer<typeof AIResponseJsonSchema>;
	usage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

/**
 * Service for AI interactions
 * Handles all communication with AI models
 */
export class AIService {
	async generateResponse(session: AssistantSession): Promise<AIResponse> {
		const context = session.getContext();
		const messages = session.getMessages();

		session.log('Starting AI generation');
		const startTime = Date.now();

		const systemPrompt = comprehensiveSystemPrompt(
			context.website.id,
			context.website.domain,
			'execute_chat',
			context.model
		);

		try {
			const chat = await generateObject({
				model: openrouter.chat(AI_MODEL),
				messages: [{ role: 'system', content: systemPrompt }, ...messages],
				temperature: 0.1,
				schema: AIResponseJsonSchema,
			});

			const responseTime = Date.now() - startTime;
			const usage = {
				promptTokens: chat.usage.inputTokens ?? 0,
				completionTokens: chat.usage.outputTokens ?? 0,
				totalTokens: chat.usage.totalTokens ?? 0,
			};

			session.setAIMetrics(responseTime, usage);

			return {
				content: chat.object,
				usage,
			};
		} catch (error) {
			session.log(
				`AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
			throw error;
		}
	}
}
