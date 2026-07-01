import { tool } from "ai";
import { z } from "zod";
import { getAppContext } from "./utils";

const dashboardActionParamValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

const dashboardActionFilterSchema = z.object({
	field: z.string().min(1).max(120),
	operator: z.enum([
		"eq",
		"ne",
		"contains",
		"not_contains",
		"starts_with",
		"in",
		"not_in",
	]),
	value: z.union([
		z.string().max(300),
		z.number(),
		z.array(z.union([z.string().max(300), z.number()])).max(20),
	]),
});

const dashboardActionSchema = z
	.object({
		description: z.string().trim().min(1).max(160).optional(),
		eventName: z.string().trim().min(1).max(200).optional(),
		filters: z.array(dashboardActionFilterSchema).max(12).optional(),
		href: z
			.string()
			.trim()
			.min(1)
			.max(500)
			.optional()
			.describe(
				"Preferred navigation destination. Use a safe relative dashboard path such as /websites/{websiteId}/errors."
			),
		label: z
			.string()
			.trim()
			.min(1)
			.max(80)
			.optional()
			.describe(
				"Short natural-language button label, usually a noun phrase like Errors, Events stream, or Tracking setup."
			),
		params: z.record(z.string(), dashboardActionParamValueSchema).optional(),
		preserveAnalyticsContext: z.boolean().optional(),
		target: z
			.string()
			.trim()
			.min(1)
			.max(120)
			.optional()
			.describe(
				"Optional semantic dashboard shortcut from the system prompt. Prefer href for normal navigation."
			),
		websiteId: z.string().trim().min(1).max(200).optional(),
	})
	.refine((action) => Boolean(action.target ?? action.href), {
		message: "Dashboard actions require target or href",
	});

export const dashboardActionsTool = tool({
	description:
		"Create clickable dashboard navigation actions. Use this when the user asks to go, open, navigate, or take them to a Databuddy dashboard page, or when an answer should include a clear next dashboard surface to inspect. Prefer safe relative hrefs; use semantic targets only as shortcuts. The model writes the action label and description in natural language. This tool does not fetch analytics data.",
	inputSchema: z.object({
		actions: z
			.array(dashboardActionSchema)
			.min(1)
			.max(4)
			.describe(
				"One to four dashboard navigation actions. Each action needs either a semantic target or a safe dashboard href."
			),
		title: z.string().trim().min(1).max(80).optional(),
		websiteId: z.string().trim().min(1).max(200).optional(),
	}),
	execute: ({ actions, title, websiteId }, options) => {
		const context = getAppContext(options);
		const resolvedWebsiteId =
			websiteId ?? context.defaultWebsiteId ?? context.websiteId;

		return {
			type: "dashboard-actions",
			title: title ?? "Open in dashboard",
			websiteId: resolvedWebsiteId,
			actions: actions.map(
				({ label, websiteId: actionWebsiteId, ...action }) => ({
					...action,
					label: label ?? action.eventName ?? "Open",
					websiteId: actionWebsiteId ?? resolvedWebsiteId,
				})
			),
		};
	},
});
