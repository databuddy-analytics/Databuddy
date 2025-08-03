import OpenAI from 'openai';

const OPENAI_CONFIG = {
	apiKey: process.env.AI_API_KEY,
	baseURL: 'https://openrouter.ai/api/v1',
} as const;

const AI_MODEL = 'google/gemini-2.5-flash-lite-preview-06-17';
// const AI_MODEL = 'openrouter/horizon-beta';

const openai = new OpenAI(OPENAI_CONFIG);

export interface AICompletionRequest {
	prompt: string;
	temperature?: number;
}

export interface AICompletionResponse {
	content: string;
	usage?: {
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
		const completion = await openai.chat.completions.create({
			model: AI_MODEL,
			messages: [{ role: 'system', content: request.prompt }],
			temperature: request.temperature ?? 0.1,
			response_format: { type: 'json_object' },
		});

		const content = completion.choices[0]?.message?.content || '';
		const aiTime = Date.now() - startTime;

		console.info('🤖 [AI Client] Completion completed', {
			timeTaken: `${aiTime}ms`,
			contentLength: content.length,
			usage: completion.usage,
		});

		return {
			content,
			usage: completion.usage,
		};
	} catch (error) {
		console.error('❌ [AI Client] Completion failed', {
			error: error instanceof Error ? error.message : 'Unknown error',
			timeTaken: Date.now() - startTime,
		});
		throw error;
	}
}
