import { describe, expect, it } from "bun:test";
import { classifyMessage, hasToolHistory } from "./router";

describe("agent tier classification", () => {
	it("classifies greetings as greeter", async () => {
		const tier = await classifyMessage("thanks", false);
		expect(tier).toBe("greeter");
	});

	it("classifies short acks as greeter", async () => {
		const tier = await classifyMessage("ok", false);
		expect(tier).toBe("greeter");
	});

	it("returns balanced when tool history exists", async () => {
		const tier = await classifyMessage("ok", true);
		expect(tier).toBe("balanced");
	});

	it("returns balanced for empty input", async () => {
		const tier = await classifyMessage("", false);
		expect(tier).toBe("balanced");
	});

	it("detects tool history in messages", () => {
		const messages = [
			{ parts: [{ type: "text" }] },
			{ parts: [{ type: "text" }, { type: "tool-get_data" }] },
			{ parts: [{ type: "text" }] },
		];
		expect(hasToolHistory(messages)).toBe(true);
	});

	it("detects no tool history in text-only messages", () => {
		const messages = [{ parts: [{ type: "text" }] }];
		expect(hasToolHistory(messages)).toBe(false);
	});
});
