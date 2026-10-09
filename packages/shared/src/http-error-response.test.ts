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
				error: "This item was not found. It may have been deleted.",
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
				error: "Some of the details are invalid. Check them and try again.",
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
				error: "Too many requests. Try again shortly.",
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
				error: "Too many requests. Try again shortly.",
				code: "HTTP_429",
			},
		});
	});

	it("treats numeric codes as status values, not public error codes", () => {
		expect(
			buildHttpErrorResponse({ code: 404, error: new Error("missing") })
		).toEqual({
			status: 404,
			payload: {
				success: false,
				error: "This item was not found. It may have been deleted.",
				code: "HTTP_404",
			},
		});
	});

	it("falls back to internal server error for unknown failures", () => {
		expect(buildHttpErrorResponse({ error: new Error("boom") })).toEqual({
			status: 500,
			payload: {
				success: false,
				error: "Something went wrong on our side. Try again in a moment.",
				code: "INTERNAL_SERVER_ERROR",
			},
		});
	});
});
