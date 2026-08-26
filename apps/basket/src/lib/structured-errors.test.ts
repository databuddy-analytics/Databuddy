import { describe, expect, test } from "vitest";
import { createError, EvlogError } from "evlog";
import {
	basketErrors,
	buildBasketErrorPayload,
	createIngestSchemaValidationError,
	deliveryUnavailable,
	isIngestSchemaValidationError,
	rethrowOrWrap,
} from "./structured-errors";

describe("basketErrors", () => {
	test("client-facing HTTP statuses match the published contract", () => {
		const statuses: Partial<Record<keyof typeof basketErrors, number>> = {
			trackPayloadTooLarge: 413,
			trackInvalidBody: 400,
			trackMissingScope: 403,
			trackMissingOwner: 400,
			trackMissingCredentials: 401,
			trackWebsiteNotFound: 404,
			trackWebsiteScopeMismatch: 403,
			trackRateLimited: 429,
			ingestPayloadTooLarge: 413,
			ingestMissingClientId: 400,
			ingestInvalidClientId: 400,
			websiteLookupUnavailable: 503,
			ingestOriginNotAuthorized: 403,
			ingestIpNotAuthorized: 403,
			ingestUnknownEventType: 400,
			billingLimitExceeded: 402,
			billingCheckUnavailable: 503,
			webhookEndpointNotFound: 404,
			webhookMissingSignature: 400,
			webhookInvalidSignature: 401,
			webhookProcessingFailed: 500,
		};

		for (const [key, status] of Object.entries(statuses)) {
			const error = basketErrors[key as keyof typeof basketErrors]();
			expect(error).toBeInstanceOf(EvlogError);
			expect({ key, status: error.status }).toEqual({ key, status });
		}
	});
});

describe("IngestSchemaValidationError", () => {
	test("create → EvlogError with issues", () => {
		const issues = [
			{ message: "required", path: ["name"], code: "invalid_type" },
		];
		const err = createIngestSchemaValidationError(issues as any);
		expect(err).toBeInstanceOf(EvlogError);
		expect(err.status).toBe(400);
		expect(err.issues).toBe(issues);
	});

	test("isIngestSchemaValidationError detects it", () => {
		const issues = [{ message: "x", path: [], code: "custom" }];
		const err = createIngestSchemaValidationError(issues as any);
		expect(isIngestSchemaValidationError(err)).toBe(true);
	});

	test("isIngestSchemaValidationError rejects plain Error", () => {
		expect(isIngestSchemaValidationError(new Error("nope"))).toBe(false);
	});

	test("isIngestSchemaValidationError rejects EvlogError without issues", () => {
		const err = createError({ message: "x", status: 400 });
		expect(isIngestSchemaValidationError(err)).toBe(false);
	});

	test("isIngestSchemaValidationError rejects non-error", () => {
		expect(isIngestSchemaValidationError("string")).toBe(false);
		expect(isIngestSchemaValidationError(null)).toBe(false);
		expect(isIngestSchemaValidationError(undefined)).toBe(false);
	});
});

describe("deliveryUnavailable", () => {
	test("creates a retryable structured 503", () => {
		const error = deliveryUnavailable(new Error("Redis unavailable"));

		expect(error).toMatchObject({
			code: "basket.DELIVERY_UNAVAILABLE",
			status: 503,
		});
	});
});

describe("rethrowOrWrap", () => {
	test("re-throws EvlogError as-is", () => {
		const original = createError({ message: "auth", status: 401 });
		expect(() => rethrowOrWrap(original)).toThrow(original);
	});

	test.each([
		["plain Error", new Error("boom")],
		["string", "string error"],
	])("wraps %s into an EvlogError 500", (_label, input) => {
		let caught: unknown;
		try {
			rethrowOrWrap(input);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(EvlogError);
		expect((caught as EvlogError).status).toBe(500);
	});

	test("logs unexpected errors but stays silent for structured ones", () => {
		const logged: Error[] = [];
		const mockLog = { error: (err: Error) => logged.push(err) };

		expect(() => rethrowOrWrap(new Error("test"), mockLog)).toThrow();
		expect(logged.map((error) => error.message)).toEqual(["test"]);

		expect(() =>
			rethrowOrWrap(createError({ message: "x", status: 400 }), mockLog)
		).toThrow();
		expect(logged).toHaveLength(1);
	});
});

describe("buildBasketErrorPayload", () => {
	test("4xx EvlogError → exposes why/fix", () => {
		const err = createError({
			message: "Missing ID",
			status: 400,
			why: "no id",
			fix: "add id",
		});
		const { status, payload } = buildBasketErrorPayload(err);
		expect(status).toBe(400);
		expect(payload.success).toBe(false);
		expect(payload.why).toBe("no id");
		expect(payload.fix).toBe("add id");
		expect(payload.retryable).toBe(false);
	});

	test("temporary dependency errors tell clients to retry", () => {
		const { status, payload } = buildBasketErrorPayload(
			basketErrors.websiteLookupUnavailable(),
			{ extra: { requestId: "req_example" } }
		);
		expect(status).toBe(503);
		expect(payload).toMatchObject({
			code: basketErrors.websiteLookupUnavailable.code,
			retryable: true,
			requestId: "req_example",
		});
	});

	test("5xx Error in production → hides message", () => {
		const original = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		try {
			const { status, payload } = buildBasketErrorPayload(
				new Error("secret db info")
			);
			expect(status).toBe(500);
			expect(payload.error).toBe("An internal server error occurred");
			expect(payload.message).toBe("An internal server error occurred");
			expect(payload.why).toBeUndefined();
		} finally {
			process.env.NODE_ENV = original;
		}
	});

	test("5xx Error in development → exposes message", () => {
		const original = process.env.NODE_ENV;
		process.env.NODE_ENV = "development";
		try {
			const { payload } = buildBasketErrorPayload(new Error("debug info"));
			expect(payload.error).toBe("debug info");
		} finally {
			process.env.NODE_ENV = original;
		}
	});

	test("IngestSchemaValidationError → includes issues", () => {
		const issues = [{ message: "bad", path: ["x"], code: "custom" }];
		const err = createIngestSchemaValidationError(issues as any);
		const { payload } = buildBasketErrorPayload(err);
		expect(payload.errors).toEqual([
			{ code: "custom", field: "x", message: "bad" },
		]);
	});

	test("respects elysiaCode option", () => {
		const { payload } = buildBasketErrorPayload(new Error("x"), {
			elysiaCode: "NOT_FOUND",
		});
		expect(payload.code).toBe("NOT_FOUND");
	});

	test("default elysiaCode → INTERNAL_SERVER_ERROR", () => {
		const { payload } = buildBasketErrorPayload(new Error("x"));
		expect(payload.code).toBe("INTERNAL_SERVER_ERROR");
	});

	test("extra fields merged into payload", () => {
		const { payload } = buildBasketErrorPayload(new Error("x"), {
			extra: { batch: true, count: 5 },
		});
		expect(payload.batch).toBe(true);
		expect(payload.count).toBe(5);
	});

	test("non-Error input → string coercion", () => {
		const { status, payload } = buildBasketErrorPayload("raw string error");
		expect(status).toBe(500);
		expect(typeof payload.error).toBe("string");
	});

	test("4xx EvlogError → exposes message even in production", () => {
		const original = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		try {
			const err = createError({ message: "Origin not authorized", status: 403 });
			const { payload } = buildBasketErrorPayload(err);
			expect(payload.error).toBe("Origin not authorized");
			expect(payload.message).toBe("Origin not authorized");
		} finally {
			process.env.NODE_ENV = original;
		}
	});
});
