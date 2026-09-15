import { z } from "zod";

export const BUSINESS_CONTEXT_LIMIT = 12_000;
export const BUSINESS_CONTEXT_GENERATION_TIMEOUT = 180_000;
export const BUSINESS_CONTEXT_DRAFT_HISTORY_LIMIT = 5;
export const BUSINESS_CONTEXT_TEAM_FIELD_LIMIT = 2000;

export const businessMeasurementPlanSchema = z.object({
	websiteId: z.string().min(1).max(256),
	domain: z.string().min(1).max(2048),
	name: z.string().trim().min(1).max(120),
	activationEvent: z.string().trim().min(1).max(256),
	returnEvent: z.string().trim().min(1).max(256),
	horizonDays: z.union([z.literal(7), z.literal(30)]),
	namespace: z.string().trim().min(1).max(256).optional(),
});

export const businessMeasurementPlansSchema = z
	.array(businessMeasurementPlanSchema)
	.max(20)
	.refine(
		(plans) =>
			new Set(plans.map((plan) => plan.websiteId)).size === plans.length,
		"Keep one activation and return definition per website"
	);

export type BusinessMeasurementPlan = z.infer<
	typeof businessMeasurementPlanSchema
>;

export function formatBusinessMeasurementPlans(
	plans: BusinessMeasurementPlan[] = []
): string {
	return plans
		.map(
			(plan) =>
				`${plan.name} (${plan.domain}): ${plan.activationEvent} → ${plan.returnEvent} within ${plan.horizonDays} days${plan.namespace ? `; namespace ${plan.namespace}` : ""}`
		)
		.join("\n");
}

export const businessTeamContextSchema = z.object({
	priority: z.string().trim().max(BUSINESS_CONTEXT_TEAM_FIELD_LIMIT),
	successDefinition: z.string().trim().max(BUSINESS_CONTEXT_TEAM_FIELD_LIMIT),
	exclusions: z.string().trim().max(BUSINESS_CONTEXT_TEAM_FIELD_LIMIT),
});

export const businessContextEditSchema = z.object({
	revision: z.number().int().nonnegative(),
	content: z.string().trim().max(BUSINESS_CONTEXT_LIMIT),
	teamContext: businessTeamContextSchema.optional(),
	measurementPlans: businessMeasurementPlansSchema.optional(),
	generationId: z.uuid().optional(),
});

export const businessBriefSchema = z.object({
	content: z.string().trim().max(BUSINESS_CONTEXT_LIMIT),
	sources: z
		.array(
			z.object({
				url: z.url().max(2048),
				title: z.string().max(512),
			})
		)
		.max(8),
});

export const organizationBusinessProfileSchema = businessBriefSchema.extend({
	origin: z.enum(["team", "website", "mixed"]),
	teamContext: businessTeamContextSchema.optional(),
	measurementPlans: businessMeasurementPlansSchema.optional(),
	revision: z.number().int().positive(),
	updatedAt: z.iso.datetime(),
	updatedBy: z.string(),
	sourceWebsiteId: z.string().nullable(),
});

export const businessContextGenerationSchema = z.object({
	id: z.string(),
	websiteId: z.string(),
	domain: z.string(),
	requestedBy: z.string(),
	requestedAt: z.iso.datetime(),
	baseRevision: z.number().int().nonnegative(),
	status: z.enum(["queued", "running", "ready", "failed"]),
	draft: businessBriefSchema.nullable(),
	error: z.string().max(500).nullable(),
});

export const organizationBusinessContextSchema = z.object({
	profile: organizationBusinessProfileSchema.nullable(),
	generation: businessContextGenerationSchema.nullable(),
	previousDrafts: z
		.array(businessContextGenerationSchema)
		.max(BUSINESS_CONTEXT_DRAFT_HISTORY_LIMIT)
		.optional(),
	history: z
		.array(organizationBusinessProfileSchema)
		.max(BUSINESS_CONTEXT_DRAFT_HISTORY_LIMIT)
		.optional(),
});

export const businessContextSettingsSchema =
	organizationBusinessContextSchema.extend({
		canEdit: z.boolean(),
		websites: z.array(
			z.object({ id: z.string(), name: z.string(), domain: z.string() })
		),
	});

export type BusinessBrief = z.infer<typeof businessBriefSchema>;
export type BusinessTeamContext = z.infer<typeof businessTeamContextSchema>;
export type BusinessContextEdit = z.infer<typeof businessContextEditSchema>;

export function formatBusinessTeamContext(
	context?: BusinessTeamContext
): string {
	if (!context) {
		return "";
	}
	return [
		context.priority && `Current priority: ${context.priority}`,
		context.successDefinition &&
			`Success definition: ${context.successDefinition}`,
		context.exclusions && `Exclusions and constraints: ${context.exclusions}`,
	]
		.filter(Boolean)
		.join("\n\n");
}
export type OrganizationBusinessProfile = z.infer<
	typeof organizationBusinessProfileSchema
>;
export type OrganizationBusinessContext = z.infer<
	typeof organizationBusinessContextSchema
>;
export type BusinessContextSettings = z.infer<
	typeof businessContextSettingsSchema
>;

export function businessContextIsGenerating(
	state: OrganizationBusinessContext
): boolean {
	return (
		state.generation?.status === "queued" ||
		state.generation?.status === "running"
	);
}
