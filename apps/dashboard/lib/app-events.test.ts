import { afterEach, describe, expect, it } from "bun:test";
import { SIGNUP_METHODS } from "@databuddy/shared/custom-events";
import {
	consumePendingSocialSignup,
	isSocialSignupMethod,
	storePendingSocialSignup,
} from "./app-events";

const originalSessionStorage = globalThis.sessionStorage;

function installSessionStorageMock() {
	const storage = new Map<string, string>();

	Object.defineProperty(globalThis, "sessionStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => storage.get(key) ?? null,
			removeItem: (key: string) => {
				storage.delete(key);
			},
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			},
		},
	});
}

afterEach(() => {
	Object.defineProperty(globalThis, "sessionStorage", {
		configurable: true,
		value: originalSessionStorage,
	});
});

describe("isSocialSignupMethod", () => {
	it("derives social methods from the shared signup method list", () => {
		expect(SIGNUP_METHODS.filter(isSocialSignupMethod)).toEqual([
			"social_github",
			"social_google",
		]);
	});

	it("preserves marketing attribution through pending social signup storage", () => {
		installSessionStorageMock();

		storePendingSocialSignup({
			method: "social_google",
			oppref: "openai-reference",
			utm_campaign: "competitors",
			utm_content: "ask_why_signups_dropped",
			utm_medium: "paid",
			utm_source: "openai_ads",
			wolref: "web-origin-reference",
		});

		expect(consumePendingSocialSignup()).toEqual({
			method: "social_google",
			oppref: "openai-reference",
			utm_campaign: "competitors",
			utm_content: "ask_why_signups_dropped",
			utm_medium: "paid",
			utm_source: "openai_ads",
			wolref: "web-origin-reference",
		});
		expect(consumePendingSocialSignup()).toBeNull();
	});
});
