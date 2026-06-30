import "./tools.test-env";

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { McpRequestContext } from "./define-tool";
import { createMcpTools } from "./tools";

const ctx: McpRequestContext = {
	apiKey: null,
	requestHeaders: new Headers(),
	userId: null,
};

const tools = createMcpTools(ctx);

const TOOL_NAME_RE = /^[a-z][a-z0-9_]*$/;
const MAX_DESCRIPTION_LEN = 240;

describe("MCP tools/list JSON Schema rendering", () => {
	test("registers at least one tool", () => {
		expect(tools.length).toBeGreaterThan(0);
	});

	for (const tool of tools) {
		test(`${tool.name}: inputSchema renders to JSON Schema`, () => {
			expect(() =>
				z.toJSONSchema(tool.inputSchema, { io: "input" })
			).not.toThrow();
		});

		if (tool.outputSchema) {
			test(`${tool.name}: outputSchema renders to JSON Schema`, () => {
				const outputSchema = tool.outputSchema;
				if (!outputSchema) {
					return;
				}
				expect(() =>
					z.toJSONSchema(outputSchema, { io: "output" })
				).not.toThrow();
			});
		}
	}
});

describe("MCP tool registry invariants", () => {
	test("every tool name matches snake_case pattern", () => {
		for (const tool of tools) {
			expect(tool.name).toMatch(TOOL_NAME_RE);
		}
	});

	test("every tool name is unique", () => {
		const names = tools.map((t) => t.name);
		const unique = new Set(names);
		expect(unique.size).toBe(names.length);
	});

	test("every tool has a non-empty description", () => {
		for (const tool of tools) {
			expect(tool.description.length).toBeGreaterThan(0);
		}
	});

	test("every tool description is within MCP description length budget", () => {
		for (const tool of tools) {
			expect(tool.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LEN);
		}
	});

	test("every tool has metadata with kind and capability", () => {
		for (const tool of tools) {
			expect(tool.metadata).toBeDefined();
			expect(tool.metadata.access.kind).toMatch(/^(read|write)$/);
			expect(tool.metadata.capability).toMatch(/^(analytics|memory|workspace)$/);
		}
	});

	test("every tool has a callable handler function", () => {
		for (const tool of tools) {
			expect(typeof tool.handler).toBe("function");
		}
	});

	test("every write tool declares at least one scope", () => {
		const writers = tools.filter((t) => t.metadata.access.kind === "write");
		expect(writers.length).toBeGreaterThan(0);
		for (const tool of writers) {
			expect(tool.metadata.access.scopes?.length ?? 0).toBeGreaterThan(0);
		}
	});

	test("every input schema is a Zod object (MCP requires top-level object)", () => {
		for (const tool of tools) {
			const json = z.toJSONSchema(tool.inputSchema, { io: "input" });
			expect(json.type).toBe("object");
		}
	});

	test("every declared output schema describes an object (MCP structuredContent requirement)", () => {
		for (const tool of tools) {
			if (!tool.outputSchema) {
				continue;
			}
			const json = z.toJSONSchema(tool.outputSchema, { io: "output" });
			expect(json.type).toBe("object");
		}
	});

	test("no tool name collides with reserved JSON-RPC method names", () => {
		const reserved = new Set(["initialize", "ping", "notifications/initialized"]);
		for (const tool of tools) {
			expect(reserved.has(tool.name)).toBe(false);
		}
	});

	test("schemas are JSON-serializable after conversion (round-trip)", () => {
		for (const tool of tools) {
			const inJson = z.toJSONSchema(tool.inputSchema, { io: "input" });
			expect(() => JSON.parse(JSON.stringify(inJson))).not.toThrow();
			if (tool.outputSchema) {
				const outJson = z.toJSONSchema(tool.outputSchema, { io: "output" });
				expect(() => JSON.parse(JSON.stringify(outJson))).not.toThrow();
			}
		}
	});

	test("at least one tool exists per declared capability used", () => {
		const capabilities = new Set(tools.map((t) => t.metadata.capability));
		expect(capabilities.has("analytics")).toBe(true);
	});

	test("tool registry size is reasonable (>=10, <=200)", () => {
		expect(tools.length).toBeGreaterThanOrEqual(10);
		expect(tools.length).toBeLessThanOrEqual(200);
	});

	test("input schemas allow JSON-RPC empty object input (no required-field surprises for zero-arg tools)", () => {
		for (const tool of tools) {
			const json = z.toJSONSchema(tool.inputSchema, { io: "input" });
			if ((json.required as string[] | undefined)?.length === 0) {
				expect(tool.inputSchema.safeParse({}).success).toBe(true);
			}
		}
	});
});
