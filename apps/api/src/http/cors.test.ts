import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
import { describe, expect, it } from "vitest";
import {
	isAllowedApiOrigin,
	rejectInvalidMcpOrigin,
	rejectUnsupportedMcpMethod,
} from "./cors";

describe("MCP CORS", () => {
	it("rejects an invalid MCP preflight before CORS short-circuits it", async () => {
		const app = new Elysia()
			.onRequest(({ request }) => rejectInvalidMcpOrigin(request))
			.use(cors({ credentials: true, origin: isAllowedApiOrigin }));

		const response = await app.handle(
			new Request("https://api.databuddy.test/v1/mcp", {
				method: "OPTIONS",
				headers: {
					"access-control-request-method": "POST",
					origin: "https://attacker.example",
				},
			})
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			error: { message: "Forbidden Origin" },
			id: null,
			jsonrpc: "2.0",
		});
	});

	it("limits the MCP method guard to MCP transport routes", () => {
		const discoveryResponse = rejectUnsupportedMcpMethod(
			new Request("https://api.databuddy.test/.well-known/mcp")
		);
		const mcpResponse = rejectUnsupportedMcpMethod(
			new Request("https://api.databuddy.test/v1/mcp")
		);

		expect(discoveryResponse).toBeUndefined();
		expect(mcpResponse?.status).toBe(405);
		expect(mcpResponse?.headers.get("allow")).toBe("POST");
	});
});
