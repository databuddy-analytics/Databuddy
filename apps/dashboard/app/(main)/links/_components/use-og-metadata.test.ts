import { describe, expect, test } from "bun:test";
import { getProxiedImageUrl } from "./use-og-metadata";

describe("getProxiedImageUrl", () => {
	test("keeps local paths local but proxies protocol-relative URLs", () => {
		expect(getProxiedImageUrl("/images/preview.png")).toBe(
			"/images/preview.png"
		);
		expect(getProxiedImageUrl("//untrusted.example/image.png")).toBe(
			"/api/image-proxy?url=%2F%2Funtrusted.example%2Fimage.png"
		);
	});
});
