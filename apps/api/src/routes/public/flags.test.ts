import { describe, expect, it } from "bun:test";
import {
	evaluateFlag,
	evaluateRule,
	evaluateStringRule,
	evaluateValueRule,
	hashString,
	parseProperties,
	selectVariant,
} from "./flags";

const ROLLOUT_REASON_REGEX = /ROLLOUT_(ENABLED|DISABLED)/;

describe("hashString", () => {
	it("returns same output for same input", () => {
		const input = "test-user-123";
		const hash1 = hashString(input);
		const hash2 = hashString(input);
		expect(hash1).toBe(hash2);
	});

	it("returns different outputs for different inputs most of the time", () => {
		const hash1 = hashString("user-1");
		const hash2 = hashString("user-2");
		const hash3 = hashString("user-3");

		expect(hash1).not.toBe(hash2);
		expect(hash2).not.toBe(hash3);
		expect(hash1).not.toBe(hash3);
	});

	it("does not return negative values", () => {
		const inputs = [
			"test",
			"user@example.com",
			"very-long-string-with-special-chars-!@#$%",
			"",
		];

		for (const input of inputs) {
			const hash = hashString(input);
			expect(hash).toBeGreaterThanOrEqual(0);
		}
	});

	it("handles large strings without breaking", () => {
		const largeString = "x".repeat(10_000);
		expect(() => hashString(largeString)).not.toThrow();
		expect(hashString(largeString)).toBeGreaterThanOrEqual(0);
	});

	it("handles empty string", () => {
		expect(hashString("")).toBe(0);
	});
});

describe("parseProperties", () => {
	it("parses valid JSON correctly", () => {
		const json = '{"plan":"pro","age":25,"active":true}';
		const result = parseProperties(json);

		expect(result).toEqual({
			plan: "pro",
			age: 25,
			active: true,
		});
	});

	it("returns empty object for invalid JSON", () => {
		const invalidJson = '{plan: "pro", invalid}';
		const result = parseProperties(invalidJson);

		expect(result).toEqual({});
	});

	it("returns empty object for empty string", () => {
		const result = parseProperties("");
		expect(result).toEqual({});
	});

	it("returns empty object for undefined", () => {
		const result = parseProperties(undefined);
		expect(result).toEqual({});
	});

	it("handles nested objects", () => {
		const json = '{"user":{"name":"John","email":"john@example.com"}}';
		const result = parseProperties(json);

		expect(result).toEqual({
			user: { name: "John", email: "john@example.com" },
		});
	});
});

describe("evaluateStringRule", () => {
	it("evaluates equals operator correctly", () => {
		const rule = {
			type: "user_id" as const,
			operator: "equals",
			value: "user-123",
			enabled: true,
			batch: false,
		};

		expect(evaluateStringRule("user-123", rule)).toBe(true);
		expect(evaluateStringRule("user-456", rule)).toBe(false);
	});

	it("evaluates contains operator correctly", () => {
		const rule = {
			type: "email" as const,
			operator: "contains",
			value: "@company.com",
			enabled: true,
			batch: false,
		};

		expect(evaluateStringRule("user@company.com", rule)).toBe(true);
		expect(evaluateStringRule("user@other.com", rule)).toBe(false);
	});

	it("evaluates starts_with operator correctly", () => {
		const rule = {
			type: "user_id" as const,
			operator: "starts_with",
			value: "admin-",
			enabled: true,
			batch: false,
		};

		expect(evaluateStringRule("admin-123", rule)).toBe(true);
		expect(evaluateStringRule("user-123", rule)).toBe(false);
	});

	it("evaluates ends_with operator correctly", () => {
		const rule = {
			type: "email" as const,
			operator: "ends_with",
			value: ".com",
			enabled: true,
			batch: false,
		};

		expect(evaluateStringRule("user@example.com", rule)).toBe(true);
		expect(evaluateStringRule("user@example.org", rule)).toBe(false);
	});

	it("evaluates in operator correctly", () => {
		const rule = {
			type: "user_id" as const,
			operator: "in",
			values: ["user-1", "user-2", "user-3"],
			enabled: true,
			batch: false,
		};

		expect(evaluateStringRule("user-1", rule)).toBe(true);
		expect(evaluateStringRule("user-2", rule)).toBe(true);
		expect(evaluateStringRule("user-4", rule)).toBe(false);
	});

	it("evaluates not_in operator correctly", () => {
		const rule = {
			type: "user_id" as const,
			operator: "not_in",
			values: ["banned-1", "banned-2"],
			enabled: true,
			batch: false,
		};

		expect(evaluateStringRule("user-1", rule)).toBe(true);
		expect(evaluateStringRule("banned-1", rule)).toBe(false);
	});

	it("returns false for unknown operator", () => {
		const rule = {
			type: "user_id" as const,
			operator: "unknown_op",
			value: "test",
			enabled: true,
			batch: false,
		};

		expect(evaluateStringRule("test", rule)).toBe(false);
	});

	it("returns false when value is undefined", () => {
		const rule = {
			type: "user_id" as const,
			operator: "equals",
			value: "test",
			enabled: true,
			batch: false,
		};

		expect(evaluateStringRule(undefined, rule)).toBe(false);
	});
});

