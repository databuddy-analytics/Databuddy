import { createError } from "evlog";
import { t, ValidationError } from "elysia";
import { afterEach, describe, expect, it } from "vitest";
import { handleAppError, limitRequestBody } from "./errors";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

async function readPayload(response: Response): Promise<Record<string, unknown>> {
	return response.json() as Promise<Record<string, unknown>>;
}

describe("handleAppError", () => {
	it("masks structured 5xx details in production", async () => {
		process.env.NODE_ENV = "production";
		const response = handleAppError({
			requestId: "req_test_5xx",
			error: createError({
				code: "api.SECRET_FAILURE",
				message: "Database password leaked into error",
				status: 500,
				why: "Internal connection string failed",
				fix: "Rotate credentials",
				link: "https://internal.example.com/runbook",
			}),
		});

		expect(response.status).toBe(500);
			expect(await readPayload(response)).toEqual({
				success: false,
				error: "An internal server error occurred",
				code: "api.SECRET_FAILURE",
				requestId: "req_test_5xx",
			});
			expect(response.headers.get("X-Request-ID")).toBe("req_test_5xx");
	});

	it("keeps structured 4xx details visible in production", async () => {
		process.env.NODE_ENV = "production";
		const response = handleAppError({
			requestId: "req_test_4xx",
			error: createError({
				code: "api.BAD_INPUT",
				message: "Invalid filter",
				status: 400,
				why: "The filter operator is unsupported.",
				fix: "Use one of the documented operators.",
			}),
		});

		expect(response.status).toBe(400);
			expect(await readPayload(response)).toEqual({
			success: false,
			error: "Invalid filter",
			code: "api.BAD_INPUT",
			why: "The filter operator is unsupported.",
				fix: "Use one of the documented operators.",
				requestId: "req_test_4xx",
			});
	});

	it("returns safe field details for request validation errors", async () => {
		process.env.NODE_ENV = "production";
		const response = handleAppError({
			code: "VALIDATION",
			requestId: "req_test_validation",
			error: new ValidationError(
				"body",
				t.Object({ name: t.String({ minLength: 1 }) }),
				{}
			),
		});
		const payload = await readPayload(response);

		expect(response.status).toBe(422);
		expect(payload).toMatchObject({
			success: false,
			error: "Invalid request",
			code: "VALIDATION",
			requestId: "req_test_validation",
		});
		expect(payload.details).toEqual([
			{ field: "body.name", message: "Invalid value" },
		]);
	});

	it("does not reflect Elysia validation values or messages in production", async () => {
		process.env.NODE_ENV = "production";
		const response = handleAppError({
			code: "VALIDATION",
			requestId: "req_test_reflection",
			error: new ValidationError(
				"body",
				t.Object({ profile: t.Object({ email: t.String() }) }),
				{ profile: { email: 867_530_900 } }
			),
		});
		const payload = await readPayload(response);
		const serialized = JSON.stringify(payload);

		expect(payload.details).toEqual([
			{ field: "body.profile.email", message: "Invalid value" },
		]);
		expect(serialized).not.toContain("867530900");
		expect(serialized).not.toContain("Expected");
		expect(serialized).not.toContain("found");
	});
});

describe("limitRequestBody", () => {
	it("rebuilds request bodies within the byte limit", async () => {
		const request = new Request("http://localhost/dql/execute", {
			body: '{"sql":"SELECT 1"}',
			headers: { authorization: "Bearer test" },
			method: "POST",
		});

		const limited = await limitRequestBody(request, 32);

		expect(limited).toBe(request);
		expect(await limited.text()).toBe('{"sql":"SELECT 1"}');
		expect(limited.headers.get("authorization")).toBe("Bearer test");
	});

	it("rejects streamed or declared bodies over the byte limit", async () => {
		await expect(
			limitRequestBody(
				new Request("http://localhost/dql/execute", {
					body: "12345",
					method: "POST",
				}),
				4
			)
		).rejects.toMatchObject({
			code: "PAYLOAD_TOO_LARGE",
			status: 413,
		});

		await expect(
			limitRequestBody(
				new Request("http://localhost/dql/execute", {
					body: "x",
					headers: { "content-length": "100" },
					method: "POST",
				}),
				4
			)
		).rejects.toMatchObject({
			code: "PAYLOAD_TOO_LARGE",
			status: 413,
		});
	});
});
