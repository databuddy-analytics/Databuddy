import { analyticsDateRangeSchema } from "@databuddy/validation";
import { z } from "zod";
import {
	type DatePreset,
	MCP_DATE_PRESETS,
	resolveDatePreset,
} from "../../lib/date-presets";
import { McpToolError, type McpHandlerContext } from "./define-tool";

const DateOnlySchema = z.iso.date();

export const McpDateRangeSchema = z
	.object({
		preset: z
			.enum(MCP_DATE_PRESETS as [DatePreset, ...DatePreset[]])
			.optional()
			.describe("Date preset such as last_7d. Alternative to from/to."),
		from: DateOnlySchema.optional().describe(
			"Start date YYYY-MM-DD. Use with to; alternative to preset."
		),
		to: DateOnlySchema.optional().describe(
			"End date YYYY-MM-DD. Use with from; alternative to preset."
		),
	})
	.superRefine((input, context) => {
		if (input.preset && (input.from || input.to)) {
			context.addIssue({
				code: "custom",
				message: "Use either preset or from/to, not both.",
				path: ["preset"],
			});
			return;
		}
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

export function resolveMcpDateRange(input: {
	from?: string;
	preset?: DatePreset;
	to?: string;
}): { from?: string; to?: string } {
	if (input.preset) {
		const { from, to } = resolveDatePreset(input.preset, "UTC");
		return { from, to };
	}
	return { from: input.from, to: input.to };
}

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
