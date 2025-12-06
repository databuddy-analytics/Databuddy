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
    value: z.union([
        z.string(),
        z.number(),
    ]),
    weight: z.number().min(0, "Weight must be >= 0").max(100, "Weight must be <= 100").optional(),
    description: z.string().optional(),
    type: z.enum(["string", "number"]),
});
export type Variant = z.infer<typeof variantSchema>;
const flagTypeEnum = z.enum(["boolean", "rollout", "multivariant"]);
export type FlagType = z.infer<typeof flagTypeEnum>;
export const flagFormSchema = z
    .object({
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
        rules: z.array(userRuleSchema).optional(),
        variants: z.array(variantSchema).optional(),
        dependencies: z.array(z.string().min(1, "Invalid dependency value")).optional(),
        environment: z.string().nullable().optional(),
    })
    .superRefine((data, ctx) => {
        if (data.type === "multivariant" && data.variants) {
            const hasAnyWeight = data.variants.some((v) => typeof v.weight === "number");
            if (hasAnyWeight) {
                const totalWeight = data.variants.reduce((sum, v) => sum + (typeof v.weight === "number" ? v.weight : 0), 0);
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
export const flagScheduleTypeEnum = z.enum([
    "enable",
    "disable",
    "update_rollout",
]);
export type FlagScheduleType = z.infer<typeof flagScheduleTypeEnum>;

export const rolloutStepSchema = z.object({
    scheduledAt: z.string(),
    executedAt: z.string().optional(),
    value: z.union([
        z.number().min(0).max(100),
        z.literal("enable"),
        z.literal("disable"),
    ]),
});

export type RolloutStep = z.infer<typeof rolloutStepSchema>;

export const flagScheduleSchema = z.object({
    id: z.string().optional(),
    isEnabled: z.boolean(),
    flagId: z.string(),
    type: flagScheduleTypeEnum,
    scheduledAt: z.string().optional(),
    rolloutSteps: z.array(rolloutStepSchema).optional(),
}).superRefine(
    (data, ctx) => {
        if (!data.isEnabled) return
        if (data.type !== "update_rollout") {

            if (data.rolloutSteps && data?.rolloutSteps?.length > 0) {
                ctx.addIssue({
                    code: "custom",
                    path: ["rolloutSteps"],
                    message: "Rollout steps allowed only for update_rollout type",
                });
            }
            if (!data.scheduledAt) {
                ctx.addIssue({
                    code: "custom",
                    path: ['scheduledAt'],
                    message: "Date time is required for enable/disable schedule types",
                })
            }
            const scheduledDate = new Date(data.scheduledAt!);
            if (isNaN(scheduledDate.getTime())) {
                ctx.addIssue({
                    code: "custom",
                    path: ['scheduledAt'],
                    message: "Invalid schedule date",
                })
            }

            if (Date.now() > new Date(data.scheduledAt!).getTime()) {
                ctx.addIssue({
                    code: "custom",
                    path: ['scheduledAt'],
                    message: "Scheduled time must be in the future",
                })
            }
        } else {
            if (data.scheduledAt) {
                ctx.addIssue({
                    code: "custom",
                    path: ['scheduledAt'],
                    message: "scheduledAt not allowed for rollout schedules",
                })
            }
            if (!Array.isArray(data.rolloutSteps)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["rolloutSteps"],
                    message: "Rollout steps are required for batch rollout schedules",
                })
                return
            }
            for (const step of data.rolloutSteps) {
                if (typeof step.value !== "number") {
                    ctx.addIssue({
                        code: "custom",
                        path: ["value"],
                        message: "Step value must be a number between 0 and 100 for rollout steps",
                    });
                    continue
                }
                if (step.value < 0 || step.value > 100) {
                    ctx.addIssue({
                        code: "custom",
                        path: ["value"],
                        message: "Step value must be a number between 0 and 100 for rollout steps",
                    });
                }

                if (Date.now() > new Date(step.scheduledAt!).getTime()) {
                    ctx.addIssue({
                        code: "custom",
                        path: ['rolloutSteps'],
                        message: "Scheduled time must be in the future",
                    })
                }
            }
        }
    }
);
export type FlagSchedule = z.infer<typeof flagScheduleSchema>;


export const flagWithScheduleSchema = z.object({
    flag: flagFormSchema,
    schedule: flagScheduleSchema.optional(),
});

export type FlagWithScheduleForm = z.infer<typeof flagWithScheduleSchema>;
