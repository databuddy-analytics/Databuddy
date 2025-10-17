// import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { customProvider } from 'ai';

// const openrouter = createOpenRouter({
//   apiKey: process.env.AI_API_KEY!,
// });
const openai = createOpenAI({
	apiKey: process.env.AI_API_KEY as string,
});

export const config = {
	'chat-model': {
		stepCount: 10,
		temperature: 0.1,
	},
	'agent-model': {
		stepCount: 20,
		temperature: 0.2,
	},
	'agent-max-model': {
		stepCount: 100,
		temperature: 0.1,
	},
} as const;

export const provider = customProvider({
	languageModels: {
		'chat-model': openai.responses('gpt-4o-mini'),
		// 'chat-model': openrouter.chat('google/gemini-2.5-flash-lite-preview-06-17'),
		'agent-model': openai.responses('gpt-5-mini'),
		// 'agent-model': openrouter.chat('openai/gpt-5'),
		'agent-max-model': openai.responses('gpt-5'),
		// 'agent-max-model': openrouter.chat('anthropic/claude-3-5-sonnet-20241022'),
		'title-model': openai.responses('gpt-5-nano'),
		'artifact-model': openai.responses('gpt-4o-mini'),
	},
	imageModels: {
		// 'small-model': openai.imageModel('dall-e-2'),
	},
});