describe("evaluateValueRule", () => {
	it("evaluates equals operator correctly", () => {
		const rule = {
			type: "property" as const,
			operator: "equals",
			value: 25,
			enabled: true,
			batch: false,
		};

		expect(evaluateValueRule(25, rule)).toBe(true);
		expect(evaluateValueRule(30, rule)).toBe(false);
	});

	it("evaluates contains operator correctly", () => {
		const rule = {
			type: "property" as const,
			operator: "contains",
			value: "pro",
			enabled: true,
			batch: false,
		};

		expect(evaluateValueRule("professional", rule)).toBe(true);
		expect(evaluateValueRule("basic", rule)).toBe(false);
	});

	it("evaluates in operator correctly", () => {
		const rule = {
			type: "property" as const,
			operator: "in",
			values: ["pro", "enterprise", "ultimate"],
			enabled: true,
			batch: false,
		};

		expect(evaluateValueRule("pro", rule)).toBe(true);
		expect(evaluateValueRule("basic", rule)).toBe(false);
	});

	it("evaluates not_in operator correctly", () => {
		const rule = {
			type: "property" as const,
			operator: "not_in",
			values: ["banned", "suspended"],
			enabled: true,
			batch: false,
		};

		expect(evaluateValueRule("active", rule)).toBe(true);
		expect(evaluateValueRule("banned", rule)).toBe(false);
	});

	it("evaluates exists operator correctly", () => {
		const rule = {
			type: "property" as const,
			operator: "exists",
			enabled: true,
			batch: false,
		};

		expect(evaluateValueRule("value", rule)).toBe(true);
		expect(evaluateValueRule(0, rule)).toBe(true);
		expect(evaluateValueRule(false, rule)).toBe(true);
		expect(evaluateValueRule(undefined, rule)).toBe(false);
		expect(evaluateValueRule(null, rule)).toBe(false);
	});

	it("evaluates not_exists operator correctly", () => {
		const rule = {
			type: "property" as const,
			operator: "not_exists",
			enabled: true,
			batch: false,
		};

		expect(evaluateValueRule(undefined, rule)).toBe(true);
		expect(evaluateValueRule(null, rule)).toBe(true);
		expect(evaluateValueRule("value", rule)).toBe(false);
		expect(evaluateValueRule(0, rule)).toBe(false);
	});

	it("returns false for unknown operator", () => {
		const rule = {
			type: "property" as const,
			operator: "unknown_op",
			enabled: true,
			batch: false,
		};

		expect(evaluateValueRule("test", rule)).toBe(false);
	});

	it("handles undefined and null correctly", () => {
		const equalsRule = {
			type: "property" as const,
			operator: "equals",
			value: "test",
			enabled: true,
			batch: false,
		};

		expect(evaluateValueRule(undefined, equalsRule)).toBe(false);
		expect(evaluateValueRule(null, equalsRule)).toBe(false);
	});
});

