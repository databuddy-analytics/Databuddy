import { describe, expect, test } from "bun:test";
import { buildAnalyticsInstructions } from "../../../../packages/ai/src/ai/prompts/analytics";
import { getComponent } from "./registry";
import { linksListSchema } from "./schemas";

const COMPONENT_START = '{"type":"';

function parsesAsJson(text: string): boolean {
	try {
		JSON.parse(text);
		return true;
	} catch {
		return false;
	}
}

function componentExamples(prompt: string): Record<string, unknown>[] {
	const examples: Record<string, unknown>[] = [];
	let start = prompt.indexOf(COMPONENT_START);
	while (start !== -1) {
		let end = prompt.indexOf("}", start);
		while (end !== -1 && !parsesAsJson(prompt.slice(start, end + 1))) {
			end = prompt.indexOf("}", end + 1);
		}
		examples.push(JSON.parse(prompt.slice(start, end + 1)));
		start = prompt.indexOf(COMPONENT_START, end);
	}
	return examples;
}

const baseLink = {
	id: "link-1",
	name: "Example link",
	targetUrl: "https://example.com",
};

describe("linksListSchema", () => {
	test("accepts persisted link slugs and rejects unsafe display slugs", () => {
		expect(
			linksListSchema.safeParse({
				type: "links-list",
				links: [{ ...baseLink, slug: "launch_2026" }],
			}).success
		).toBe(true);
		expect(
			linksListSchema.safeParse({
				type: "links-list",
				links: [{ ...baseLink, slug: "/evil.example" }],
			}).success
		).toBe(false);
	});
});

describe("dashboard agent prompt components", () => {
	test("every component example in the prompt passes its registry validator", () => {
		const examples = componentExamples(
			buildAnalyticsInstructions({
				chatId: "chat-1",
				currentDateTime: "2026-10-03T12:00:00.000Z",
				timezone: "UTC",
			})
		);

		expect(examples.length).toBeGreaterThan(0);
		for (const example of examples) {
			const type = String(example.type);
			expect([type, getComponent(type)?.validate(example)]).toEqual([
				type,
				true,
			]);
		}
	});
});
