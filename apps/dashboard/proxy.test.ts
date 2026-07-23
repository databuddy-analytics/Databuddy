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
});