describe("evaluateRule - batch mode", () => {
	it("matches batch user_id correctly", () => {
		const rule = {
			type: "user_id" as const,
			operator: "in",
			batch: true,
			batchValues: ["user-1", "user-2", "user-3"],
			enabled: true,
		};

		expect(evaluateRule(rule, { userId: "user-1" })).toBe(true);
		expect(evaluateRule(rule, { userId: "user-4" })).toBe(false);
	});

	it("returns false for batch user_id with no userId in context", () => {
		const rule = {
			type: "user_id" as const,
			operator: "in",
			batch: true,
			batchValues: ["user-1", "user-2"],
			enabled: true,
		};

		expect(evaluateRule(rule, {})).toBe(false);
	});

	it("matches batch email correctly", () => {
		const rule = {
			type: "email" as const,
			operator: "in",
			batch: true,
			batchValues: ["admin@company.com", "support@company.com"],
			enabled: true,
		};

		expect(evaluateRule(rule, { email: "admin@company.com" })).toBe(true);
		expect(evaluateRule(rule, { email: "user@other.com" })).toBe(false);
	});

	it("matches batch property correctly", () => {
		const rule = {
			type: "property" as const,
			operator: "in",
			field: "plan",
			batch: true,
			batchValues: ["pro", "enterprise"],
			enabled: true,
		};

		expect(evaluateRule(rule, { properties: { plan: "pro" } })).toBe(true);
		expect(evaluateRule(rule, { properties: { plan: "basic" } })).toBe(false);
	});

	it("returns false for batch property without field", () => {
		const rule = {
			type: "property" as const,
			operator: "in",
			batch: true,
			batchValues: ["value1", "value2"],
			enabled: true,
		};

		expect(evaluateRule(rule, { properties: { plan: "pro" } })).toBe(false);
	});
});

describe("evaluateRule - non-batch mode", () => {
	it("applies user_id string rule", () => {
		const rule = {
			type: "user_id" as const,
			operator: "equals",
			value: "admin-123",
			enabled: true,
			batch: false,
		};

		expect(evaluateRule(rule, { userId: "admin-123" })).toBe(true);
		expect(evaluateRule(rule, { userId: "user-123" })).toBe(false);
	});

	it("applies email string rule", () => {
		const rule = {
			type: "email" as const,
			operator: "contains",
			value: "@company.com",
			enabled: true,
			batch: false,
		};

		expect(evaluateRule(rule, { email: "user@company.com" })).toBe(true);
		expect(evaluateRule(rule, { email: "user@other.com" })).toBe(false);
	});

	it("applies property rule with field", () => {
		const rule = {
			type: "property" as const,
			operator: "equals",
			field: "plan",
			value: "pro",
			enabled: true,
			batch: false,
		};

		expect(evaluateRule(rule, { properties: { plan: "pro" } })).toBe(true);
		expect(evaluateRule(rule, { properties: { plan: "basic" } })).toBe(false);
	});

	it("triggers percentage rollout for property rule without field", () => {
		const rule = {
			type: "property" as const,
			operator: "equals",
			value: 50,
			enabled: true,
			batch: false,
		};

		const result = evaluateRule(rule, { userId: "test-user" });
		expect(typeof result).toBe("boolean");

		const result2 = evaluateRule(rule, { userId: "test-user-2" });
		expect(typeof result2).toBe("boolean");
	});

	it("returns false for property rule with missing property", () => {
		const rule = {
			type: "property" as const,
			operator: "equals",
			field: "nonexistent",
			value: "value",
			enabled: true,
			batch: false,
		};

		expect(evaluateRule(rule, { properties: { plan: "pro" } })).toBe(false);
	});

	it("returns false for unknown rule type", () => {
		const rule = {
			type: "unknown" as any,
			operator: "equals",
			value: "test",
			enabled: true,
			batch: false,
		};

		expect(evaluateRule(rule, { userId: "test" })).toBe(false);
	});
});

