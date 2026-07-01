import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

import { getOAuthTokenOrderBy } from "./oauth-token-ordering";

const dialect = new PgDialect();

function renderOrderBy(preferUserId?: string): string[] {
	return getOAuthTokenOrderBy(preferUserId).map(
		(expression) => dialect.sqlToQuery(expression).sql
	);
}

describe("getOAuthTokenOrderBy", () => {
	test("does not order by a constant when no preferred user is provided", () => {
		expect(renderOrderBy()).toEqual([
			`CASE "member"."role" WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
		]);
	});

	test("prefers the requested user before role priority when present", () => {
		expect(renderOrderBy("user_123")).toEqual([
			`CASE WHEN "account"."user_id" = $1 THEN 0 ELSE 1 END`,
			`CASE "member"."role" WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
		]);
	});
});
