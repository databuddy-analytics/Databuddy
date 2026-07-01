import { describe, expect, test } from "vitest";
import { createError, EvlogError } from "evlog";
import {
	basketErrors,
	buildBasketErrorPayload,
	createIngestSchemaValidationError,
	isIngestSchemaValidationError,
	rethrowOrWrap,
} from "./structured-errors";

// ── basketErrors factories ──

describe("basketErrors", () => {
	const errorTable: [keyof typeof basketErrors, number][] = [
		["trackPayloadTooLarge", 413],
		["trackInvalidBody", 400],
		["trackMissingScope", 403],
		["trackMissingOwner", 400],
		["trackMissingCredentials", 401],
		["trackWebsiteNotFound", 404],
		["trackWebsiteNoOrganization", 400],
		["trackWebsiteScopeMismatch", 403],
		["trackRateLimited", 429],
		["ingestPayloadTooLarge", 413],
		["ingestMissingClientId", 400],
		["ingestInvalidClientId", 400],
		["ingestOriginNotAuthorized", 403],
		["ingestIpNotAuthorized", 403],
		["ingestWebsiteMissingOrganization", 400],
		["ingestUnknownEventType", 400],
		["ingestBatchNotArray", 400],
		["ingestBatchTooLarge", 400],
		["billingLimitExceeded", 402],
		["billingCheckUnavailable", 503],
	];

	for (const [key, expectedStatus] of errorTable) {
		test(`${key} → EvlogError with status ${expectedStatus}`, () => {
			const err = basketErrors[key]();
			expect(err).toBeInstanceOf(EvlogError);
			expect(err.code).toBe(basketErrors[key].code);
			expect(err.status).toBe(expectedStatus);
			expect(err.message).toBeTruthy();
		});
	}
});

// ── createIngestSchemaValidationError / isIngestSchemaValidationError ──

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

// ── rethrowOrWrap ──

describe("rethrowOrWrap", () => {
	test("re-throws EvlogError as-is", () => {
		const original = createError({ message: "auth", status: 401 });
		expect(() => rethrowOrWrap(original)).toThrow(original);
	});

	test("wraps plain Error → EvlogError 500", () => {
		try {
			rethrowOrWrap(new Error("boom"));
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(EvlogError);
			expect((e as EvlogError).status).toBe(500);
		}
	});

	test("wraps string → EvlogError 500", () => {
		try {
			rethrowOrWrap("string error");
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(EvlogError);
			expect((e as EvlogError).status).toBe(500);
		}
	});

	test("calls log.error for non-EvlogError", () => {
		let logged: Error | null = null;
		const mockLog = {
			error: (err: Error) => {
				logged = err;
			},
		};
		try {
			rethrowOrWrap(new Error("test"), mockLog);
		} catch {
			/* expected */
		}
		expect(logged).toBeInstanceOf(Error);
		expect(logged!.message).toBe("test");
	});

	test("does NOT call log.error for EvlogError", () => {
		let called = false;
		const mockLog = {
			error: () => {
				called = true;
			},
		};
		try {
			rethrowOrWrap(createError({ message: "x", status: 400 }), mockLog);
		} catch {
			/* expected */
		}
		expect(called).toBe(false);
	});
});

// ── buildBasketErrorPayload ──

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
