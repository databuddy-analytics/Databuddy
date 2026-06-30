import { describe, expect, it } from "bun:test";
import {
	AI_COMPONENT_DATA_PART_TYPE,
	getAIComponentInputFromPart,
	getAIComponentInputFromToolOutput,
	normalizeAIComponentMessages,
} from "./message-parts";

const actionComponent = {
	type: "dashboard-actions",
	websiteId: "site_123",
	actions: [{ label: "Open events", target: "website.events" }],
};

describe("AI component message parts", () => {
	it("reads canonical structured component data parts", () => {
		expect(
			getAIComponentInputFromPart({
				type: AI_COMPONENT_DATA_PART_TYPE,
				data: actionComponent,
			})
		).toEqual(actionComponent);
	});

	it("keeps legacy kebab-case data parts readable", () => {
		expect(
			getAIComponentInputFromPart({
				type: "data-ai-component",
				data: actionComponent,
			})
		).toEqual(actionComponent);
	});

	it("rejects invalid component data parts", () => {
		expect(
			getAIComponentInputFromPart({
				type: AI_COMPONENT_DATA_PART_TYPE,
				data: { type: "dashboard-actions", actions: [] },
			})
		).toBeNull();
	});

	it("reads valid component tool outputs", () => {
		expect(
			getAIComponentInputFromToolOutput({
				type: "tool-dashboard_actions",
				output: actionComponent,
			})
		).toEqual(actionComponent);
	});

	it("rejects non-component tool outputs", () => {
		expect(
			getAIComponentInputFromToolOutput({
				type: "tool-get_data",
				output: { results: {} },
			})
		).toBeNull();
	});

	it("normalizes completed assistant inline JSON into data parts", () => {
		const messages = [
			{
				id: "msg_1",
				role: "assistant",
				parts: [
					{
						type: "text",
						text: `Open this ${JSON.stringify(actionComponent)} after review.`,
						state: "done",
					},
				],
			},
		];

		const normalized = normalizeAIComponentMessages(messages);

		expect(normalized).not.toBe(messages);
		expect(normalized[0]?.parts).toEqual([
			{ type: "text", text: "Open this", state: "done" },
			{ type: AI_COMPONENT_DATA_PART_TYPE, data: actionComponent },
			{ type: "text", text: "after review.", state: "done" },
		]);
	});

	it("leaves user messages and plain assistant text untouched", () => {
		const messages = [
			{
				id: "msg_1",
				role: "user",
				parts: [{ type: "text", text: JSON.stringify(actionComponent) }],
			},
			{
				id: "msg_2",
				role: "assistant",
				parts: [{ type: "text", text: "Plain response." }],
			},
		];

		expect(normalizeAIComponentMessages(messages)).toBe(messages);
	});
});
