import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyGithubSignature } from "./github";

const SECRET = "test-secret";

function sign(body: string): string {
	return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

describe("verifyGithubSignature", () => {
	it("accepts a valid signature", () => {
		const body = JSON.stringify({ action: "deleted" });
		expect(verifyGithubSignature(body, sign(body), SECRET)).toBe(true);
	});

	it("rejects a tampered body", () => {
		const body = JSON.stringify({ action: "deleted" });
		expect(verifyGithubSignature(`${body} `, sign(body), SECRET)).toBe(false);
	});

	it("rejects a wrong secret", () => {
		const body = "{}";
		const signature = `sha256=${createHmac("sha256", "other").update(body).digest("hex")}`;
		expect(verifyGithubSignature(body, signature, SECRET)).toBe(false);
	});

	it("rejects missing or malformed headers", () => {
		expect(verifyGithubSignature("{}", null, SECRET)).toBe(false);
		expect(verifyGithubSignature("{}", "sha1=abc", SECRET)).toBe(false);
		expect(verifyGithubSignature("{}", "sha256=", SECRET)).toBe(false);
	});
});
