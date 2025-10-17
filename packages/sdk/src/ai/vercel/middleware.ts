import type {
	LanguageModelV2,
	LanguageModelV2Middleware,
} from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';
import { computeCostUSD } from 'tokenlens';
import type { Databuddy } from '../../node';

export type TrackProperties = {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	cachedInputTokens?: number;
	finishReason?: string;
	toolCallCount?: number;
	toolResultCount?: number;
	toolCallNames?: string[];
	inputTokenCostUSD?: number;
	outputTokenCostUSD?: number;
	totalTokenCostUSD?: number;
};

const buddyWare = (buddy: Databuddy): LanguageModelV2Middleware => {
	return {
		wrapGenerate: async ({ doGenerate, model }) => {
			const result = await doGenerate();

			const isToolCall = (
				part: (typeof result.content)[number]
			): part is Extract<
				(typeof result.content)[number],
				{ type: 'tool-call' }
			> => part.type === 'tool-call';

			const isToolResult = (
				part: (typeof result.content)[number]
			): part is Extract<
				(typeof result.content)[number],
				{ type: 'tool-result' }
			> => part.type === 'tool-result';

			const toolCalls = result.content.filter(isToolCall);
			const toolResults = result.content.filter(isToolResult);
			const toolCallNames = Array.from(
				new Set(toolCalls.map((c) => c.toolName))
			);

			const costs = await computeCostUSD({
				modelId: model.modelId,
				provider: model.provider,
				usage: result.usage,
			});

			const payload: TrackProperties = {
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				totalTokens: result.usage.totalTokens,
				cachedInputTokens: result.usage.cachedInputTokens,
				finishReason: result.finishReason,
				toolCallCount: toolCalls.length,
				toolResultCount: toolResults.length,
				inputTokenCostUSD: costs.inputTokenCostUSD,
				outputTokenCostUSD: costs.outputTokenCostUSD,
				totalTokenCostUSD: costs.totalTokenCostUSD,
				toolCallNames,
			};
			buddy.track({name: 'ai.generate', properties: payload});

			return result;
		},
	};
};

/**
 * Wrap a Vercel language model with Databuddy middleware
 * @param model - The Vercel language model to wrap, if you are using the Vercel AI Gateway, please use the LanguageModelV2 type e.g. gateway('xai/grok-3') instead of the string type e.g. 'xai/grok-3'
 * @param buddy - The Databuddy instance to use
 * @returns The wrapped language model, can be used in e.g. generateText from the ai package
 */
export const wrapVercelLanguageModel = (
	model: LanguageModelV2,
	buddy: Databuddy
) => {
	return wrapLanguageModel({
		model,
		middleware: buddyWare(buddy),
	});
};