describe("selectVariant", () => {
	it("selects variant based on user hash", () => {
		const flag = {
			key: "button-color",
			variants: [
				{ key: "control", value: "gray", weight: 50 },
				{ key: "variant-a", value: "blue", weight: 25 },
				{ key: "variant-b", value: "green", weight: 25 },
			],
		};

		const result = selectVariant(flag, { userId: "user-123" });
		expect(["gray", "blue", "green"]).toContain(result.value);
		expect(["control", "variant-a", "variant-b"]).toContain(result.variant);
	});

	it("provides sticky assignment for same user", () => {
		const flag = {
			key: "button-color",
			variants: [
				{ key: "control", value: "gray", weight: 50 },
				{ key: "variant-a", value: "blue", weight: 50 },
			],
		};

		const result1 = selectVariant(flag, { userId: "user-123" });
		const result2 = selectVariant(flag, { userId: "user-123" });

		expect(result1.variant).toBe(result2.variant);
		expect(result1.value).toBe(result2.value);
	});

	it("supports string variants", () => {
		const flag = {
			key: "theme",
			variants: [
				{ key: "light", value: "light-theme", weight: 50 },
				{ key: "dark", value: "dark-theme", weight: 50 },
			],
		};

		const result = selectVariant(flag, { userId: "user-456" });
		expect(typeof result.value).toBe("string");
		expect(["light-theme", "dark-theme"]).toContain(result.value);
	});

	it("supports number variants", () => {
		const flag = {
			key: "price-point",
			variants: [
				{ key: "low", value: 9.99, weight: 33 },
				{ key: "medium", value: 14.99, weight: 33 },
				{ key: "high", value: 19.99, weight: 34 },
			],
		};

		const result = selectVariant(flag, { userId: "user-789" });
		expect(typeof result.value).toBe("number");
		expect([9.99, 14.99, 19.99]).toContain(result.value);
	});

	it("supports object variants", () => {
		const flag = {
			key: "feature-config",
			variants: [
				{ key: "basic", value: { features: ["a", "b"] }, weight: 50 },
				{
					key: "premium",
					value: { features: ["a", "b", "c", "d"] },
					weight: 50,
				},
			],
		};

		const result = selectVariant(flag, { userId: "user-abc" });
		expect(typeof result.value).toBe("object");
		expect(result.value).toHaveProperty("features");
	});

	it("returns default when no variants", () => {
		const flag = {
			key: "test",
			defaultValue: true,
			variants: [],
		};

		const result = selectVariant(flag, { userId: "user-123" });
		expect(result.variant).toBe("default");
		expect(result.value).toBe(true);
	});
});

describe("evaluateFlag - multi-variant", () => {
	it("evaluates multivariant flags correctly", () => {
		const flag = {
			key: "button-color",
			type: "multivariant",
			variants: [
				{ key: "control", value: "gray", weight: 50 },
				{ key: "variant-a", value: "blue", weight: 50 },
			],
			payload: { experiment: "button-test" },
		};

		const result = evaluateFlag(flag, { userId: "user-123" });
		expect(result.enabled).toBe(true);
		expect(["gray", "blue"]).toContain(result.value);
		expect(["control", "variant-a"]).toContain(result.variant as string);
		expect(result.reason).toBe("MULTIVARIANT_EVALUATED");
		expect(result.payload).toEqual({ experiment: "button-test" });
	});

	it("falls back to boolean for non-multivariant flags", () => {
		const flag = {
			key: "simple-flag",
			type: "boolean",
			defaultValue: true,
		};

		const result = evaluateFlag(flag, { userId: "user-123" });
		expect(result.value).toBe(true);
		expect(result.variant).toBeUndefined();
	});
});

describe("evaluateFlag - rules present", () => {
	it("returns first matching rule", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: false,
			payload: { message: "enabled" },
			rules: [
				{
					type: "user_id",
					operator: "equals",
					value: "user-123",
					enabled: true,
					batch: false,
				},
				{
					type: "email",
					operator: "contains",
					value: "@admin.com",
					enabled: false,
					batch: false,
				},
			],
		};

		const result = evaluateFlag(flag, { userId: "user-123" });
		expect(result.enabled).toBe(true);
		expect(result.value).toBe(true);
		expect(result.reason).toBe("USER_RULE_MATCH");
		expect(result.payload).toEqual({ message: "enabled" });
	});

	it("falls back to default when no rules match", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: true,
			payload: null,
			rules: [
				{
					type: "user_id",
					operator: "equals",
					value: "admin",
					enabled: true,
					batch: false,
				},
			],
		};

		const result = evaluateFlag(flag, { userId: "regular-user" });
		expect(result.enabled).toBe(true);
		expect(result.reason).toBe("BOOLEAN_DEFAULT");
	});

	it("returns payload when rule.enabled is true", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: false,
			payload: { config: "special" },
			rules: [
				{
					type: "user_id",
					operator: "equals",
					value: "vip",
					enabled: true,
					batch: false,
				},
			],
		};

		const result = evaluateFlag(flag, { userId: "vip" });
		expect(result.payload).toEqual({ config: "special" });
	});

	it("returns null payload when rule.enabled is false", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: true,
			payload: { config: "value" },
			rules: [
				{
					type: "user_id",
					operator: "equals",
					value: "blocked",
					enabled: false,
					batch: false,
				},
			],
		};

		const result = evaluateFlag(flag, { userId: "blocked" });
		expect(result.enabled).toBe(false);
		expect(result.payload).toBeNull();
	});
});

