import { describe, expect, it, mock } from "bun:test";

// Keep native model selection and prompts; this contract does not execute tools.
mock.module("../tools/toolkit", () => ({ createToolkit: () => ({}) }));
mock.module("../mcp/agent-tools", () => ({ createMcpAgentTools: () => ({}) }));
const { createConfig } = await import("./analytics");
const { createMcpAgentConfig } = await import("./mcp");
const { modelNames } = await import("../config/models");

const context = {
	userId: "user-synthetic",
	chatId: "chat-synthetic",
	timezone: "UTC",
};

describe("native conversational model configuration", () => {
	it("routes requested balanced reasoning to the selected provider", () => {
		const config = createConfig({ ...context, thinking: "low" });
		expect(config.model.modelId).toBe(modelNames.balanced);
		expect(config.providerOptions).toEqual({
			openai: { reasoningEffort: "low" },
		});
		expect(config.system.providerOptions).toBeUndefined();
		expect(config.temperature).toBeUndefined();
	});
	it("gives dashboard and MCP the same defaults for the same model", () => {
		for (const tier of ["quick", "balanced", "deep"] as const) {
			const dashboard = createConfig(context, tier);
			const mcp = createMcpAgentConfig({
				...context,
				apiKey: null,
				requestHeaders: new Headers(),
				modelOverride: modelNames[tier],
			});
			expect(dashboard.model.modelId).toBe(mcp.model.modelId);
			expect(dashboard.providerOptions).toEqual(mcp.providerOptions);
			expect(dashboard.system.providerOptions).toEqual(
				mcp.system.providerOptions
			);
			expect(dashboard.temperature).toBe(mcp.temperature);
		}
	});
	it("does not inherit a tier's provider capabilities for an override", () => {
		const config = createConfig(
			{ ...context, thinking: "high" },
			"balanced",
			modelNames.quick
		);
		expect(config.model.modelId).toBe(modelNames.quick);
		expect(config.providerOptions).toBeUndefined();
		expect(config.system.providerOptions).toBeUndefined();
		expect(config.temperature).toBe(0.1);
	});
});
