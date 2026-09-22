import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { account, twoFactor } from "./auth";

describe("Better Auth account identity schema", () => {
	test("keeps provider account IDs unique per provider", () => {
		const identityIndex = getTableConfig(account).indexes.find(
			(index) => index.config.name === "accounts_provider_account_unique"
		);

		expect(identityIndex?.config.unique).toBe(true);
		expect(identityIndex?.config.columns.map((column) => column.name)).toEqual([
			"provider_id",
			"account_id",
		]);
	});

	test("does not carry the reverted 1.7.0 issuer column", () => {
		const issuer = getTableConfig(account).columns.find(
			(column) => column.name === "issuer"
		);

		expect(issuer).toBeUndefined();
	});
});

describe("Better Auth two-factor schema", () => {
	test("supports verified enrollment and account lockout state", () => {
		const columns = new Map(
			getTableConfig(twoFactor).columns.map((column) => [column.name, column])
		);

		expect(columns.get("verified")?.notNull).toBe(false);
		expect(columns.get("verified")?.default).toBe(true);
		expect(columns.get("failed_verification_count")?.notNull).toBe(false);
		expect(columns.get("failed_verification_count")?.default).toBe(0);
		expect(columns.get("locked_until")?.notNull).toBe(false);
		expect(columns.get("locked_until")?.dataType).toBe("object date");
	});
});
