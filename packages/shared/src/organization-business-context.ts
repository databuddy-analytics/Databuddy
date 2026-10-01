import { z } from "zod";

export const BUSINESS_CONTEXT_LIMIT = 12_000;
export const BUSINESS_CONTEXT_GENERATION_TIMEOUT = 180_000;
export const BUSINESS_CONTEXT_DRAFT_HISTORY_LIMIT = 5;
export const BUSINESS_CONTEXT_TEAM_FIELD_LIMIT = 2000;
export const BUSINESS_CONTEXT_PAGE_BUDGET = 12;
const PUBLIC_HOST_SUFFIX = /\.[a-z]{2,}$/i;
const WWW = /^www\./;

export const businessContextSourceUrlsSchema = z
	.array(
		z
			.url()
			.max(2048)
			.refine((value) => {
				if (!URL.canParse(value)) {
					return false;
				}
				const url = new URL(value);
				return (
					(url.protocol === "https:" || url.protocol === "http:") &&
					!url.username &&
					!url.password &&
					!url.port &&
					!url.search &&
					!url.hash &&
					PUBLIC_HOST_SUFFIX.test(url.hostname) &&
					![".local", ".internal", ".localhost"].some((suffix) =>
						url.hostname.endsWith(suffix)
					)
				);
			}, "Use a public HTTP(S) page URL without credentials, ports, queries or fragments")
	)
	.max(6);

export function businessContextSourceBelongsToSite(
	value: string,
	domain: string
): boolean {
	const host = new URL(value).hostname.replace(WWW, "");
	const site = domain.toLowerCase().replace(WWW, "");
	return host === site || host.endsWith(`.${site}`);
}

export const businessContextProgressSchema = z.object({
	stage: z.enum(["reading", "writing"]),
	content: z.string().max(BUSINESS_CONTEXT_LIMIT).optional(),
});

export const businessContextResearchSchema = z.object({
	startedAt: z.iso.datetime(),
	pages: z
		.array(
			z.object({
				url: businessContextSourceUrlsSchema.element,
				status: z.enum(["read", "failed"]),
				title: z.string().max(512).optional(),
			})
		)
		.max(BUSINESS_CONTEXT_PAGE_BUDGET),
	discoveryFailed: z.boolean().optional(),
});

export const DETECTED_ANALYTICS_TOOLS = [
	"amplitude",
	"clarity",
	"fathom",
	"google-analytics",
	"hotjar",
	"matomo",
	"mixpanel",
	"plausible",
	"posthog",
	"segment",
	"simple-analytics",
	"umami",
	"vercel-analytics",
] as const;
export type DetectedAnalyticsTool = (typeof DETECTED_ANALYTICS_TOOLS)[number];

export const ANALYTICS_TOOL_LABELS: Record<
	DetectedAnalyticsTool,
	{
		importProvider?: "plausible" | "posthog" | "simple-analytics";
		name: string;
	}
> = {
	amplitude: { name: "Amplitude" },
	clarity: { name: "Microsoft Clarity" },
	fathom: { name: "Fathom" },
	"google-analytics": { name: "Google Analytics" },
	hotjar: { name: "Hotjar" },
	matomo: { name: "Matomo" },
	mixpanel: { name: "Mixpanel" },
	plausible: { name: "Plausible", importProvider: "plausible" },
	posthog: { name: "PostHog", importProvider: "posthog" },
	segment: { name: "Segment" },
	"simple-analytics": {
		name: "Simple Analytics",
		importProvider: "simple-analytics",
	},
	umami: { name: "Umami" },
	"vercel-analytics": { name: "Vercel Analytics" },
};

const ANALYTICS_SCRIPT_HOSTS: [string, DetectedAnalyticsTool][] = [
	["plausible.io", "plausible"],
	["googletagmanager.com", "google-analytics"],
	["google-analytics.com", "google-analytics"],
	["posthog.com", "posthog"],
	["umami.is", "umami"],
	["usefathom.com", "fathom"],
	["mixpanel.com", "mixpanel"],
	["amplitude.com", "amplitude"],
	["matomo.cloud", "matomo"],
	["simpleanalyticscdn.com", "simple-analytics"],
	["hotjar.com", "hotjar"],
	["segment.com", "segment"],
	["segment.io", "segment"],
	["vercel-scripts.com", "vercel-analytics"],
	["clarity.ms", "clarity"],
];

export function detectAnalyticsTools(hosts: string[]): DetectedAnalyticsTool[] {
	const found = new Set<DetectedAnalyticsTool>();
	for (const host of hosts) {
		const name = host.toLowerCase();
		for (const [suffix, tool] of ANALYTICS_SCRIPT_HOSTS) {
			if (name === suffix || name.endsWith(`.${suffix}`)) {
				found.add(tool);
			}
		}
	}
	return [...found];
}

export const businessSuggestedGoalSchema = z.object({
	name: z.string().trim().min(1).max(100),
	type: z.enum(["PAGE_VIEW", "EVENT"]),
	target: z.string().trim().min(1).max(256),
	reason: z.string().trim().max(200),
});
export const businessSuggestedFunnelSchema = z.object({
	name: z.string().trim().min(1).max(100),
	steps: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(100),
				type: z.enum(["PAGE_VIEW", "EVENT"]),
				target: z.string().trim().min(1).max(256),
			})
		)
		.min(2)
		.max(5),
	reason: z.string().trim().max(200),
});
export type BusinessSuggestedGoal = z.infer<typeof businessSuggestedGoalSchema>;
export type BusinessSuggestedFunnel = z.infer<
	typeof businessSuggestedFunnelSchema
>;

export const businessContextFollowUpQuestionsSchema = z
	.array(
		z.strictObject({
			field: z.enum(["priority", "successDefinition", "exclusions"]),
			question: z.string().trim().min(1).max(300),
		})
	)
	.max(3);

export type BusinessContextResearch = z.infer<
	typeof businessContextResearchSchema
>;

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
	followUpQuestions: businessContextFollowUpQuestionsSchema.optional(),
	sources: z
		.array(
			z.object({
				url: z.url().max(2048),
				title: z.string().max(512),
				fetchedAt: z.iso.datetime({ offset: true }).optional(),
			})
		)
		.max(BUSINESS_CONTEXT_PAGE_BUDGET),
	detectedTools: z.array(z.enum(DETECTED_ANALYTICS_TOOLS)).max(8).optional(),
	suggestedGoals: z.array(businessSuggestedGoalSchema).max(4).optional(),
	suggestedFunnels: z.array(businessSuggestedFunnelSchema).max(2).optional(),
});

export const organizationBusinessProfileSchema = businessBriefSchema.extend({
	research: businessContextResearchSchema.optional(),
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
	sourceUrls: businessContextSourceUrlsSchema.optional(),
	requestedBy: z.string(),
	requestedAt: z.iso.datetime(),
	baseRevision: z.number().int().nonnegative(),
	status: z.enum(["queued", "running", "ready", "failed"]),
	draft: businessBriefSchema.nullable(),
	error: z.string().max(500).nullable(),
	progress: businessContextProgressSchema.optional(),
	research: businessContextResearchSchema.optional(),
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
