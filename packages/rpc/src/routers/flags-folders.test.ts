import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { flagFormSchema, userRuleSchema, variantSchema } from "@databuddy/shared/flags";

// Re-create schemas locally for testing (matching the router)
const listFlagsSchema = z
	.object({
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
		status: z.enum(["active", "inactive", "archived"]).optional(),
		folder: z.string().optional(),
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

const createFlagSchema = z
	.object({
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
		payload: z.any().optional(),
		persistAcrossAuth: z.boolean().optional(),
		folder: z
			.string()
			.max(100)
			.regex(/^[a-zA-Z0-9_\-/ ]*$/)
			.nullable()
			.optional(),
		...flagFormSchema.shape,
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

const updateFlagSchema = z
	.object({
		id: z.string(),
		name: z.string().min(1).max(100).optional(),
		description: z.string().optional(),
		type: z.enum(["boolean", "rollout", "multivariant"]).optional(),
		status: z.enum(["active", "inactive", "archived"]).optional(),
		defaultValue: z.boolean().optional(),
		payload: z.any().optional(),
		rules: z.array(userRuleSchema).optional(),
		persistAcrossAuth: z.boolean().optional(),
		rolloutPercentage: z.number().min(0).max(100).optional(),
		rolloutBy: z.string().optional(),
		variants: z.array(variantSchema).optional(),
		dependencies: z.array(z.string()).optional(),
		environment: z.string().optional(),
		targetGroupIds: z.array(z.string()).optional(),
		folder: z
			.string()
			.max(100)
			.regex(/^[a-zA-Z0-9_\-/ ]*$/)
			.nullable()
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.type === "multivariant" && data.variants) {
			const hasAnyWeight = data.variants.some(
				(v) => typeof v.weight === "number"
			);
			if (hasAnyWeight) {
				const totalWeight = data.variants.reduce(
					(sum, v) => sum + (typeof v.weight === "number" ? v.weight : 0),
					0
				);
				if (totalWeight !== 100) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["variants"],
						message: "When specifying weights, they must sum to 100%",
					});
				}
			}
		}
	});

// ── Folder field in flagFormSchema ──

describe("flagFormSchema folder field", () => {
	const baseFlag = {
		key: "test-flag",
		name: "Test Flag",
		description: "A test flag",
		type: "boolean" as const,
		status: "active" as const,
		defaultValue: false,
		rolloutPercentage: 0,
	};

	it("accepts flag without folder (backward compatible)", () => {
		const result = flagFormSchema.safeParse(baseFlag);
		expect(result.success).toBe(true);
	});

	it("accepts flag with null folder", () => {
		const result = flagFormSchema.safeParse({ ...baseFlag, folder: null });
		expect(result.success).toBe(true);
	});

	it("accepts flag with undefined folder", () => {
		const result = flagFormSchema.safeParse({
			...baseFlag,
			folder: undefined,
		});
		expect(result.success).toBe(true);
	});

	it("accepts flag with a simple folder name", () => {
		const result = flagFormSchema.safeParse({ ...baseFlag, folder: "auth" });
		expect(result.success).toBe(true);
	});

	it("accepts flag with a nested folder path", () => {
		const result = flagFormSchema.safeParse({
			...baseFlag,
			folder: "billing/payments",
		});
		expect(result.success).toBe(true);
	});

	it("accepts flag with a folder containing spaces", () => {
		const result = flagFormSchema.safeParse({
			...baseFlag,
			folder: "My Features",
		});
		expect(result.success).toBe(true);
	});

	it("accepts flag with a folder containing underscores and hyphens", () => {
		const result = flagFormSchema.safeParse({
			...baseFlag,
			folder: "feature_flags/ab-tests",
		});
		expect(result.success).toBe(true);
	});

	it("rejects folder with special characters", () => {
		const result = flagFormSchema.safeParse({
			...baseFlag,
			folder: "auth@login",
		});
		expect(result.success).toBe(false);
	});

	it("rejects folder with dots", () => {
		const result = flagFormSchema.safeParse({
			...baseFlag,
			folder: "auth.login",
		});
		expect(result.success).toBe(false);
	});

	it("rejects folder name longer than 100 characters", () => {
		const longFolder = "a".repeat(101);
		const result = flagFormSchema.safeParse({
			...baseFlag,
			folder: longFolder,
		});
		expect(result.success).toBe(false);
	});

	it("accepts folder name exactly 100 characters", () => {
		const maxFolder = "a".repeat(100);
		const result = flagFormSchema.safeParse({
			...baseFlag,
			folder: maxFolder,
		});
		expect(result.success).toBe(true);
	});

	it("accepts empty string folder", () => {
		const result = flagFormSchema.safeParse({ ...baseFlag, folder: "" });
		expect(result.success).toBe(true);
	});
});

// ── listFlagsSchema folder filter ──

