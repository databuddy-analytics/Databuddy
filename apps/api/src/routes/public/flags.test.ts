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

const SAMPLE_SIZE = 500;
const randomId = () => Math.random().toString(36).slice(2, 15);

describe("hashString", () => {
	it("is deterministic and non-negative across many inputs", () => {
		const inputs = [
			"",
			"a",
			"test-user-123",
			"user@example.com",
			"<script>alert('xss')</script>",
			"🎉🚀💥",
			"x".repeat(10_000),
			...Array.from({ length: 100 }, randomId),
		];

		for (const input of inputs) {
			const h1 = hashString(input);
			const h2 = hashString(input);
			expect(h1).toBe(h2);
			expect(h1).toBeGreaterThanOrEqual(0);
		}
	});

	it("produces good distribution", () => {
		const hashes = new Set<number>();
		for (let i = 0; i < SAMPLE_SIZE; i += 1) {
			hashes.add(hashString(`user-${i}-${randomId()}`));
		}
		expect(hashes.size).toBeGreaterThan(SAMPLE_SIZE * 0.95);
	});
});

describe("parseProperties", () => {
	const cases: Array<[string | undefined, Record<string, unknown>]> = [
		[undefined, {}],
		["", {}],
		["{invalid}", {}],
		['{"a":1,"b":"c","d":true}', { a: 1, b: "c", d: true }],
		['{"nested":{"x":1}}', { nested: { x: 1 } }],
		['{"arr":[1,2,3]}', { arr: [1, 2, 3] }],
	];

	it.each(cases)("parses %j correctly", (input, expected) => {
		expect(parseProperties(input)).toEqual(expected);
	});
});

describe("evaluateStringRule", () => {
	const rule = (op: string, val?: string, vals?: string[]) => ({
		type: "user_id" as const,
		operator: op,
		value: val,
		values: vals,
		enabled: true,
		batch: false,
	});

	it("handles all operators correctly", () => {
		expect(evaluateStringRule("user-123", rule("equals", "user-123"))).toBe(
			true
		);
		expect(evaluateStringRule("other", rule("equals", "user-123"))).toBe(false);

		expect(
			evaluateStringRule("user@company.com", rule("contains", "@company"))
		).toBe(true);
		expect(
			evaluateStringRule("user@other.com", rule("contains", "@company"))
		).toBe(false);

		expect(
			evaluateStringRule("admin-user", rule("starts_with", "admin-"))
		).toBe(true);
		expect(
			evaluateStringRule("user-admin", rule("starts_with", "admin-"))
		).toBe(false);

		expect(evaluateStringRule("file.com", rule("ends_with", ".com"))).toBe(
			true
		);
		expect(evaluateStringRule("file.org", rule("ends_with", ".com"))).toBe(
			false
		);

		const vals = ["a", "b", "c"];
		expect(evaluateStringRule("b", rule("in", undefined, vals))).toBe(true);
		expect(evaluateStringRule("z", rule("in", undefined, vals))).toBe(false);
		expect(evaluateStringRule("z", rule("not_in", undefined, vals))).toBe(true);
		expect(evaluateStringRule("a", rule("not_in", undefined, vals))).toBe(
			false
		);

		expect(evaluateStringRule("test", rule("unknown_op", "test"))).toBe(false);
		expect(evaluateStringRule(undefined, rule("equals", "test"))).toBe(false);
	});
});