describe("evaluateFlag - default value", () => {
	it("uses defaultValue when no rules match", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: true,
			payload: { data: "test" },
			rules: [],
		};

		const result = evaluateFlag(flag, { userId: "test-user" });
		expect(result.enabled).toBe(true);
		expect(result.value).toBe(true);
		expect(result.reason).toBe("BOOLEAN_DEFAULT");
	});

	it("handles falsy defaultValue correctly", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: false,
			payload: null,
			rules: [],
		};

		const result = evaluateFlag(flag, { userId: "test-user" });
		expect(result.enabled).toBe(false);
		expect(result.value).toBe(false);
	});
});

describe("evaluateFlag - rollout type", () => {
	it("enables user when percentage is below threshold", () => {
		const flag = {
			key: "rollout-flag",
			type: "rollout",
			defaultValue: false,
			rolloutPercentage: 100,
			payload: { feature: "new" },
		};

		const result = evaluateFlag(flag, { userId: "test-user" });
		expect(result.enabled).toBe(true);
		expect(result.reason).toBe("ROLLOUT_ENABLED");
		expect(result.payload).toEqual({ feature: "new" });
	});

	it("disables user when percentage is at or above threshold", () => {
		const flag = {
			key: "rollout-flag",
			type: "rollout",
			defaultValue: false,
			rolloutPercentage: 0,
			payload: { feature: "new" },
		};

		const result = evaluateFlag(flag, { userId: "test-user" });
		expect(result.enabled).toBe(false);
		expect(result.reason).toBe("ROLLOUT_DISABLED");
		expect(result.payload).toBeNull();
	});

	it("applies payload only when enabled", () => {
		const flag = {
			key: "rollout-flag",
			type: "rollout",
			defaultValue: false,
			rolloutPercentage: 100,
			payload: { data: "test" },
		};

		const resultEnabled = evaluateFlag(flag, { userId: "user-1" });
		expect(resultEnabled.enabled).toBe(true);
		expect(resultEnabled.payload).toEqual({ data: "test" });

		flag.rolloutPercentage = 0;
		const resultDisabled = evaluateFlag(flag, { userId: "user-2" });
		expect(resultDisabled.enabled).toBe(false);
		expect(resultDisabled.payload).toBeNull();
	});

	it("returns correct reason strings", () => {
		const flag = {
			key: "rollout-flag",
			type: "rollout",
			defaultValue: false,
			rolloutPercentage: 100,
			payload: null,
		};

		const resultEnabled = evaluateFlag(flag, { userId: "test" });
		expect(resultEnabled.reason).toBe("ROLLOUT_ENABLED");

		flag.rolloutPercentage = 0;
		const resultDisabled = evaluateFlag(flag, { userId: "test2" });
		expect(resultDisabled.reason).toBe("ROLLOUT_DISABLED");
	});

	it("uses anonymous identifier when userId and email are missing", () => {
		const flag = {
			key: "rollout-flag",
			type: "rollout",
			defaultValue: false,
			rolloutPercentage: 50,
			payload: null,
		};

		const result = evaluateFlag(flag, {});
		expect(result.enabled).toBeDefined();
		expect(result.reason).toMatch(ROLLOUT_REASON_REGEX);
	});
});

describe("evaluateFlag - non-rollout type", () => {
	it("returns BOOLEAN_DEFAULT reason", () => {
		const flag = {
			key: "simple-flag",
			type: "boolean",
			defaultValue: true,
			payload: { data: "test" },
		};

		const result = evaluateFlag(flag, { userId: "test" });
		expect(result.reason).toBe("BOOLEAN_DEFAULT");
	});

	it("applies payload only if defaultValue is truthy", () => {
		const flagEnabled = {
			key: "flag-1",
			type: "boolean",
			defaultValue: true,
			payload: { enabled: true },
		};

		const resultEnabled = evaluateFlag(flagEnabled, {});
		expect(resultEnabled.payload).toEqual({ enabled: true });

		const flagDisabled = {
			key: "flag-2",
			type: "boolean",
			defaultValue: false,
			payload: { enabled: true },
		};

		const resultDisabled = evaluateFlag(flagDisabled, {});
		expect(resultDisabled.payload).toBeNull();
	});
});

