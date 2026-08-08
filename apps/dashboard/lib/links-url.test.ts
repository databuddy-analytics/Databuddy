import { describe, expect, test } from "bun:test";
import {
	getPublicLinkUrl,
	getSafeHttpUrl,
	isPublicLinkSlug,
	LINKS_BASE_URL,
} from "./links-url";

describe("public link URLs", () => {
	test("keeps a malicious slug on the configured link host", () => {
		const url = new URL(getPublicLinkUrl("/evil.example"));

		expect(url.host).toBe(LINKS_BASE_URL);
		expect(url.pathname).toBe("/%2Fevil.example");
	});

	test("recognizes the public link slug contract", () => {
		expect(isPublicLinkSlug("launch_2026")).toBe(true);
		expect(isPublicLinkSlug("ab")).toBe(false);
		expect(isPublicLinkSlug("launch/path")).toBe(false);
	});

	test("permits only absolute HTTP(S) redirect and metadata URLs", () => {
		expect(getSafeHttpUrl("https://example.com/image.png")).toBe(
			"https://example.com/image.png"
		);
		expect(getSafeHttpUrl("javascript:alert(1)")).toBeNull();
		expect(getSafeHttpUrl("data:text/plain,unsafe")).toBeNull();
		expect(getSafeHttpUrl("relative/path")).toBeNull();
	});
});
