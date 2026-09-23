import { describe, expect, test } from "bun:test";
import * as drizzleSchema from "@databuddy/db/schema";
import { getSchema } from "better-auth/db";
import { oauthAuthOptions } from "./oauth";

const OAUTH_MODELS = [
	"jwks",
	"oauthClient",
	"oauthResource",
	"oauthClientResource",
	"oauthRefreshToken",
	"oauthAccessToken",
	"oauthConsent",
	"oauthClientAssertion",
] as const;

function expectedOAuthSchema() {
	return getSchema(oauthAuthOptions);
}

const schema: Record<
	string,
	Record<string, { notNull?: boolean }>
> = drizzleSchema;

describe("OAuth provider tables match Better Auth", () => {
	test("every model Better Auth expects is exported under its model name", () => {
		const expected = expectedOAuthSchema();

		for (const model of OAUTH_MODELS) {
			expect(expected[model]).toBeDefined();
			expect(schema[model]).toBeDefined();
		}
	});

	test("every field resolves on the Drizzle table by its Better Auth name", () => {
		const expected = expectedOAuthSchema();
		const missing: string[] = [];

		for (const model of OAUTH_MODELS) {
			for (const field of Object.keys(expected[model].fields)) {
				if (!schema[model][field]) {
					missing.push(`${model}.${field}`);
				}
			}
		}

		expect(missing).toEqual([]);
	});

	test("nullability follows Better Auth's own required predicate", () => {
		const expected = expectedOAuthSchema();
		const mismatched: string[] = [];

		for (const model of OAUTH_MODELS) {
			for (const [field, attribute] of Object.entries(expected[model].fields)) {
				const column = schema[model][field];
				if (!column) {
					continue;
				}
				const shouldBeNotNull = attribute.required !== false;
				if (shouldBeNotNull !== Boolean(column.notNull)) {
					mismatched.push(
						`${model}.${field} expected notNull=${shouldBeNotNull}`
					);
				}
			}
		}

		expect(mismatched).toEqual([]);
	});
});
