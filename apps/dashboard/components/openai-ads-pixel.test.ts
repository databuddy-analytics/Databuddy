import { describe, expect, it } from "bun:test";
import { isOpenAiAdsPixelHostAllowed } from "./openai-ads-pixel";

describe("isOpenAiAdsPixelHostAllowed", () => {
	it("blocks local development hosts", () => {
		expect(isOpenAiAdsPixelHostAllowed("localhost")).toBe(false);
		expect(isOpenAiAdsPixelHostAllowed("127.0.0.1")).toBe(false);
		expect(isOpenAiAdsPixelHostAllowed("::1")).toBe(false);
		expect(isOpenAiAdsPixelHostAllowed("[::1]")).toBe(false);
		expect(isOpenAiAdsPixelHostAllowed("0.0.0.0")).toBe(false);
	});

	it("allows deployed hosts", () => {
		expect(isOpenAiAdsPixelHostAllowed("app.databuddy.cc")).toBe(true);
		expect(isOpenAiAdsPixelHostAllowed("staging.databuddy.cc")).toBe(true);
	});
});