describe("evaluateStringRule - email pattern matching", () => {
	const emailRule = (op: string, val?: string, vals?: string[]) => ({
		type: "email" as const,
		operator: op,
		value: val,
		values: vals,
		enabled: true,
		batch: false,
	});

	it("handles ends_with for email domain patterns", () => {
		// Common use case: target users by email domain
		expect(
			evaluateStringRule(
				"user@databuddy.cc",
				emailRule("ends_with", "@databuddy.cc")
			)
		).toBe(true);
		expect(
			evaluateStringRule(
				"admin@databuddy.cc",
				emailRule("ends_with", "@databuddy.cc")
			)
		).toBe(true);
		expect(
			evaluateStringRule(
				"user@other.com",
				emailRule("ends_with", "@databuddy.cc")
			)
		).toBe(false);
		expect(
			evaluateStringRule("user@company.io", emailRule("ends_with", ".io"))
		).toBe(true);
		expect(
			evaluateStringRule("user@company.com", emailRule("ends_with", ".io"))
		).toBe(false);
	});

	it("handles starts_with for email prefix patterns", () => {
		// Target emails starting with a prefix (e.g., admin@, support@)
		expect(
			evaluateStringRule(
				"admin@company.com",
				emailRule("starts_with", "admin@")
			)
		).toBe(true);
		expect(
			evaluateStringRule("admin@other.org", emailRule("starts_with", "admin@"))
		).toBe(true);
		expect(
			evaluateStringRule("user@company.com", emailRule("starts_with", "admin@"))
		).toBe(false);
		expect(
			evaluateStringRule(
				"support@company.com",
				emailRule("starts_with", "support")
			)
		).toBe(true);
	});

	it("handles contains for partial email matching", () => {
		// Target emails containing a substring
		expect(
			evaluateStringRule(
				"user@company.internal.com",
				emailRule("contains", "internal")
			)
		).toBe(true);
		expect(
			evaluateStringRule(
				"internal-user@company.com",
				emailRule("contains", "internal")
			)
		).toBe(true);
		expect(
			evaluateStringRule("user@company.com", emailRule("contains", "internal"))
		).toBe(false);
		expect(
			evaluateStringRule(
				"beta-tester@company.com",
				emailRule("contains", "beta")
			)
		).toBe(true);
	});

	it("handles exact match for full email addresses", () => {
		expect(
			evaluateStringRule(
				"user@databuddy.cc",
				emailRule("equals", "user@databuddy.cc")
			)
		).toBe(true);
		expect(
			evaluateStringRule(
				"other@databuddy.cc",
				emailRule("equals", "user@databuddy.cc")
			)
		).toBe(false);
	});

	it("handles in/not_in for email lists", () => {
		const allowedEmails = ["admin@co.com", "support@co.com", "dev@co.com"];
		expect(
			evaluateStringRule(
				"admin@co.com",
				emailRule("in", undefined, allowedEmails)
			)
		).toBe(true);
		expect(
			evaluateStringRule(
				"random@co.com",
				emailRule("in", undefined, allowedEmails)
			)
		).toBe(false);
		expect(
			evaluateStringRule(
				"random@co.com",
				emailRule("not_in", undefined, allowedEmails)
			)
		).toBe(true);
		expect(
			evaluateStringRule(
				"admin@co.com",
				emailRule("not_in", undefined, allowedEmails)
			)
		).toBe(false);
	});
});

describe("evaluateValueRule", () => {
	const rule = (op: string, val?: unknown, vals?: unknown[]) => ({
		type: "property" as const,
		operator: op,
		value: val,
		values: vals,
		enabled: true,
		batch: false,
	});

	it("handles all operators correctly", () => {
		expect(evaluateValueRule(25, rule("equals", 25))).toBe(true);
		expect(evaluateValueRule(30, rule("equals", 25))).toBe(false);
		expect(evaluateValueRule("professional", rule("contains", "pro"))).toBe(
			true
		);
		expect(evaluateValueRule("basic", rule("contains", "pro"))).toBe(false);
		expect(
			evaluateValueRule("pro", rule("in", undefined, ["pro", "ent"]))
		).toBe(true);
		expect(
			evaluateValueRule("free", rule("in", undefined, ["pro", "ent"]))
		).toBe(false);
		expect(
			evaluateValueRule("ok", rule("not_in", undefined, ["bad", "worse"]))
		).toBe(true);
		expect(
			evaluateValueRule("bad", rule("not_in", undefined, ["bad", "worse"]))
		).toBe(false);
		expect(evaluateValueRule("val", rule("exists"))).toBe(true);
		expect(evaluateValueRule(0, rule("exists"))).toBe(true);
		expect(evaluateValueRule(undefined, rule("exists"))).toBe(false);
		expect(evaluateValueRule(null, rule("exists"))).toBe(false);
		expect(evaluateValueRule(undefined, rule("not_exists"))).toBe(true);
		expect(evaluateValueRule("x", rule("not_exists"))).toBe(false);
		expect(evaluateValueRule("x", rule("unknown_op"))).toBe(false);
	});
});

