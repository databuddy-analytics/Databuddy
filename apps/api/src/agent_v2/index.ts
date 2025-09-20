import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { type ModelMessage, smoothStream, stepCountIs, streamText } from 'ai';
import { chatPrompt } from './prompts/chat-prompt';
import { tools } from './tools';

const openrouter = createOpenRouter({
	apiKey: process.env.AI_API_KEY,
});

export const modes = ['chat', 'agent', 'agent_max'] as const;
export type Mode = (typeof modes)[number];

const config = {
	chat: {
		model: 'google/gemini-2.5-flash-lite-preview-06-17',
		stepCount: 3,
		temperature: 0.1,
	},
	agent: {
		model: 'openai/gpt-5',
		stepCount: 10,
		temperature: 0.2,
	},
	agent_max: {
		model: 'anthropic/claude-3-5-sonnet-20241022',
		stepCount: 20,
		temperature: 0.1,
	},
} as const;

function getPrompt(
	mode: Mode,
	websiteId: string,
	websiteHostname: string
): string {
	switch (mode) {
		case 'chat':
			return chatPrompt(websiteId, websiteHostname);
		case 'agent':
		case 'agent_max':
			return chatPrompt(websiteId, websiteHostname);
		default:
			return chatPrompt(websiteId, websiteHostname);
	}
}

export function handleMessage(
	messages: ModelMessage[],
	mode: Mode,
	websiteId: string,
	websiteHostname: string
) {
	const prompt = getPrompt(mode, websiteId, websiteHostname);
	const modeConfig = config[mode];

	const response = streamText({
		model: openrouter.chat(modeConfig.model),
		system: prompt,
		tools,
		stopWhen: stepCountIs(modeConfig.stepCount),
		messages,
		temperature: modeConfig.temperature,
		experimental_transform: smoothStream({ chunking: 'word' }),
	});

	return response.toUIMessageStreamResponse();
}
