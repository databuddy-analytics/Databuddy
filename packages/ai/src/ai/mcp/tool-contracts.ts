import { LINK_SLUG_REGEX } from "@databuddy/shared/constants/links";
import { ORPCError } from "@orpc/server";
import {
	analyticsDateRangeSchema,
	isoDateOrOffsetDateTimeSchema,
} from "@databuddy/validation";
import { z } from "zod";
import {
	type DatePreset,
	DatePresetSchema,
	resolveDatePreset,
} from "../../lib/date-presets";
import { captureError } from "../../lib/tracing";
import { callRPCProcedure } from "../tools/utils";
import { McpToolError, type McpHandlerContext } from "./define-tool";
import { buildRpcContext } from "./tool-context";

const DateOnlySchema = z.iso.date();

export const McpDateRangeSchema = z
	.object({
		preset: DatePresetSchema.optional().describe(
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

export const LinkSlugSchema = z
	.string()
	.min(3)
	.max(50)
	.regex(LINK_SLUG_REGEX)
	.describe("3-50 letters, digits, hyphens, or underscores.");

export const LinkExpiresAtSchema = isoDateOrOffsetDateTimeSchema.describe(
	"Expiry as YYYY-MM-DD or an ISO date-time with offset."
);

type Row = Record<string, unknown>;

function asRow(value: unknown): Row {
	return value && typeof value === "object" && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
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
	"targetGroups",
	"updatedAt",
] as const;

export const FLAG_WRITE_FIELDS = FLAG_FIELDS.filter(
	(field) => field !== "targetGroups"
);

const FLAG_RULE_VALUE_LIMIT = 10;
const TARGET_GROUP_FIELDS = ["id", "name", "description", "rules"] as const;

function stringValues(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function summarizeFlagRules(rules: unknown, valueLimit: number): unknown {
	if (!Array.isArray(rules)) {
		return rules ?? null;
	}
	return rules.map((rule) => {
		const { values, batchValues, ...rest } = asRow(rule);
		const batchTargets = stringValues(batchValues);
		const [key, targets] =
			rest.batch === true && batchTargets.length > 0
				? ["batchValues", batchTargets]
				: ["values", stringValues(values)];
		if (targets.length === 0) {
			return rest;
		}
		return {
			...rest,
			[key]: targets.slice(0, valueLimit),
			...(targets.length > valueLimit && {
				valueCount: targets.length,
				valuesTruncated: true,
			}),
		};
	});
}

export function pickFlagFields(
	value: unknown,
	keys: readonly string[] = FLAG_FIELDS,
	ruleValueLimit = FLAG_RULE_VALUE_LIMIT
): Row {
	const flag = pickFields(value, keys);
	return {
		...flag,
		...("rules" in flag && {
			rules: summarizeFlagRules(flag.rules, ruleValueLimit),
		}),
		...(Array.isArray(flag.targetGroups) && {
			targetGroups: flag.targetGroups.map((group) => {
				const summary = pickFields(group, TARGET_GROUP_FIELDS);
				return {
					...summary,
					rules: summarizeFlagRules(summary.rules, ruleValueLimit),
				};
			}),
		}),
	};
}

const MAX_TIME_SERIES_POINTS = 90;
const ANALYTICS_INTERNAL_KEYS = [
	"measurement",
	"savedDefinition",
	"cohort",
	"time_series",
	"steps_analytics",
];
const UNMEASURED_TIMING_KEYS = [
	"avg_completion_time",
	"avg_completion_time_formatted",
	"duration_available",
	"avg_time_to_complete",
	"avg_time",
];
const UNMEASURED_ERROR_KEYS = [
	"error_insights",
	"error_context_available",
	"error_count",
	"error_rate",
	"top_errors",
];

function omitKeys(row: Row, keys: ReadonlySet<string>): Row {
	return Object.fromEntries(
		Object.entries(row).filter(([key]) => !keys.has(key))
	);
}

export function summarizeConversionAnalytics(
	value: unknown,
	requestedRange: { from?: string; to?: string }
): Row {
	const row = asRow(value);
	const measurement = asRow(row.measurement);
	const range = {
		from:
			typeof measurement.startDate === "string"
				? measurement.startDate
				: requestedRange.from,
		to:
			typeof measurement.endDate === "string"
				? measurement.endDate
				: requestedRange.to,
	};
	const omitted = new Set([
		...ANALYTICS_INTERNAL_KEYS,
		...(row.duration_available === true ? [] : UNMEASURED_TIMING_KEYS),
		...(asRow(row.error_insights).available === true
			? []
			: UNMEASURED_ERROR_KEYS),
	]);
	const steps = Array.isArray(row.steps_analytics) ? row.steps_analytics : null;
	const series = Array.isArray(row.time_series) ? row.time_series : null;
	return {
		...omitKeys(row, omitted),
		range,
		...((range.from !== requestedRange.from ||
			range.to !== requestedRange.to) && { requestedRange }),
		...(steps && {
			steps_analytics: steps.map((step) => omitKeys(asRow(step), omitted)),
		}),
		...(series && {
			time_series: series
				.slice(-MAX_TIME_SERIES_POINTS)
				.map((point) => omitKeys(asRow(point), omitted)),
			timeSeriesTruncated: series.length > MAX_TIME_SERIES_POINTS,
		}),
	};
}

export async function readConversionAnalytics(
	tool: string,
	procedure: readonly ["funnels" | "goals", string],
	input: Record<string, unknown>,
	ctx: McpHandlerContext
): Promise<unknown> {
	const [router, method] = procedure;
	try {
		return await callRPCProcedure(
			router,
			method,
			input,
			buildRpcContext(ctx),
			ctx.abortSignal
		);
	} catch (error) {
		if (error instanceof ORPCError || error instanceof McpToolError) {
			throw error;
		}
		captureError(error, { mcp_tool: tool });
		throw new McpToolError("query_failed", `The ${tool} query failed to run.`, {
			hint: "Shorten the date range or retry.",
		});
	}
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
