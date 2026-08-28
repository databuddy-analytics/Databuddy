import { describe, expect, it } from "bun:test";
import {
	APP_EVENTS,
	MARKETING_PARAM_KEYS,
	SIGNUP_METHODS,
	UTM_PARAM_KEYS,
	isSignupMethod,
	readMarketingProperties,
	readUtmProperties,
} from "./custom-events";

const SNAKE_CASE_EVENT_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

describe("custom event helpers", () => {
	it("keeps app event names uniform", () => {
		expect(new Set(Object.values(APP_EVENTS)).size).toBe(
			Object.values(APP_EVENTS).length
		);

		for (const eventName of Object.values(APP_EVENTS)) {
			expect(eventName).toMatch(SNAKE_CASE_EVENT_NAME);
		}
	});

	it("keeps marketing params a unique superset of UTM params", () => {
		expect(new Set(MARKETING_PARAM_KEYS).size).toBe(MARKETING_PARAM_KEYS.length);
		for (const key of UTM_PARAM_KEYS) {
			expect(MARKETING_PARAM_KEYS).toContain(key);
		}
	});

	it("keeps signup methods typed and parseable", () => {
		for (const method of SIGNUP_METHODS) {
			expect(isSignupMethod(method)).toBe(true);
		}
		expect(isSignupMethod("github")).toBe(false);
		expect(isSignupMethod(null)).toBe(false);
	});

	it("reads only trimmed UTM properties", () => {
		const params = new URLSearchParams({
			utm_source: " openai_ads ",
			utm_medium: "cpc",
			utm_campaign: "x".repeat(200),
			gclid: "click-id",
		});

		expect(readUtmProperties(params)).toEqual({
			utm_source: "openai_ads",
			utm_medium: "cpc",
			utm_campaign: "x".repeat(160),
		});
	});

	it("reads all trimmed marketing properties for signup attribution", () => {
		const params = new URLSearchParams({
			fbclid: "fb-click",
			oppref: " openai-reference ",
			utm_campaign: "competitors",
			utm_content: "ask_why_signups_dropped",
			utm_medium: "paid",
			utm_source: "openai_ads",
			wolref: "w".repeat(200),
		});

		expect(readMarketingProperties(params)).toEqual({
			fbclid: "fb-click",
			oppref: "openai-reference",
			utm_campaign: "competitors",
			utm_content: "ask_why_signups_dropped",
			utm_medium: "paid",
			utm_source: "openai_ads",
			wolref: "w".repeat(160),
		});
	});
});
