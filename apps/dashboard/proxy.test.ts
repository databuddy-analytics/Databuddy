import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("dashboard auth proxy", () => {
	it("preserves the requested destination through sign in", () => {
		const response = proxy(
			new NextRequest(
				"http://localhost:3000/invitations/example-invite?source=email"
			)
		);

		expect(response.headers.get("location")).toBe(
			"http://localhost:3000/login?callback=%2Finvitations%2Fexample-invite%3Fsource%3Demail"
		);
	});

	it("allows authentication errors to render without a session", () => {
		const response = proxy(
			new NextRequest("http://localhost:3000/auth/error?error=EXPIRED_TOKEN")
		);

		expect(response.headers.get("location")).toBeNull();
		expect(response.headers.get("x-middleware-next")).toBe("1");
	});

	it("keeps signed-in users on sign-in pages only while resuming OAuth", () => {
		const signedIn = (path: string) =>
			proxy(
				new NextRequest(`http://localhost:3000${path}`, {
					headers: {
						cookie:
							"databuddy.session_token=token; databuddy-dev.session_token=token",
					},
				})
			);
		const authorizeCallback = encodeURIComponent(
			"/api/auth/oauth2/authorize?client_id=https%3A%2F%2Fclaude.ai&prompt=consent"
		);

		expect(
			signedIn(`/login/magic?callback=${authorizeCallback}`).headers.get(
				"location"
			)
		).toBeNull();
		expect(
			signedIn(`/register?callback=${authorizeCallback}`).headers.get(
				"location"
			)
		).toBeNull();
		expect(signedIn("/login?callback=%2Fbilling").headers.get("location")).toBe(
			"http://localhost:3000/websites"
		);
	});
});
