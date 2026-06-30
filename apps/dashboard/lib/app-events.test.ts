import { describe, expect, it } from "bun:test";
import { SIGNUP_METHODS } from "@databuddy/shared/custom-events";
import { isSocialSignupMethod } from "./app-events";

describe("isSocialSignupMethod", () => {
	it("derives social methods from the shared signup method list", () => {
		expect(SIGNUP_METHODS.filter(isSocialSignupMethod)).toEqual([
			"social_github",
			"social_google",
		]);
	});
});
