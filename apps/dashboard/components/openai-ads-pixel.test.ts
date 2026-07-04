import { describe, expect, it } from "bun:test";
import {
	buildOpenAiRegistrationConversionPayload,
	buildOpenAiRegistrationMeasureArgs,
	isOpenAiAdsPixelHostAllowed,
} from "./openai-ads-pixel";

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

	it("builds a registration payload with the OpenAI reference", () => {
		expect(
			buildOpenAiRegistrationConversionPayload({
				email: "founder@example.com",
				eventId: "conversion-1",
				properties: {
					method: "email",
					oppref: "openai-reference",
					utm_source: "openai_ads",
				},
				sourceUrl: "https://app.databuddy.cc/register?utm_source=openai_ads",
			})
		).toEqual({
			email: "founder@example.com",
			eventId: "conversion-1",
			oppref: "openai-reference",
			sourceUrl: "https://app.databuddy.cc/register?utm_source=openai_ads",
		});
	});

	it("passes event_id as the pixel options argument for dedupe", () => {
		expect(buildOpenAiRegistrationMeasureArgs("conversion-1")).toEqual([
			"measure",
			"registration_completed",
			{ type: "customer_action" },
			{ event_id: "conversion-1" },
		]);
	});
});
