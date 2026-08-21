import { analyticsDateRangeSchema } from "@databuddy/validation";
import { z } from "zod";
import { McpToolError, type McpHandlerContext } from "./define-tool";

const DateOnlySchema = z.iso.date();

export const McpDateRangeSchema = z
	.object({
		from: DateOnlySchema.optional().describe(
			"Start date YYYY-MM-DD (defaults to 30 days ago)"
		),
		to: DateOnlySchema.optional().describe(
			"End date YYYY-MM-DD (defaults to today)"
		),
	})
	.superRefine((input, context) => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: input.from,
			endDate: input.to,
		});
		for (const issue of result.error?.issues ?? []) {
			if (issue.code === "custom") {
				context.addIssue({
					code: "custom",
					message: issue.message,
					path: [issue.path[0] === "startDate" ? "from" : "to"],
				});
			}
		}
	});

export const WebsiteSelectorSchema = {
	websiteId: z.string().optional().describe("Website ID from list_websites"),
	websiteName: z
		.string()
		.optional()
		.describe("Website name. Alternative to websiteId."),
	websiteDomain: z
		.string()
		.optional()
		.describe("Website domain. Alternative to websiteId."),
} as const;

export const WorkflowFilterSchema = z.object({
	field: z.string(),
	operator: z.enum(["equals", "contains", "not_equals", "in", "not_in"]),
	value: z.union([z.string(), z.array(z.string())]),
});

export const ConfirmedSchema = z.boolean().optional().default(false);
export const DynamicObjectSchema = z.object({}).passthrough();
export const MutationResultSchema = z
	.object({
		confirmationRequired: z.boolean().optional(),
		message: z.string(),
		preview: z.boolean().optional(),
		success: z.boolean().optional(),
	})
	.passthrough();

export function getResolvedWebsiteId(ctx: McpHandlerContext): string {
	if (!ctx.websiteId) {
		throw new McpToolError("internal", "Website was not resolved.");
	}
	return ctx.websiteId;
}
