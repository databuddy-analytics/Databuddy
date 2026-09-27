import { describe, expect, test } from "vitest";
import { API_KEY_AUTH_CHALLENGE } from "@databuddy/api-keys/resolve";
import { discovery } from "./discovery";

describe("agent discovery", () => {
	test("publishes protected resource metadata for MCP clients", async () => {
		const response = await discovery.handle(
			new Request("http://localhost/.well-known/oauth-protected-resource")
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			bearer_methods_supported: ["header"],
		});
	});

	test("does not expose credential-automation endpoints", async () => {
		const claim = await discovery.handle(
			new Request("http://localhost/agent-auth/claim", { method: "POST" })
		);

		expect(claim.status).toBe(404);
	});

	test("uses the API-key challenge for protected discovery probes", async () => {
		const response = await discovery.handle(
			new Request("http://localhost/api")
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			API_KEY_AUTH_CHALLENGE
		);
	});
});
