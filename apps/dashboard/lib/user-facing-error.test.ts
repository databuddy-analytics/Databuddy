import { describe, expect, it } from "bun:test";
import {
	DEFAULT_USER_ERROR_MESSAGE,
	getUserFacingErrorMessage,
} from "./user-facing-error";

describe("getUserFacingErrorMessage", () => {
	it("maps structured error codes without exposing server messages", () => {
		expect(
			getUserFacingErrorMessage({
				data: { code: "RATE_LIMITED" },
				message: "redis limiter tenant=secret-key failed",
			})
		).toBe("Too many requests. Wait a moment and try again.");
	});

	it("maps HTTP status codes", () => {
		expect(getUserFacingErrorMessage({ status: 404 })).toBe(
			"That item could not be found. It may have been removed."
		);
	});

	it("uses a safe fallback for unknown internal errors", () => {
		expect(
			getUserFacingErrorMessage(new Error("postgres relation users failed"))
		).toBe(DEFAULT_USER_ERROR_MESSAGE);
	});

	it("shows the server-authored message for plan limit errors", () => {
		expect(
			getUserFacingErrorMessage({
				code: "PLAN_LIMIT_EXCEEDED",
				status: 402,
				message:
					"Your Free plan includes 1 funnel. Delete one or upgrade to Hobby to create more.",
			})
		).toBe(
			"Your Free plan includes 1 funnel. Delete one or upgrade to Hobby to create more."
		);
	});

	it("falls back to plan limit copy when no message is present", () => {
		expect(
			getUserFacingErrorMessage({ code: "PLAN_LIMIT_EXCEEDED", status: 402 })
		).toBe("You have reached your plan's limit. Upgrade to create more.");
	});

	it("does not mistranslate feature gating as a permissions error", () => {
		expect(
			getUserFacingErrorMessage({
				code: "FEATURE_UNAVAILABLE",
				status: 403,
				message:
					"Error Tracking is not available on your plan. Upgrade to Hobby to unlock it.",
			})
		).toBe(
			"Error Tracking is not available on your plan. Upgrade to Hobby to unlock it."
		);
	});

	it("maps a bare 402 status to plan limit copy", () => {
		expect(getUserFacingErrorMessage({ status: 402 })).toBe(
			"You have reached your plan's limit. Upgrade to create more."
		);
	});

	it("shows server-authored conflict messages", () => {
		expect(
			getUserFacingErrorMessage({
				data: { code: "CONFLICT" },
				message: 'A website with the domain "stowlink.app" already exists.',
			})
		).toBe('A website with the domain "stowlink.app" already exists.');
	});

	it("ignores non-sentence server messages for authored codes", () => {
		expect(
			getUserFacingErrorMessage({ data: { code: "FORBIDDEN" }, message: "Forbidden" })
		).toBe("You do not have permission to do that.");
	});
});
