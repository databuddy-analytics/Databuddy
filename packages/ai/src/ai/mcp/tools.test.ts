import { createInternalPrincipal } from "@databuddy/rpc";
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { handleDatabuddyMcpRequest } from "../../mcp/http";
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

describe("MCP tool invariants", () => {
	test("create_link matches the HTTP(S) and deep-link app contract", () => {
		const createLink = tools.find((tool) => tool.name === "create_link");
		if (!createLink) {
			throw new Error("create_link tool is not registered");
		}

		expect(
			createLink.inputSchema.safeParse({
				confirmed: false,
				name: "Unsafe link",
				targetUrl: "javascript:alert(1)",
				websiteId: "website-1",
			}).success
		).toBe(false);
		expect(
			createLink.inputSchema.safeParse({
				confirmed: false,
				deepLinkApp: "instagram",
				name: "Mismatched app",
				targetUrl: "https://example.com",
				websiteId: "website-1",
			}).success
		).toBe(false);
		expect(
			createLink.inputSchema.safeParse({
				confirmed: false,
				deepLinkApp: "unknown",
				name: "Unknown app",
				targetUrl: "https://example.com",
				websiteId: "website-1",
			}).success
		).toBe(false);
		expect(
			createLink.inputSchema.safeParse({
				confirmed: false,
				deepLinkApp: "instagram",
				name: "Instagram profile",
				targetUrl: "https://instagram.com/databuddy",
				websiteId: "website-1",
			}).success
		).toBe(true);
	});

	test("tool names are unique snake_case", () => {
		const names = tools.map((tool) => tool.name);
		expect(new Set(names).size).toBe(names.length);
		for (const name of names) {
			expect(name).toMatch(TOOL_NAME_RE);
		}
	});

	test("tools have bounded descriptions, metadata, and handlers", () => {
		for (const tool of tools) {
			expect(tool.description.length).toBeGreaterThan(0);
			expect(tool.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LEN);
			expect(tool.metadata.access.kind).toMatch(/^(read|write)$/);
			expect(tool.metadata.capability).toMatch(/^(analytics|workspace)$/);
			expect(typeof tool.handler).toBe("function");
		}
	});

	test("write tools declare scopes", () => {
		const writers = tools.filter(
			(tool) => tool.metadata.access.kind === "write"
		);
		expect(writers.length).toBeGreaterThan(0);
		for (const tool of writers) {
			expect(tool.metadata.access.scopes?.length ?? 0).toBeGreaterThan(0);
		}
	});

	test("schemas render as JSON-RPC objects", () => {
		for (const tool of tools) {
			const input = z.toJSONSchema(tool.inputSchema, { io: "input" });
			expect(input.type).toBe("object");
			expect(() => JSON.parse(JSON.stringify(input))).not.toThrow();
			if (tool.outputSchema) {
				const output = z.toJSONSchema(tool.outputSchema, { io: "output" });
				expect(output.type).toBe("object");
				expect(() => JSON.parse(JSON.stringify(output))).not.toThrow();
			}
		}
	});

	test("zero-argument schemas accept an empty object", () => {
		for (const tool of tools) {
			const schema = z.toJSONSchema(tool.inputSchema, { io: "input" });
			if ((schema.required as string[] | undefined)?.length === 0) {
				expect(tool.inputSchema.safeParse({}).success).toBe(true);
			}
		}
	});

	test("avoids reserved methods", () => {
		const reserved = new Set(["initialize", "ping", "notifications/initialized"]);
		for (const tool of tools) {
			expect(reserved.has(tool.name)).toBe(false);
		}
	});
});

describe("investigation tools", () => {
	test("publishes the investigation lifecycle to a website-scoped key", async () => {
		const principal = createInternalPrincipal({
			metadata: {
				resources: {
					"website:site-1": ["read:data", "manage:websites"],
				},
			},
			organizationId: "org-1",
			scopes: [],
		});
		const response = await handleDatabuddyMcpRequest({
			apiKey: principal.apiKey,
			organizationId: "org-1",
			request: new Request("https://api.databuddy.test/v1/mcp", {
				body: JSON.stringify({
					id: 1,
					jsonrpc: "2.0",
					method: "tools/list",
					params: {},
				}),
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
				},
				method: "POST",
			}),
			requestHeaders: new Headers(),
			userId: null,
		});
		const body = (await response.json()) as {
			result?: { tools?: Array<{ name: string }> };
		};
		const names = new Set(body.result?.tools?.map((tool) => tool.name));

		expect(response.status).toBe(200);
		for (const name of [
			"list_insights",
			"list_investigations",
			"get_investigation",
			"reply_to_investigation",
		]) {
			expect(names.has(name)).toBe(true);
		}
	});

	test("exposes published insights and the durable investigation lifecycle", () => {
		const byName = new Map(tools.map((tool) => [tool.name, tool]));

		expect(byName.get("list_insights")?.metadata).toMatchObject({
			access: { kind: "read", scopes: ["read:data"] },
		});
		expect(byName.get("list_investigations")?.metadata).toMatchObject({
			access: { kind: "read", scopes: ["read:data"] },
		});
		expect(byName.get("get_investigation")?.metadata).toMatchObject({
			access: { kind: "read", scopes: ["read:data"] },
		});
		expect(byName.get("reply_to_investigation")?.metadata).toMatchObject({
			access: { kind: "write", scopes: ["manage:websites"] },
		});
		expect(
			byName.get("reply_to_investigation")?.inputSchema.safeParse({
				body: "The deploy completed at noon.",
				investigationId: "investigation-1",
				replyId: "mcp-request-1",
			}).success
		).toBe(true);
		expect(
			byName.get("reply_to_investigation")?.inputSchema.safeParse({
				body: "The deploy completed at noon.",
				investigationId: "investigation-1",
				replyId: "mcp:request:1",
			}).success
		).toBe(false);
		expect(
			byName.get("reply_to_investigation")?.inputSchema.safeParse({
				body: "The deploy completed at noon.",
				investigationId: "investigation-1",
			}).success
		).toBe(false);

	});
});
