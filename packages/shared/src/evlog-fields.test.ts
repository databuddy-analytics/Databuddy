import { describe, expect, test } from "bun:test";
import { getErrorLogFields } from "./evlog-fields";

function postgresError(overrides: Record<string, unknown> = {}) {
	return Object.assign(new Error('column "rollout_by" does not exist'), {
		code: "42703",
		severity: "ERROR",
		hint: 'Perhaps you meant to reference the column "websites.createdAt".',
		routine: "errorMissingColumn",
		...overrides,
	});
}

describe("getErrorLogFields", () => {
	test("keeps message and stack for a plain error", () => {
		const fields = getErrorLogFields(new Error("boom"));

		expect(fields.error_message).toBe("boom");
		expect(fields.error_stack).toContain("boom");
		expect(fields.error_pg_code).toBeUndefined();
	});

	test("stringifies non-errors", () => {
		expect(getErrorLogFields("nope").error_message).toBe("nope");
		expect(getErrorLogFields(undefined).error_message).toBe("undefined");
	});

	test("surfaces the postgres code a driver wrapper would otherwise bury", () => {
		const wrapped = new Error("Failed query: select ... params: 1,active", {
			cause: postgresError(),
		});

		const fields = getErrorLogFields(wrapped);

		expect(fields.error_pg_code).toBe("42703");
		expect(fields.error_pg_hint).toContain("Perhaps you meant");
		expect(fields.error_cause_message).toContain("rollout_by");
		expect(fields.error_message).toStartWith("Failed query:");
	});

	test("carries constraint and table for integrity violations", () => {
		const fields = getErrorLogFields(
			new Error("Failed query", {
				cause: postgresError({
					code: "23505",
					constraint: "links_slug_unique",
					detail: "Key (slug)=(abc) already exists.",
					table: "links",
				}),
			})
		);

		expect(fields.error_pg_code).toBe("23505");
		expect(fields.error_pg_constraint).toBe("links_slug_unique");
		expect(fields.error_pg_table).toBe("links");
		expect(fields.error_pg_detail).toContain("already exists");
	});

	test("finds a postgres error nested several causes deep", () => {
		const fields = getErrorLogFields(
			new Error("outer", {
				cause: new Error("middle", { cause: postgresError() }),
			})
		);

		expect(fields.error_pg_code).toBe("42703");
	});

	test("ignores causes that only look like postgres errors", () => {
		const httpish = Object.assign(new Error("upstream failed"), {
			code: "42703",
		});

		const fields = getErrorLogFields(new Error("wrapped", { cause: httpish }));

		expect(fields.error_pg_code).toBeUndefined();
		expect(fields.error_cause_message).toBe("upstream failed");
	});

	test("omits empty postgres detail fields instead of logging blanks", () => {
		const fields = getErrorLogFields(
			new Error("Failed query", {
				cause: postgresError({ hint: "", detail: undefined }),
			})
		);

		expect(fields.error_pg_code).toBe("42703");
		expect("error_pg_hint" in fields).toBe(false);
		expect("error_pg_detail" in fields).toBe(false);
	});
});
