import { describe, expect, test } from "bun:test";
import { API_KEY_AUTH_CHALLENGE } from "@databuddy/api-keys/resolve";
import { discovery } from "./discovery";

describe("agent discovery", () => {
	test("does not expose unimplemented OAuth or credential-automation endpoints", async () => {
		const metadata = await discovery.handle(
			new Request(
				"http://localhost/.well-known/oauth-protected-resource"
			)
		);
		const claim = await discovery.handle(
			new Request("http://localhost/agent-auth/claim", { method: "POST" })
		);

		expect(metadata.status).toBe(404);
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
