import { lookupAgentModelCost } from "@databuddy/shared/agent-credits";
import { describe, expect, it } from "bun:test";
import { getDefaultAgentModelId, modelNames } from "./models";

describe("agent model defaults", () => {
	it("defaults every agent source to the balanced model", () => {
		expect(getDefaultAgentModelId("slack")).toBe(modelNames.balanced);
		expect(getDefaultAgentModelId("dashboard")).toBe(modelNames.balanced);
		expect(getDefaultAgentModelId("mcp")).toBe(modelNames.balanced);
		expect(getDefaultAgentModelId()).toBe(modelNames.balanced);
	});

	it("has prices for every configured model", () => {
		for (const modelId of Object.values(modelNames)) {
			expect(lookupAgentModelCost(modelId), modelId).not.toBeNull();
		}
	});
});