describe("evaluateFlag - edge cases", () => {
	it("handles null payload", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: true,
			payload: null,
		};

		const result = evaluateFlag(flag, {});
		expect(result.payload).toBeNull();
	});

	it("handles empty rules array", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: true,
			payload: { data: "test" },
			rules: [],
		};

		const result = evaluateFlag(flag, {});
		expect(result.reason).toBe("BOOLEAN_DEFAULT");
	});

	it("handles malformed rules gracefully", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: true,
			payload: null,
			rules: [
				{
					type: undefined,
					operator: "equals",
					enabled: true,
					batch: false,
				},
			],
		};

		const result = evaluateFlag(flag, { userId: "test" });
		expect(result).toBeDefined();
		expect(result.reason).toBe("BOOLEAN_DEFAULT");
	});

	it("handles context with special characters in userId", () => {
		const flag = {
			key: "test-flag",
			type: "rollout",
			defaultValue: false,
			rolloutPercentage: 50,
			payload: null,
		};

		const result = evaluateFlag(flag, {
			userId: "<script>alert('xss')</script>",
		});
		expect(result).toBeDefined();
		expect(result.enabled).toBeDefined();
	});

	it("handles nested properties object", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: false,
			payload: null,
			rules: [
				{
					type: "property",
					operator: "exists",
					field: "user",
					enabled: true,
					batch: false,
				},
			],
		};

		const result = evaluateFlag(flag, {
			properties: { user: { name: "John", email: "john@example.com" } },
		});
		expect(result.enabled).toBe(true);
	});

	it("handles rule with non-array values", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: false,
			payload: null,
			rules: [
				{
					type: "user_id",
					operator: "in",
					values: "not-an-array" as any,
					enabled: true,
					batch: false,
				},
			],
		};

		const result = evaluateFlag(flag, { userId: "test" });
		expect(result).toBeDefined();
	});

	it("handles rule value as number but property as string", () => {
		const flag = {
			key: "test-flag",
			type: "boolean",
			defaultValue: false,
			payload: null,
			rules: [
				{
					type: "property",
					operator: "equals",
					field: "age",
					value: 25,
					enabled: true,
					batch: false,
				},
			],
		};

		const result = evaluateFlag(flag, { properties: { age: "25" } });
		expect(result.enabled).toBe(false);
	});
});

describe("rollout stability", () => {
	it("gives stable rollout for same user", () => {
		const flag = {
			key: "stable-rollout",
			type: "rollout",
			defaultValue: false,
			rolloutPercentage: 50,
			payload: null,
		};

		const result1 = evaluateFlag(flag, { userId: "stable-user" });
		const result2 = evaluateFlag(flag, { userId: "stable-user" });
		const result3 = evaluateFlag(flag, { userId: "stable-user" });

		expect(result1.enabled).toBe(result2.enabled);
		expect(result2.enabled).toBe(result3.enabled);
	});

	it("distributes different users across percentage buckets", () => {
		const flag = {
			key: "distributed-rollout",
			type: "rollout",
			defaultValue: false,
			rolloutPercentage: 50,
			payload: null,
		};

		const results: boolean[] = [];
		for (let i = 0; i < 100; i += 1) {
			const result = evaluateFlag(flag, { userId: `user-${i}` });
			results.push(result.enabled);
		}

		const enabledCount = results.filter((r) => r).length;
		expect(enabledCount).toBeGreaterThan(30);
		expect(enabledCount).toBeLessThan(70);
	});

	it("enables all users at 100 percent rollout", () => {
		const flag = {
			key: "full-rollout",
			type: "rollout",
			defaultValue: false,
			rolloutPercentage: 100,
			payload: null,
		};

		for (let i = 0; i < 10; i += 1) {
			const result = evaluateFlag(flag, { userId: `user-${i}` });
			expect(result.enabled).toBe(true);
		}
	});

	it("enables no users at 0 percent rollout", () => {
		const flag = {
			key: "no-rollout",
			type: "rollout",
			defaultValue: false,
			rolloutPercentage: 0,
			payload: null,
		};

		for (let i = 0; i < 10; i += 1) {
			const result = evaluateFlag(flag, { userId: `user-${i}` });
			expect(result.enabled).toBe(false);
		}
	});
});
