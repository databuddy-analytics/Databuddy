import { describe, expect, it } from "bun:test";
import { buildHttpErrorResponse } from "./http-error-response";

describe("buildHttpErrorResponse", () => {
	it("preserves Elysia not-found semantics", () => {
		expect(
			buildHttpErrorResponse({ code: "NOT_FOUND", error: new Error("missing") })
		).toEqual({
			status: 404,
			payload: {
				success: false,
				error: "Not found",
				code: "NOT_FOUND",
			},
		});
	});

	it("preserves validation semantics", () => {
		expect(
			buildHttpErrorResponse({
				code: "VALIDATION",
				error: new Error("invalid body"),
			})
		).toEqual({
			status: 422,
			payload: {
				success: false,
				error: "Invalid request",
				code: "VALIDATION",
			},
		});
	});

	it("uses object status for custom client errors", () => {
		expect(
			buildHttpErrorResponse({
				error: { status: 429, message: "too many requests" },
			})
		).toEqual({
			status: 429,
			payload: {
				success: false,
				error: "Rate limit exceeded",
				code: "HTTP_429",
			},
		});
	});

	it("does not expose unknown client error codes", () => {
		expect(
			buildHttpErrorResponse({
				code: "PRIVATE_PROVIDER_LIMIT",
				error: { status: 429, message: "provider key is rate limited" },
			})
		).toEqual({
			status: 429,
			payload: {
				success: false,
				error: "Rate limit exceeded",
				code: "HTTP_429",
			},
		});
	});

	it("treats numeric codes as status values, not public error codes", () => {
		expect(buildHttpErrorResponse({ code: 404, error: new Error("missing") })).toEqual({
			status: 404,
			payload: {
				success: false,
				error: "Not found",
				code: "HTTP_404",
			},
		});
	});

	it("falls back to internal server error for unknown failures", () => {
		expect(buildHttpErrorResponse({ error: new Error("boom") })).toEqual({
			status: 500,
			payload: {
				success: false,
				error: "Internal server error",
				code: "INTERNAL_SERVER_ERROR",
			},
		});
	});
});
