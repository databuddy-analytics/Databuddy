import { LINK_SLUG_REGEX } from "@databuddy/shared/constants/links";
import {
	analyticsDateRangeSchema,
	isoDateOrOffsetDateTimeSchema,
} from "@databuddy/validation";
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
			.describe(
				"Date preset such as last_7d. Alternative to from/to; defaults to last_30d."
			),
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
	if (input.preset || !(input.from || input.to)) {
		const { from, to } = resolveDatePreset(input.preset ?? "last_30d", "UTC");
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

export const PageSchema = {
	limit: z
		.number()
		.int()
		.min(1)
		.max(100)
		.optional()
		.default(50)
		.describe("Maximum items to return, 1-100. Defaults to 50."),
	offset: z
		.number()
		.int()
		.min(0)
		.optional()
		.default(0)
		.describe(
			"Items to skip. Use the previous offset plus limit for the next page."
		),
} as const;

export function paginate<T>(
	items: readonly T[],
	page: { limit: number; offset: number }
): { hasMore: boolean; items: T[]; total: number } {
	const pageItems = items.slice(page.offset, page.offset + page.limit);
	return {
		hasMore: page.offset + pageItems.length < items.length,
		items: pageItems,
		total: items.length,
	};
}

export const GoalTypeSchema = z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]);

export const LinkSlugSchema = z
	.string()
	.min(3)
	.max(50)
	.regex(LINK_SLUG_REGEX)
	.describe("3-50 letters, digits, hyphens, or underscores.");

export const LinkExpiresAtSchema = isoDateOrOffsetDateTimeSchema.describe(
	"Expiry as YYYY-MM-DD or an ISO date-time with offset."
);

export function toIsoTimestamp(value: string): string {
	return new Date(value).toISOString();
}

export function omitUndefined(
	input: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined)
	);
}

type Row = Record<string, unknown>;

function asRow(value: unknown): Row {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Row)
		: {};
}

function jsonValue(value: unknown): unknown {
	return value instanceof Date ? value.toISOString() : (value ?? null);
}

export function pickFields(value: unknown, keys: readonly string[]): Row {
	const row = asRow(value);
	return Object.fromEntries(keys.map((key) => [key, jsonValue(row[key])]));
}

export const GOAL_FIELDS = [
	"id",
	"name",
	"type",
	"target",
	"description",
	"filters",
	"isActive",
	"ignoreHistoricData",
	"updatedAt",
] as const;

export const FUNNEL_FIELDS = [
	"id",
	"name",
	"description",
	"steps",
	"filters",
	"isActive",
	"ignoreHistoricData",
	"updatedAt",
] as const;

export const ANNOTATION_FIELDS = [
	"id",
	"annotationType",
	"text",
	"xValue",
	"xEndValue",
	"tags",
	"color",
	"isPublic",
	"updatedAt",
] as const;

export const FLAG_FIELDS = [
	"id",
	"key",
	"name",
	"description",
	"type",
	"status",
	"defaultValue",
	"rolloutPercentage",
	"rolloutBy",
	"rules",
	"variants",
	"dependencies",
	"environment",
	"persistAcrossAuth",
	"payload",
	"targetGroupIds",
	"targetGroups",
	"updatedAt",
] as const;

const MAX_TIME_SERIES_POINTS = 90;
const ANALYTICS_INTERNAL_KEYS = new Set([
	"measurement",
	"savedDefinition",
	"cohort",
	"time_series",
]);

export function summarizeConversionAnalytics(
	value: unknown,
	range: { from?: string; to?: string }
): Row {
	const row = asRow(value);
	const series = Array.isArray(row.time_series) ? row.time_series : null;
	return {
		...Object.fromEntries(
			Object.entries(row).filter(([key]) => !ANALYTICS_INTERNAL_KEYS.has(key))
		),
		range,
		...(series && {
			time_series: series.slice(-MAX_TIME_SERIES_POINTS),
			timeSeriesTruncated: series.length > MAX_TIME_SERIES_POINTS,
		}),
	};
}

export function updatePreview(
	entity: string,
	current: Row,
	updates: Row,
	extra: Row = {}
): Row {
	const hasChanges = Object.keys(updates).length > 0;
	return {
		preview: true,
		message: hasChanges
			? `Review this ${entity} update before applying it.`
			: `No changes detected. The ${entity} will remain unchanged.`,
		confirmationRequired: hasChanges,
		current,
		...(hasChanges ? { updates } : {}),
		...extra,
	};
}

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

export function getResolvedOrganizationId(ctx: McpHandlerContext): string {
	if (!ctx.websiteOrganizationId) {
		throw new McpToolError(
			"not_found",
			"This website is not associated with an organization."
		);
	}
	return ctx.websiteOrganizationId;
}
