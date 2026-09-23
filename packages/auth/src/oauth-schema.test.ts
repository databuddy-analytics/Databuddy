import { describe, expect, test } from "bun:test";
import {
	jwks,
	oauthAccessToken,
	oauthClient,
	oauthClientAssertion,
	oauthClientResource,
	oauthConsent,
	oauthRefreshToken,
	oauthResource,
} from "@databuddy/db/schema";
import { getSchema } from "better-auth/db";
import { oauthAuthOptions } from "./oauth";

const OAUTH_TABLES = {
	jwks,
	oauthAccessToken,
	oauthClient,
	oauthClientAssertion,
	oauthClientResource,
	oauthConsent,
	oauthRefreshToken,
	oauthResource,
} as const;

type OAuthModel = keyof typeof OAUTH_TABLES;

const OAUTH_MODELS = Object.keys(OAUTH_TABLES) as OAuthModel[];

function expectedOAuthSchema() {
	return getSchema(oauthAuthOptions);
}

type ColumnShape = { notNull?: boolean } | undefined;

function column(model: OAuthModel, field: string): ColumnShape {
	return Reflect.get(OAUTH_TABLES[model], field) as ColumnShape;
}

describe("OAuth provider tables match Better Auth", () => {
	test("every model Better Auth expects is exported under its model name", () => {
		const expected = expectedOAuthSchema();

		for (const model of OAUTH_MODELS) {
			expect(expected[model]).toBeDefined();
			expect(OAUTH_TABLES[model]).toBeDefined();
		}
	});

	test("every field resolves on the Drizzle table by its Better Auth name", () => {
		const expected = expectedOAuthSchema();
		const missing: string[] = [];

		for (const model of OAUTH_MODELS) {
			for (const field of Object.keys(expected[model].fields)) {
				if (!column(model, field)) {
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
				const target = column(model, field);
				if (!target) {
					continue;
				}
				const shouldBeNotNull = attribute.required !== false;
				if (shouldBeNotNull !== Boolean(target.notNull)) {
					mismatched.push(
						`${model}.${field} expected notNull=${shouldBeNotNull}`
					);
				}
			}
		}

		expect(mismatched).toEqual([]);
	});
});