describe("evaluateRule", () => {
	it("handles batch rules for all types", () => {
		const batchVals = ["user-1", "user-2", "admin@co.com", "pro"];

		const userRule = {
			type: "user_id" as const,
			operator: "in",
			batch: true,
			batchValues: batchVals,
			enabled: true,
		};
		expect(evaluateRule(userRule, { userId: "user-1" })).toBe(true);
		expect(evaluateRule(userRule, { userId: "nope" })).toBe(false);
		expect(evaluateRule(userRule, {})).toBe(false);

		const emailRule = { ...userRule, type: "email" as const };
		expect(evaluateRule(emailRule, { email: "admin@co.com" })).toBe(true);
		expect(evaluateRule(emailRule, { email: "other@x.com" })).toBe(false);

		const propRule = {
			...userRule,
			type: "property" as const,
			field: "plan",
			batchValues: ["pro", "ent"],
		};
		expect(evaluateRule(propRule, { properties: { plan: "pro" } })).toBe(true);
		expect(evaluateRule(propRule, { properties: { plan: "free" } })).toBe(
			false
		);

		const noFieldRule = { ...propRule, field: undefined };
		expect(evaluateRule(noFieldRule, { properties: { plan: "pro" } })).toBe(
			false
		);
	});

	it("handles batch rules with ends_with for email domain targeting", () => {
		const emailEndsWithRule = {
			type: "email" as const,
			operator: "ends_with" as const,
			batch: true,
			batchValues: ["@databuddy.cc"],
			enabled: true,
		};
		expect(
			evaluateRule(emailEndsWithRule, { email: "user@databuddy.cc" })
		).toBe(true);
		expect(
			evaluateRule(emailEndsWithRule, { email: "admin@databuddy.cc" })
		).toBe(true);
		expect(evaluateRule(emailEndsWithRule, { email: "user@other.com" })).toBe(
			false
		);
		expect(evaluateRule(emailEndsWithRule, {})).toBe(false);
	});

	it("handles batch rules with not_in", () => {
		const emailNotInRule = {
			type: "email" as const,
			operator: "not_in" as const,
			batch: true,
			batchValues: ["blocked@spam.com"],
			enabled: true,
		};
		expect(evaluateRule(emailNotInRule, { email: "user@company.com" })).toBe(
			true
		);
		expect(evaluateRule(emailNotInRule, { email: "blocked@spam.com" })).toBe(
			false
		);
	});

	it("handles non-batch rules", () => {
		const userRule = {
			type: "user_id" as const,
			operator: "equals",
			value: "admin",
			enabled: true,
			batch: false,
		};
		expect(evaluateRule(userRule, { userId: "admin" })).toBe(true);
		expect(evaluateRule(userRule, { userId: "user" })).toBe(false);

		const emailRule = {
			type: "email" as const,
			operator: "contains",
			value: "@co.com",
			enabled: true,
			batch: false,
		};
		expect(evaluateRule(emailRule, { email: "x@co.com" })).toBe(true);

		const propRule = {
			type: "property" as const,
			operator: "equals",
			field: "tier",
			value: "gold",
			enabled: true,
			batch: false,
		};
		expect(evaluateRule(propRule, { properties: { tier: "gold" } })).toBe(true);
		expect(evaluateRule(propRule, { properties: { tier: "silver" } })).toBe(
			false
		);

		const unknownRule = {
			type: "unknown" as "user_id",
			operator: "equals",
			value: "x",
			enabled: true,
			batch: false,
		};
		expect(evaluateRule(unknownRule, { userId: "x" })).toBe(false);
	});
});

describe("selectVariant", () => {
	it("provides sticky assignment across many users", () => {
		const flag = {
			key: "exp-1",
			type: "multivariant" as const,
			status: "active" as const,
			defaultValue: false,
			rolloutPercentage: null,
			variants: [
				{ key: "a", value: "A", weight: 50, type: "string" as const },
				{ key: "b", value: "B", weight: 50, type: "string" as const },
			],
		};

		for (let i = 0; i < SAMPLE_SIZE; i += 1) {
			const ctx = { userId: `user-${i}` };
			const r1 = selectVariant(flag, ctx);
			const r2 = selectVariant(flag, ctx);
			expect(r1.variant).toBe(r2.variant);
			expect(r1.value).toBe(r2.value);
			expect(["a", "b"]).toContain(r1.variant);
			expect(["A", "B"]).toContain(r1.value as string);
		}
	});

	it("distributes variants roughly according to weights", () => {
		const flag = {
			key: "weighted",
			type: "multivariant" as const,
			status: "active" as const,
			defaultValue: false,
			rolloutPercentage: null,
			variants: [
				{ key: "heavy", value: 1, weight: 80, type: "number" as const },
				{ key: "light", value: 2, weight: 20, type: "number" as const },
			],
		};

		let heavyCount = 0;
		for (let i = 0; i < SAMPLE_SIZE; i += 1) {
			const r = selectVariant(flag, { userId: randomId() });
			if (r.variant === "heavy") {
				heavyCount += 1;
			}
		}

		expect(heavyCount).toBeGreaterThan(SAMPLE_SIZE * 0.6);
		expect(heavyCount).toBeLessThan(SAMPLE_SIZE * 0.95);
	});

	it("handles edge cases", () => {
		expect(
			selectVariant(
				{
					key: "x",
					type: "multivariant" as const,
					status: "active" as const,
					defaultValue: true,
					rolloutPercentage: null,
					variants: [],
				},
				{}
			)
		).toEqual({ value: true, variant: "default" });

		const noWeights = {
			key: "nw",
			type: "multivariant" as const,
			status: "active" as const,
			defaultValue: false,
			rolloutPercentage: null,
			variants: [
				{ key: "a", value: 1, type: "number" as const },
				{ key: "b", value: 2, type: "number" as const },
				{ key: "c", value: 3, type: "number" as const },
			],
		};
		const r = selectVariant(noWeights, { userId: "test" });
		expect(["a", "b", "c"]).toContain(r.variant);
	});
});

