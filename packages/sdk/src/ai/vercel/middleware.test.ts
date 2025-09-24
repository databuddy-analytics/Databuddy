import { expect, test } from 'bun:test';
import { generateText } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import { Databuddy } from '../../node';
import { type TrackProperties, wrapVercelLanguageModel } from './middleware';

const mockModel = new MockLanguageModelV2({
	doGenerate: async () => ({
		finishReason: 'stop',
		usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
		content: [{ type: 'text', text: 'Hello, world!' }],
		warnings: [],
	}),
});

test('wrapVercelLanguageModel', async () => {
	const buddy = new Databuddy({});
	const model = wrapVercelLanguageModel(mockModel, buddy);

	const result = await generateText({
		model,
		prompt: 'Hello, how are you?',
	});

	expect(result.text).toBe('Hello, world!');

	const trackEntries = buddy.records.filter((r) => r.event === 'ai.generate');

	expect(trackEntries.length).toBe(1);
	const { properties: payload } = trackEntries[0] as {
		event: string;
		properties: TrackProperties;
	};

	expect(payload).toEqual({
		inputTokens: 10,
		outputTokens: 20,
		totalTokens: 30,
		cachedInputTokens: undefined,
		finishReason: 'stop',
		toolCallCount: 0,
		toolResultCount: 0,
		toolCallNames: [],
	});
});
