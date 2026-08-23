import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { account, twoFactor } from "./auth";

describe("Better Auth 1.7 account identity schema", () => {
	test("requires a trusted issuer on every account row", () => {
		const issuer = getTableConfig(account).columns.find(
			(column) => column.name === "issuer"
		);

		expect(issuer?.notNull).toBe(true);
		expect(issuer?.dataType).toBe("string");
	});

	test("uniquely scopes provider account IDs by issuer", () => {
		const identityIndex = getTableConfig(account).indexes.find(
			(index) => index.config.name === "accounts_issuer_account_unique"
		);

		expect(identityIndex?.config.unique).toBe(true);
		expect(identityIndex?.config.columns.map((column) => column.name)).toEqual([
			"issuer",
			"account_id",
		]);
	});
});

describe("Better Auth two-factor schema", () => {
	test("supports verified enrollment and account lockout state", () => {
		const columns = new Map(
			getTableConfig(twoFactor).columns.map((column) => [column.name, column])
		);

		expect(columns.get("verified")?.notNull).toBe(true);
		expect(columns.get("verified")?.default).toBe(true);
		expect(columns.get("failed_verification_count")?.notNull).toBe(true);
		expect(columns.get("failed_verification_count")?.default).toBe(0);
		expect(columns.get("locked_until")?.notNull).toBe(false);
		expect(columns.get("locked_until")?.dataType).toBe("object date");
	});
});
