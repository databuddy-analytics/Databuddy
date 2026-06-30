import { describe, expect, test } from "bun:test";
import { userRuleSchema } from "@databuddy/shared/flags";
import { createUserTargetRule } from "./flag-rules";

describe("flag tools", () => {
	test("creates batch email targeting rules", () => {
		const rule = createUserTargetRule("email", [
			"issa@databuddy.cc",
			"qais@databuddy.cc",
		]);

		expect(userRuleSchema.safeParse(rule).success).toBe(true);
		expect(rule).toEqual({
			batch: true,
			batchValues: ["issa@databuddy.cc", "qais@databuddy.cc"],
			enabled: true,
			operator: "in",
			type: "email",
			values: ["issa@databuddy.cc", "qais@databuddy.cc"],
		});
	});
});
