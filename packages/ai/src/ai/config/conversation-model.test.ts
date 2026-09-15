import { describe, expect, it } from "bun:test";
import { conversationModelOptions } from "./conversation-model";
import { modelNames } from "./models";

describe("conversation model compatibility", () => {
	it.each(["openai/gpt-5.6-terra", "openai/gpt-5.6-luna"])("maps %s to OpenAI effort without inheriting Anthropic options", (modelId) => {
		for (const effort of ["low", "medium", "high"] as const) {
			const options = conversationModelOptions(modelId, effort);
			expect(options.providerOptions?.openai).toEqual({
				reasoningEffort: effort,
			});
			expect(options.providerOptions?.anthropic).toBeUndefined();
			expect(options.systemProviderOptions).toBeUndefined();
			expect(options.temperature).toBeUndefined();
		}
	});

	it("uses the actual override's provider capabilities instead of those of the selected UI tier", () => {
		const claude = conversationModelOptions(
			"anthropic/claude-sonnet-4.6",
			"high"
		);
		expect(claude.systemProviderOptions?.anthropic).toEqual({
			cacheControl: { type: "ephemeral", ttl: "1h" },
		});
		expect(claude.providerOptions?.anthropic).toEqual({
			thinking: { type: "enabled", budgetTokens: 16_384 },
		});
		expect(claude.providerOptions?.openai).toBeUndefined();
		expect(claude.temperature).toBeUndefined();

		for (const modelId of [
			modelNames.quick,
			modelNames.deep,
			modelNames.tiny,
			"openai/synthetic-unknown-model",
		]) {
			const options = conversationModelOptions(modelId, "high");
			expect(options.providerOptions).toBeUndefined();
			expect(options.systemProviderOptions).toBeUndefined();
			expect(options.temperature).toBe(0.1);
		}
	});

	it("leaves reasoning at provider defaults when effort is absent or off, while retaining valid cache settings", () => {
		for (const thinking of [undefined, "off"] as const) {
			const openai = conversationModelOptions(modelNames.balanced, thinking);
			expect(openai.providerOptions).toBeUndefined();
			expect(openai.systemProviderOptions).toBeUndefined();
			expect(openai.temperature).toBe(0.1);

			const claude = conversationModelOptions(
				"anthropic/claude-sonnet-4.6",
				thinking
			);
			expect(claude.providerOptions).toBeUndefined();
			expect(claude.systemProviderOptions?.anthropic).toBeDefined();
			expect(claude.temperature).toBe(0.1);
		}
	});
});
