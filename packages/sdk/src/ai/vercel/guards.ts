/**
 * Type guards and union types for Vercel AI SDK V2/V3 support
 * 
 * Adapted from PostHog's AI SDK implementation:
 * https://github.com/PostHog/posthog-js/tree/main/packages/ai
 */

import type {
	LanguageModelV2,
	LanguageModelV2CallOptions,
	LanguageModelV2Content,
	LanguageModelV2Prompt,
	LanguageModelV2StreamPart,
	LanguageModelV3,
	LanguageModelV3CallOptions,
	LanguageModelV3Content,
	LanguageModelV3Prompt,
	LanguageModelV3StreamPart,
} from "@ai-sdk/provider";

export type LanguageModel = LanguageModelV2 | LanguageModelV3;
export type LanguageModelCallOptions =
	| LanguageModelV2CallOptions
	| LanguageModelV3CallOptions;
export type LanguageModelPrompt = LanguageModelV2Prompt | LanguageModelV3Prompt;
export type LanguageModelContent =
	| LanguageModelV2Content
	| LanguageModelV3Content;
export type LanguageModelStreamPart =
	| LanguageModelV2StreamPart
	| LanguageModelV3StreamPart;

export const isV3Model = (model: LanguageModel): model is LanguageModelV3 => {
	return model.specificationVersion === "v3";
};

export const isV2Model = (model: LanguageModel): model is LanguageModelV2 => {
	return model.specificationVersion === "v2";
};
