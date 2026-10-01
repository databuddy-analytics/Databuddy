import { describe, expect, it } from "bun:test";
import { newUserCallbackPath, safeCallbackPath } from "./safe-callback";

describe("safeCallbackPath", () => {
	it("keeps local paths, queries, and fragments", () => {
		expect(safeCallbackPath("/websites/site-1?tab=goals#details")).toBe(
			"/websites/site-1?tab=goals#details"
		);
	});

	it("rejects absolute and protocol-relative URLs", () => {
		for (const callback of [
			"https://attacker.example/path",
			"//attacker.example/path",
			"///attacker.example/path",
		]) {
			expect(safeCallbackPath(callback)).toBe("/websites");
		}
	});

	it("rejects browser-normalized authority bypasses", () => {
		for (const callback of [
			"/\t/attacker.example",
			"/\n/attacker.example",
			"/\r/attacker.example",
			"/\\attacker.example",
			"/%5cattacker.example",
			"/%255cattacker.example",
			"/%2f%2fattacker.example",
		]) {
			expect(safeCallbackPath(callback)).toBe("/websites");
		}
	});

	it("rejects raw and encoded control characters", () => {
		for (const callback of [
			"/path\u0000suffix",
			"/path\u001fsuffix",
			"/path\u007fsuffix",
			"/path%00suffix",
			"/path%250asuffix",
		]) {
			expect(safeCallbackPath(callback, "/login")).toBe("/login");
		}
	});

	it("rejects malformed encoding instead of guessing", () => {
		expect(safeCallbackPath("/path/%not-encoding")).toBe("/websites");
	});

	it("rejects deeply nested encoding instead of relying on a decode limit", () => {
		let encoded = "%2f%2fattacker.example";
		for (let pass = 0; pass < 6; pass += 1) {
			encoded = encodeURIComponent(encoded);
		}

		expect(safeCallbackPath(`/${encoded}`)).toBe("/websites");
	});
});

describe("newUserCallbackPath", () => {
	it("keeps plan checkout and OAuth authorization callbacks", () => {
		for (const callback of [
			"/billing/plans?plan=pro",
			"/api/auth/oauth2/authorize?client_id=https%3A%2F%2Fclaude.ai&prompt=consent",
		]) {
			expect(newUserCallbackPath(callback)).toBe(callback);
		}
	});

	it("sends every other new sign-up to onboarding", () => {
		for (const callback of [
			"/websites",
			"/websites/site-1",
			"/api/auth/oauth2/token",
		]) {
			expect(newUserCallbackPath(callback)).toBe("/onboarding");
		}
	});
});
