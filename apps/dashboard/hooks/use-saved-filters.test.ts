import { expect, test } from "bun:test";
import { validateFilters } from "./use-saved-filters";

test("rejects unsupported saved filters without changing their definition", () => {
	const filters = [
		{
			field: "query_string",
			operator: "eq" as const,
			value: "campaign=summer",
		},
	];
	const before = JSON.stringify(filters);
	expect(validateFilters(filters)?.type).toBe("validation_error");
	expect(JSON.stringify(filters)).toBe(before);
	expect(
		validateFilters([{ field: "path", operator: "eq", value: "/pricing" }])
	).toBeNull();
});
