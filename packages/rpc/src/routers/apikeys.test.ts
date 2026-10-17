import { describe, expect, it } from "bun:test";
import type { AnyProcedure } from "@orpc/server";
import { apiKeyExpiresAtSchema, apikeysRouter } from "./apikeys";

const DAY_MS = 86_400_000;

async function inputIssues(procedure: AnyProcedure, input: unknown) {
	const schema = procedure["~orpc"].inputSchema;
	if (!schema) {
		throw new Error("Procedure has no input schema");
	}
	const result = await schema["~standard"].validate(input);
	return result.issues;
}

describe("API key expiration input", () => {
	it("rejects values that are not ISO 8601 timestamps with a timezone", () => {
		for (const value of ["tomorrow", "2030-01-01", "2030-01-01T00:00:00"]) {
			expect(apiKeyExpiresAtSchema.safeParse(value).success).toBe(false);
		}
	});

	it("rejects timestamps that are not in the future", () => {
		const past = new Date(Date.now() - DAY_MS).toISOString();
		expect(apiKeyExpiresAtSchema.safeParse(past).success).toBe(false);
	});

	it("accepts future timestamps in UTC or with an offset", () => {
		const future = new Date(Date.now() + DAY_MS);
		const withOffset = `${future.toISOString().slice(0, 19)}+02:00`;
		expect(apiKeyExpiresAtSchema.safeParse(future.toISOString()).success).toBe(
			true
		);
		expect(apiKeyExpiresAtSchema.safeParse(withOffset).success).toBe(true);
	});

	it("lets create omit the expiration and update clear it", async () => {
		expect(
			await inputIssues(apikeysRouter.create, {
				name: "Deploy key",
				organizationId: "org",
			})
		).toBeUndefined();
		expect(
			await inputIssues(apikeysRouter.update, {
				id: "key",
				expiresAt: null,
			})
		).toBeUndefined();
		expect(
			await inputIssues(apikeysRouter.update, {
				id: "key",
				expiresAt: "2000-01-01T00:00:00.000Z",
			})
		).toHaveLength(1);
	});
});