describe("evaluateFlag", () => {
	it("handles boolean flags with defaults", () => {
		expect(
			evaluateFlag(
				{
					key: "f",
					type: "boolean",
					defaultValue: true,
					status: "active",
					rolloutPercentage: null,
				},
				{}
			)
		).toMatchObject({ enabled: true, reason: "BOOLEAN_DEFAULT" });

		expect(
			evaluateFlag(
				{
					key: "f",
					type: "boolean",
					defaultValue: false,
					status: "active",
					rolloutPercentage: null,
				},
				{}
			)
		).toMatchObject({ enabled: false, reason: "BOOLEAN_DEFAULT" });
	});

	it("matches rules in priority order", () => {
		const flag = {
			key: "r",
			type: "boolean" as const,
			defaultValue: false,
			status: "active" as const,
			rolloutPercentage: null,
			payload: { x: 1 },
			rules: [
				{
					type: "user_id" as const,
					operator: "equals",
					value: "vip",
					enabled: true,
					batch: false,
				},
				{
					type: "email" as const,
					operator: "contains",
					value: "@admin",
					enabled: false,
					batch: false,
				},
			],
		};

		const vip = evaluateFlag(flag, { userId: "vip" });
		expect(vip).toMatchObject({
			enabled: true,
			reason: "USER_RULE_MATCH",
			payload: { x: 1 },
		});

		const admin = evaluateFlag(flag, { email: "x@admin.com" });
		expect(admin).toMatchObject({
			enabled: false,
			reason: "USER_RULE_MATCH",
			payload: null,
		});

		const nobody = evaluateFlag(flag, { userId: "random" });
		expect(nobody.reason).toBe("BOOLEAN_DEFAULT");
	});

	it("handles multivariant flags", () => {
		const flag = {
			key: "mv",
			type: "multivariant" as const,
			status: "active" as const,
			defaultValue: false,
			rolloutPercentage: null,
			variants: [
				{ key: "a", value: "A", weight: 50, type: "string" as const },
				{ key: "b", value: "B", weight: 50, type: "string" as const },
			],
			payload: { exp: true },
		};

		for (let i = 0; i < 50; i += 1) {
			const r = evaluateFlag(flag, { userId: randomId() });
			expect(r.enabled).toBe(true);
			expect(r.reason).toBe("MULTIVARIANT_EVALUATED");
			expect(["A", "B"]).toContain(r.value as string);
			expect(r.payload).toEqual({ exp: true });
		}
	});
});

