import { createError } from "evlog";
import { afterEach, describe, expect, it } from "vitest";
import { handleAppError } from "./errors";

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
		});
	});

	it("keeps structured 4xx details visible in production", async () => {
		process.env.NODE_ENV = "production";
		const response = handleAppError({
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
		});
	});
});
