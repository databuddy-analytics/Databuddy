import { describe, expect, it } from "bun:test";
import { scoreCase } from "./scorers";
import type { EvalCase, ParsedAgentResponse } from "./types";

const BASE_CASE: EvalCase = {
	category: "tool-routing",
	expect: {
		toolsCalled: ["list_link_folders"],
	},
	id: "tool-output-test",
	name: "Tool output test",
	query: "List folders",
	websiteId: "website_123",
};

function response(output: unknown): ParsedAgentResponse {
	return {
		chartJSONs: [],
		inputTokens: 0,
		latencyMs: 100,
		outputTokens: 0,
		rawJSONLeaks: [],
		steps: 1,
		textContent: "Done",
		toolCalls: [
			{
				index: 0,
				input: {},
				name: "list_link_folders",
				output,
			},
		],
	};
}

describe("eval scorer", () => {
	it("fails expected tools that return structured errors", () => {
		const result = scoreCase(
			BASE_CASE,
			response({
				content: [
					{
						text: JSON.stringify({
							error: {
								code: "forbidden",
								message: "API key missing read:links scope",
							},
						}),
						type: "text",
					},
				],
				isError: true,
			})
		);

		expect(result.failures).toContain(
			"Expected tool 'list_link_folders' returned an error"
		);
		expect(result.scores.tool_routing).toBeLessThan(100);
	});

	it("does not fail successful tool payloads that contain analytics error fields", () => {
		const result = scoreCase(
			BASE_CASE,
			response({
				data: [{ error_type: "TypeError", count: 3 }],
				rowCount: 1,
			})
		);

		expect(result.failures).not.toContain(
			"Expected tool 'list_link_folders' returned an error"
		);
		expect(result.scores.tool_routing).toBe(100);
	});

	it("fails Slack responses that exceed strict shape budgets", () => {
		const strictCase: EvalCase = {
			category: "quality",
			expect: {
				forbidMarkdownTable: true,
				maxBulletCount: 0,
				maxParagraphs: 1,
				maxResponseWords: 8,
			},
			id: "strict-slack-shape",
			name: "Strict Slack shape",
			query: "say less",
			websiteId: "website_123",
		};
		const verbose = {
			...response(null),
			textContent:
				"Here is the detailed answer.\n\n- First bullet\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
			toolCalls: [],
		};

		const result = scoreCase(strictCase, verbose);

		expect(result.failures.join("\n")).toContain("exceeds budget 8");
		expect(result.failures).toContain(
			"Response has 3 paragraphs, exceeds budget 1"
		);
		expect(result.failures).toContain(
			"Response has 1 bullet lines, exceeds budget 0"
		);
		expect(result.failures).toContain(
			"Response includes a markdown table despite table ban"
		);
		expect(result.scores.format).toBeLessThan(100);
	});
});