describe("rollout distribution", () => {
	const rolloutTests = [
		{ rolloutBy: undefined, idField: "userId", label: "user" },
		{ rolloutBy: "organization", idField: "organizationId", label: "org" },
		{ rolloutBy: "team", idField: "teamId", label: "team" },
	] as const;

	for (const { rolloutBy, idField, label } of rolloutTests) {
		it(`${label}-based: 0% enables none, 100% enables all`, () => {
			for (let i = 0; i < 100; i += 1) {
				const ctx = { [idField]: `${label}-${i}` };
				expect(
					evaluateFlag(
						{
							key: `${label}-0`,
							type: "rollout" as const,
							rolloutPercentage: 0,
							rolloutBy,
							status: "active" as const,
							defaultValue: false,
						},
						ctx
					).enabled
				).toBe(false);

				expect(
					evaluateFlag(
						{
							key: `${label}-100`,
							type: "rollout" as const,
							rolloutPercentage: 100,
							rolloutBy,
							status: "active" as const,
							defaultValue: false,
						},
						ctx
					).enabled
				).toBe(true);
			}
		});

		it(`${label}-based: 50% distributes ~50%`, () => {
			const flag = {
				key: `${label}-50`,
				type: "rollout" as const,
				rolloutPercentage: 50,
				rolloutBy,
				status: "active" as const,
				defaultValue: false,
			};

			let enabled = 0;
			for (let i = 0; i < SAMPLE_SIZE; i += 1) {
				if (evaluateFlag(flag, { [idField]: randomId() }).enabled) {
					enabled += 1;
				}
			}
			expect(enabled).toBeGreaterThan(SAMPLE_SIZE * 0.35);
			expect(enabled).toBeLessThan(SAMPLE_SIZE * 0.65);
		});

		it(`${label}-based: sticky assignment`, () => {
			const flag = {
				key: `${label}-sticky`,
				type: "rollout" as const,
				rolloutPercentage: 50,
				rolloutBy,
				status: "active" as const,
				defaultValue: false,
			};

			for (let i = 0; i < 100; i += 1) {
				const id = randomId();
				const ctx = { [idField]: id, userId: randomId() };
				const r1 = evaluateFlag(flag, ctx);
				const r2 = evaluateFlag(flag, ctx);
				const r3 = evaluateFlag(flag, ctx);
				expect(r1.enabled).toBe(r2.enabled);
				expect(r2.enabled).toBe(r3.enabled);
			}
		});
	}

	it("falls back to anonymous when identifier missing", () => {
		const orgFlag = {
			key: "org-no-id",
			type: "rollout" as const,
			rolloutPercentage: 50,
			rolloutBy: "organization" as const,
			status: "active" as const,
			defaultValue: false,
		};
		const r = evaluateFlag(orgFlag, { userId: "x" });
		expect(r.reason).toMatch(/ROLLOUT/);

		const teamFlag = {
			...orgFlag,
			rolloutBy: "team" as const,
			key: "team-no-id",
		};
		const r2 = evaluateFlag(teamFlag, { userId: "x" });
		expect(r2.reason).toMatch(/ROLLOUT/);
	});
});

describe("target groups", () => {
	it("matches target group rules and respects priority", () => {
		const flag = {
			key: "tg",
			type: "boolean" as const,
			defaultValue: false,
			status: "active" as const,
			rolloutPercentage: null,
			payload: { beta: true },
			rules: [
				{
					type: "user_id" as const,
					operator: "equals",
					value: "direct",
					enabled: true,
					batch: false,
				},
			],
			resolvedTargetGroups: [
				{
					id: "g1",
					rules: [
						{
							type: "email" as const,
							operator: "ends_with",
							value: "@beta.com",
							enabled: true,
							batch: false,
						},
					],
				},
				{
					id: "g2",
					rules: [
						{
							type: "property" as const,
							operator: "equals",
							field: "plan",
							value: "pro",
							enabled: true,
							batch: false,
						},
					],
				},
				{
					id: "blocklist",
					rules: [
						{
							type: "email" as const,
							operator: "contains",
							value: "@blocked",
							enabled: false,
							batch: false,
						},
					],
				},
			],
		};

		expect(evaluateFlag(flag, { userId: "direct" })).toMatchObject({
			enabled: true,
			reason: "USER_RULE_MATCH",
		});

		expect(evaluateFlag(flag, { email: "x@beta.com" })).toMatchObject({
			enabled: true,
			reason: "TARGET_GROUP_MATCH",
		});

		expect(evaluateFlag(flag, { properties: { plan: "pro" } })).toMatchObject({
			enabled: true,
			reason: "TARGET_GROUP_MATCH",
		});

		expect(evaluateFlag(flag, { email: "x@blocked.com" })).toMatchObject({
			enabled: false,
			reason: "TARGET_GROUP_MATCH",
			payload: null,
		});

		expect(evaluateFlag(flag, { userId: "random" })).toMatchObject({
			enabled: false,
			reason: "BOOLEAN_DEFAULT",
		});
	});

	it("handles batch rules in target groups", () => {
		const flag = {
			key: "tg-batch",
			type: "boolean" as const,
			defaultValue: false,
			status: "active" as const,
			rolloutPercentage: null,
			rules: [],
			resolvedTargetGroups: [
				{
					id: "allow",
					rules: [
						{
							type: "user_id" as const,
							operator: "in",
							batch: true,
							batchValues: ["u1", "u2", "u3"],
							enabled: true,
						},
					],
				},
			],
		};

		expect(evaluateFlag(flag, { userId: "u1" }).enabled).toBe(true);
		expect(evaluateFlag(flag, { userId: "u2" }).enabled).toBe(true);
		expect(evaluateFlag(flag, { userId: "u99" }).enabled).toBe(false);
	});
});