describe("listFlagsSchema folder filter", () => {
	it("accepts list without folder filter", () => {
		const result = listFlagsSchema.safeParse({ websiteId: "ws-123" });
		expect(result.success).toBe(true);
	});

	it("accepts list with folder filter", () => {
		const result = listFlagsSchema.safeParse({
			websiteId: "ws-123",
			folder: "auth",
		});
		expect(result.success).toBe(true);
	});

	it("accepts list with empty string folder filter (uncategorized)", () => {
		const result = listFlagsSchema.safeParse({
			websiteId: "ws-123",
			folder: "",
		});
		expect(result.success).toBe(true);
	});

	it("accepts list with nested folder filter", () => {
		const result = listFlagsSchema.safeParse({
			websiteId: "ws-123",
			folder: "billing/payments",
		});
		expect(result.success).toBe(true);
	});

	it("accepts list with both folder and status", () => {
		const result = listFlagsSchema.safeParse({
			websiteId: "ws-123",
			folder: "auth",
			status: "active",
		});
		expect(result.success).toBe(true);
	});
});

// ── createFlagSchema folder support ──

describe("createFlagSchema folder support", () => {
	const baseCreateInput = {
		websiteId: "ws-123",
		key: "test-flag",
		name: "Test Flag",
		type: "boolean" as const,
		status: "active" as const,
		defaultValue: false,
		rolloutPercentage: 0,
	};

	it("accepts create without folder (backward compatible)", () => {
		const result = createFlagSchema.safeParse(baseCreateInput);
		expect(result.success).toBe(true);
	});

	it("accepts create with folder", () => {
		const result = createFlagSchema.safeParse({
			...baseCreateInput,
			folder: "auth",
		});
		expect(result.success).toBe(true);
	});

	it("accepts create with null folder", () => {
		const result = createFlagSchema.safeParse({
			...baseCreateInput,
			folder: null,
		});
		expect(result.success).toBe(true);
	});

	it("accepts create with nested folder path", () => {
		const result = createFlagSchema.safeParse({
			...baseCreateInput,
			folder: "billing/payments/subscriptions",
		});
		expect(result.success).toBe(true);
	});

	it("rejects create with invalid folder characters", () => {
		const result = createFlagSchema.safeParse({
			...baseCreateInput,
			folder: "auth<script>",
		});
		expect(result.success).toBe(false);
	});

	it("rejects create with folder name over 100 chars", () => {
		const result = createFlagSchema.safeParse({
			...baseCreateInput,
			folder: "x".repeat(101),
		});
		expect(result.success).toBe(false);
	});
});

// ── updateFlagSchema folder support ──

describe("updateFlagSchema folder support", () => {
	it("accepts update without folder (no change)", () => {
		const result = updateFlagSchema.safeParse({ id: "flag-123" });
		expect(result.success).toBe(true);
	});

	it("accepts update with folder assignment", () => {
		const result = updateFlagSchema.safeParse({
			id: "flag-123",
			folder: "auth",
		});
		expect(result.success).toBe(true);
	});

	it("accepts update with null folder (move to root)", () => {
		const result = updateFlagSchema.safeParse({
			id: "flag-123",
			folder: null,
		});
		expect(result.success).toBe(true);
	});

	it("accepts update changing folder to nested path", () => {
		const result = updateFlagSchema.safeParse({
			id: "flag-123",
			folder: "billing/payments",
		});
		expect(result.success).toBe(true);
	});

	it("rejects update with invalid folder characters", () => {
		const result = updateFlagSchema.safeParse({
			id: "flag-123",
			folder: "folder!@#$",
		});
		expect(result.success).toBe(false);
	});

	it("does not affect other update fields when folder is set", () => {
		const result = updateFlagSchema.safeParse({
			id: "flag-123",
			name: "Updated Name",
			status: "active",
			folder: "auth",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe("Updated Name");
			expect(result.data.status).toBe("active");
			expect(result.data.folder).toBe("auth");
		}
	});
});

// ── Folder path validation patterns ──

describe("folder path validation", () => {
	const folderSchema = z
		.string()
		.max(100)
		.regex(/^[a-zA-Z0-9_\-/ ]*$/);

	const validFolders = [
		"auth",
		"billing",
		"billing/payments",
		"feature-flags/ab-tests",
		"user_auth/login",
		"My Features",
		"level1/level2/level3",
		"A",
		"123",
		"",
	];

	const invalidFolders = [
		"auth@login",
		"folder.name",
		"folder\\name",
		"auth<script>",
		"folder#tag",
		"folder$money",
		"folder%encode",
		"folder&ampersand",
		"folder(paren)",
		"folder{brace}",
	];

	for (const folder of validFolders) {
		it(`accepts valid folder: "${folder}"`, () => {
			const result = folderSchema.safeParse(folder);
			expect(result.success).toBe(true);
		});
	}

	for (const folder of invalidFolders) {
		it(`rejects invalid folder: "${folder}"`, () => {
			const result = folderSchema.safeParse(folder);
			expect(result.success).toBe(false);
		});
	}
});
