import type {
	LanguageModelV2,
	LanguageModelV2Middleware,
} from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';
import type { Databuddy } from '../../node';

export const buddyWare = (buddy: Databuddy): LanguageModelV2Middleware => {
	return {
		wrapGenerate: async ({ doGenerate }) => {
			const result = await doGenerate();
			buddy.track('ai.generate', {
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				totalTokens: result.usage.totalTokens,
				cachedInputTokens: result.usage.cachedInputTokens,
			});

			return result;
		},
	};
};

export const wrapVercelLanguageModel = (
	model: LanguageModelV2,
	buddy: Databuddy
) => {
	return wrapLanguageModel({
		model,
		middleware: buddyWare(buddy),
	});
};
