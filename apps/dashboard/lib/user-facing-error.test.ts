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
});
