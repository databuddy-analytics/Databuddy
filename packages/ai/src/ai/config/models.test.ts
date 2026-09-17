import { lookupAgentModelCost } from "@databuddy/shared/agent-credits";
import { describe, expect, it } from "bun:test";
import { modelNames } from "./models";

describe("agent model defaults", () => {
	it("has prices for every configured model", () => {
		for (const modelId of Object.values(modelNames)) {
			expect(lookupAgentModelCost(modelId), modelId).not.toBeNull();
		}
	});
});
