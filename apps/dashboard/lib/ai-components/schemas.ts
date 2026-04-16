import { z } from "zod";

export const timeSeriesSchema = z
	.object({
		type: z.string(),
		title: z.string().optional(),
		series: z.array(z.string()),
		rows: z.array(z.array(z.union([z.string(), z.number()]))),
	})
	.passthrough();

export const distributionSchema = z
	.object({
		type: z.string(),
		title: z.string().optional(),
		rows: z.array(z.array(z.union([z.string(), z.number()]))),
	})
	.passthrough();

export const dataTableSchema = z
	.object({
		type: z.literal("data-table"),
		title: z.string().optional(),
		description: z.string().optional(),
		columns: z.array(z.string()),
		align: z.array(z.enum(["left", "center", "right"])).optional(),
		rows: z.array(
			z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
		),
		footer: z.string().optional(),
	})
	.passthrough();

const referrerItemSchema = z
	.object({
		name: z.string(),
		referrer: z.string().optional(),
		domain: z.string().optional(),
		visitors: z.number(),
		pageviews: z.number().optional(),
		percentage: z.number().optional(),
	})
	.passthrough();

export const referrersListSchema = z
	.object({
		type: z.literal("referrers-list"),
		title: z.string().optional(),
		referrers: z.array(referrerItemSchema),
	})
	.passthrough();

const countryItemSchema = z
	.object({
		name: z.string(),
		country_code: z.string().optional(),
		visitors: z.number(),
		pageviews: z.number().optional(),
		percentage: z.number().optional(),
	})
	.passthrough();

export const miniMapSchema = z
	.object({
		type: z.literal("mini-map"),
		title: z.string().optional(),
		countries: z.array(countryItemSchema),
	})
	.passthrough();

const linkItemSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		slug: z.string(),
		targetUrl: z.string(),
		expiresAt: z.string().nullable().optional(),
		createdAt: z.string().optional(),
		ogTitle: z.string().nullable().optional(),
		ogDescription: z.string().nullable().optional(),
		ogImageUrl: z.string().nullable().optional(),
		ogVideoUrl: z.string().nullable().optional(),
		iosUrl: z.string().nullable().optional(),
		androidUrl: z.string().nullable().optional(),
		expiredRedirectUrl: z.string().nullable().optional(),
		organizationId: z.string().optional(),
	})
	.passthrough();

export const linksListSchema = z
	.object({
		type: z.literal("links-list"),
		title: z.string().optional(),
		links: z.array(linkItemSchema),
		baseUrl: z.string().optional(),
	})
	.passthrough();

export const linkPreviewSchema = z
	.object({
		type: z.literal("link-preview"),
		mode: z.enum(["create", "update", "delete"]),
		link: z
			.object({
				name: z.string(),
				targetUrl: z.string(),
				slug: z.string().optional(),
				expiresAt: z.string().nullable().optional(),
				expiredRedirectUrl: z.string().nullable().optional(),
				ogTitle: z.string().nullable().optional(),
				ogDescription: z.string().nullable().optional(),
				ogImageUrl: z.string().nullable().optional(),
			})
			.passthrough(),
		message: z.string().optional(),
	})
	.passthrough();

const funnelStepSchema = z
	.object({
		type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
		target: z.string(),
		name: z.string(),
	})
	.passthrough();

const funnelItemSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		description: z.string().nullable().optional(),
		steps: z.array(funnelStepSchema),
		isActive: z.boolean(),
		createdAt: z.string().optional(),
	})
	.passthrough();

export const funnelsListSchema = z
	.object({
		type: z.literal("funnels-list"),
		title: z.string().optional(),
		funnels: z.array(funnelItemSchema),
	})
	.passthrough();

export const funnelPreviewSchema = z
	.object({
		type: z.literal("funnel-preview"),
		mode: z.enum(["create", "update", "delete"]),
		funnel: z
			.object({
				name: z.string(),
				description: z.string().nullable().optional(),
				steps: z.array(funnelStepSchema),
				ignoreHistoricData: z.boolean().optional(),
			})
			.passthrough(),
	})
	.passthrough();

const goalItemSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		description: z.string().nullable().optional(),
		type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
		target: z.string(),
		isActive: z.boolean(),
		createdAt: z.string().optional(),
	})
	.passthrough();

export const goalsListSchema = z
	.object({
		type: z.literal("goals-list"),
		title: z.string().optional(),
		goals: z.array(goalItemSchema),
	})
	.passthrough();

export const goalPreviewSchema = z
	.object({
		type: z.literal("goal-preview"),
		mode: z.enum(["create", "update", "delete"]),
		goal: z
			.object({
				name: z.string(),
				description: z.string().nullable().optional(),
				type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
				target: z.string(),
				ignoreHistoricData: z.boolean().optional(),
			})
			.passthrough(),
	})
	.passthrough();

const annotationItemSchema = z
	.object({
		id: z.string(),
		text: z.string(),
		annotationType: z.enum(["point", "line", "range"]),
		xValue: z.string(),
		xEndValue: z.string().nullable().optional(),
		color: z.string().nullable().optional(),
		tags: z.array(z.string()).optional(),
		isPublic: z.boolean().optional(),
		createdAt: z.string().optional(),
	})
	.passthrough();

export const annotationsListSchema = z
	.object({
		type: z.literal("annotations-list"),
		title: z.string().optional(),
		annotations: z.array(annotationItemSchema),
	})
	.passthrough();

export const annotationPreviewSchema = z
	.object({
		type: z.literal("annotation-preview"),
		mode: z.enum(["create", "update", "delete"]),
		annotation: z
			.object({
				text: z.string(),
				annotationType: z.enum(["point", "line", "range"]),
				xValue: z.string(),
				xEndValue: z.string().nullable().optional(),
				color: z.string().nullable().optional(),
				tags: z.array(z.string()).optional(),
				isPublic: z.boolean().optional(),
			})
			.passthrough(),
	})
	.passthrough();

export const componentSchemaMap: Record<string, z.ZodTypeAny> = {
	"line-chart": timeSeriesSchema,
	"bar-chart": timeSeriesSchema,
	"area-chart": timeSeriesSchema,
	"stacked-bar-chart": timeSeriesSchema,
	"pie-chart": distributionSchema,
	"donut-chart": distributionSchema,
	"data-table": dataTableSchema,
	"referrers-list": referrersListSchema,
	"mini-map": miniMapSchema,
	"links-list": linksListSchema,
	"link-preview": linkPreviewSchema,
	"funnels-list": funnelsListSchema,
	"funnel-preview": funnelPreviewSchema,
	"goals-list": goalsListSchema,
	"goal-preview": goalPreviewSchema,
	"annotations-list": annotationsListSchema,
	"annotation-preview": annotationPreviewSchema,
};

export function validateComponentJSON(input: unknown): {
	valid: boolean;
	data?: unknown;
	error?: string;
} {
	if (
		input === null ||
		input === undefined ||
		typeof input !== "object" ||
		!("type" in input)
	) {
		return {
			valid: false,
			error: "Input must be an object with a 'type' field",
		};
	}

	const { type } = input as { type: unknown };

	if (typeof type !== "string") {
		return { valid: false, error: "'type' field must be a string" };
	}

	const schema = componentSchemaMap[type];

	if (!schema) {
		return { valid: false, error: `Unknown component type: "${type}"` };
	}

	const result = schema.safeParse(input);

	if (!result.success) {
		return { valid: false, error: result.error.message };
	}

	return { valid: true, data: result.data };
}