describe("edge cases and stress tests", () => {
	it("handles malformed inputs gracefully", () => {
		const badFlags = [
			{ key: "x", type: "boolean", defaultValue: true, rules: null },
			{
				key: "x",
				type: "boolean",
				defaultValue: true,
				rules: [{ type: undefined }],
			},
			{
				key: "x",
				type: "boolean",
				defaultValue: true,
				rules: [{ type: "user_id", operator: "in", values: "not-array" }],
			},
			{
				key: "x",
				type: "rollout",
				rolloutPercentage: null,
				defaultValue: false,
			},
			{ key: "x", type: "multivariant", variants: null },
		];

		for (const flag of badFlags) {
			expect(() =>
				evaluateFlag(flag as never, { userId: "test" })
			).not.toThrow();
		}
	});

	it("handles special characters in identifiers", () => {
		const chars = [
			"<script>alert(1)</script>",
			"'; DROP TABLE users; --",
			"🎉🚀💥🔥",
			"\n\t\r",
			"a".repeat(1000),
			"",
		];

		const flag = {
			key: "special",
			type: "rollout" as const,
			rolloutPercentage: 50,
			status: "active" as const,
			defaultValue: false,
		};

		for (const id of chars) {
			const r = evaluateFlag(flag, { userId: id, email: id });
			expect(r).toBeDefined();
			expect(typeof r.enabled).toBe("boolean");
		}
	});

	it("handles rapid sequential evaluations", () => {
		const flag = {
			key: "rapid",
			type: "rollout" as const,
			rolloutPercentage: 50,
			status: "active" as const,
			defaultValue: false,
		};

		const start = performance.now();
		for (let i = 0; i < 10_000; i += 1) {
			evaluateFlag(flag, { userId: `u${i}` });
		}
		const duration = performance.now() - start;
		expect(duration).toBeLessThan(1000);
	});

	it("handles percentage edge values", () => {
		for (let i = 0; i < 100; i += 1) {
			const ctx = { userId: randomId() };

			expect(
				evaluateFlag(
					{
						key: "z",
						type: "rollout" as const,
						rolloutPercentage: 0,
						status: "active" as const,
						defaultValue: false,
					},
					ctx
				).enabled
			).toBe(false);

			expect(
				evaluateFlag(
					{
						key: "h",
						type: "rollout" as const,
						rolloutPercentage: 100,
						status: "active" as const,
						defaultValue: false,
					},
					ctx
				).enabled
			).toBe(true);
		}

		for (const pct of [10, 25, 50, 75, 90]) {
			const flag = {
				key: `pct-${pct}`,
				type: "rollout" as const,
				rolloutPercentage: pct,
				status: "active" as const,
				defaultValue: false,
			};

			let enabled = 0;
			for (let i = 0; i < SAMPLE_SIZE; i += 1) {
				if (evaluateFlag(flag, { userId: randomId() }).enabled) {
					enabled += 1;
				}
			}

			const lowerBound = Math.max(0, (pct - 20) / 100) * SAMPLE_SIZE;
			const upperBound = Math.min(100, (pct + 20) / 100) * SAMPLE_SIZE;
			expect(enabled).toBeGreaterThanOrEqual(lowerBound);
			expect(enabled).toBeLessThanOrEqual(upperBound);
		}
	});

	it("complex nested context properties", () => {
		const flag = {
			key: "nested",
			type: "boolean" as const,
			defaultValue: false,
			status: "active" as const,
			rolloutPercentage: null,
			rules: [
				{
					type: "property" as const,
					operator: "exists",
					field: "meta",
					enabled: true,
					batch: false,
				},
			],
		};

		expect(
			evaluateFlag(flag, {
				properties: {
					meta: { deep: { nested: { value: [1, 2, { x: "y" }] } } },
				},
			}).enabled
		).toBe(true);
	});
});
