import { z } from "zod";

export const userRuleSchema = z.object({
	type: z.enum(["user_id", "email", "property"]),
	operator: z.enum([
		"equals",
		"contains",
		"starts_with",
		"ends_with",
		"in",
		"not_in",
		"exists",
		"not_exists",
	]),
	field: z.string().optional(),
	value: z.string().optional(),
	values: z.array(z.string()).optional(),
	enabled: z.boolean(),
	batch: z.boolean(),
	batchValues: z.array(z.string()).optional(),
});

export const variantSchema = z.object({
	key: z.string().min(1, "Key is required").max(50, "Key too long"),
	value: z.unknown(),
	weight: z
		.number()
		.min(0, "Weight must be >= 0")
		.max(100, "Weight must be <= 100")
		.optional(),
	description: z.string().optional(),
	type: z.enum(["string", "number", "json"]),
});
export type Variant = z.infer<typeof variantSchema>;
const flagTypeEnum = z.enum(["boolean", "rollout", "multivariant"]);
export type FlagType = z.infer<typeof flagTypeEnum>;
export const flagFormShape = {
	key: z
		.string()
		.min(1, "Key is required")
		.max(100, "Key too long")
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Key must contain only letters, numbers, underscores, and hyphens"
		),
	name: z
		.string()
		.min(1, "Name is required")
		.max(100, "Name too long")
		.optional(),
	description: z.string().optional(),
	type: flagTypeEnum,
	status: z.enum(["active", "inactive", "archived"]),
	defaultValue: z.boolean(),
	rolloutPercentage: z.number().min(0).max(100),
	rolloutBy: z.string().optional(),
	rules: z.array(userRuleSchema).optional(),
	variants: z.array(variantSchema).optional(),
	dependencies: z
		.array(z.string().min(1, "Invalid dependency value"))
		.optional(),
	environment: z.string().nullable().optional(),
	targetGroupIds: z.array(z.string()).optional(),
};
export const flagFormSchema = z
	.object(flagFormShape)
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
export type TFlag = z.infer<typeof flagFormSchema>;
