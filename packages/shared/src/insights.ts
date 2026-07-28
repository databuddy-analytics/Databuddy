import { z } from "zod";

export const weekOverWeekPeriodSchema = z
	.object({
		current: z
			.object({
				from: z.iso.date(),
				to: z.iso.date(),
			})
			.strict(),
		previous: z
			.object({
				from: z.iso.date(),
				to: z.iso.date(),
			})
			.strict(),
	})
	.strict();

export type WeekOverWeekPeriod = z.infer<typeof weekOverWeekPeriodSchema>;

export const insightSeveritySchema = z.enum(["critical", "warning", "info"]);
export const insightSentimentSchema = z.enum([
	"positive",
	"neutral",
	"negative",
]);
export const insightMetricSchema = z.object({
	label: z
		.string()
		.describe("Short user-facing label, including the segment when relevant."),
	current: z.number().describe("Value for current period"),
	previous: z.number().optional().describe("Value for previous period"),
	format: z
		.enum(["number", "percent", "duration_ms", "duration_s"])
		.default("number"),
});

const investigationKeySchema = z.string().trim().min(1).max(160);

const investigationEntitySchema = z
	.object({
		type: z.enum([
			"website",
			"page",
			"event",
			"goal",
			"funnel",
			"funnel_step",
			"error",
			"vital",
			"channel",
			"campaign",
			"uptime_monitor",
		]),
		id: z.string().min(1),
		label: z.string().trim().min(1).max(120),
	})
	.strict();

const investigationSignalShape = {
	signalKey: investigationKeySchema.describe(
		"Backend-owned identity for this exact signal."
	),
	entity: investigationEntitySchema,
	metric: insightMetricSchema,
	changePercent: z.number().nullable(),
	severity: insightSeveritySchema,
	sentiment: insightSentimentSchema,
	period: weekOverWeekPeriodSchema,
	baselineDates: z.array(z.iso.date()).min(6).max(90).optional(),
};

function validateBaselineDates(
	signal: z.infer<z.ZodObject<typeof investigationSignalShape>>,
	context: z.core.$RefinementCtx<
		z.infer<z.ZodObject<typeof investigationSignalShape>>
	>
) {
	const { baselineDates } = signal;
	if (!baselineDates) {
		return;
	}
	const uniqueDates = [...new Set(baselineDates)].sort();
	if (
		uniqueDates.length !== baselineDates.length ||
		uniqueDates[0] !== signal.period.previous.from ||
		uniqueDates.at(-1) !== signal.period.previous.to
	) {
		context.addIssue({
			code: "custom",
			message:
				"Z-score baseline dates must be unique and match the comparison envelope",
			path: ["baselineDates"],
		});
	}
}

export const investigationSignalSchema = z
	.object(investigationSignalShape)
	.strict()
	.superRefine(validateBaselineDates);

const storedInvestigationSignalSchema = z
	.object(investigationSignalShape)
	.strip()
	.superRefine(validateBaselineDates);

export const insightGoalEditChangesSchema = z
	.object({
		description: z
			.string()
			.trim()
			.min(1)
			.max(500)
			.nullable()
			.describe("Exact replacement description; null to leave unchanged."),
		name: z
			.string()
			.trim()
			.min(1)
			.max(100)
			.nullable()
			.describe("Exact replacement name; null to leave unchanged."),
	})
	.strict()
	.refine((changes) => changes.description !== null || changes.name !== null, {
		message: "Goal edits require at least one changed field",
	});

export const insightGoalOperationSchema = z.discriminatedUnion("operation", [
	z
		.object({
			action: z
				.string()
				.trim()
				.min(1)
				.max(320)
				.describe(
					"One short, concrete recommendation in teammate-facing language."
				),
			changes: insightGoalEditChangesSchema,
			operation: z.literal("edit"),
		})
		.strict(),
	z
		.object({
			action: z
				.string()
				.trim()
				.min(1)
				.max(320)
				.describe(
					"One short, concrete recommendation in teammate-facing language."
				),
			changes: z.null(),
			operation: z.literal("delete"),
		})
		.strict(),
	z
		.object({
			action: z
				.string()
				.trim()
				.min(1)
				.max(320)
				.describe(
					"One short, concrete recommendation in teammate-facing language."
				),
			changes: z.null(),
			operation: z.null(),
		})
		.strict(),
]);

const investigationNextSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("act"),
		action: z
			.string()
			.trim()
			.min(1)
			.describe(
				"One short, concrete product, code, tracking, or configuration change with an exact before and after; not more investigation or monitoring."
			),
		target: z
			.string()
			.trim()
			.min(1)
			.describe("Smallest inspected target, using a readable product name."),
		verification: z
			.string()
			.trim()
			.min(1)
			.describe("One short measured condition that proves the repair worked."),
		recheckAt: z.iso
			.datetime()
			.optional()
			.describe(
				"Exact ISO 8601 time to remeasure the verification condition. Required from the investigation agent; optional only to preserve historical outcomes."
			),
		execution: insightGoalOperationSchema
			.optional()
			.describe(
				"Exact goal mutation Databuddy can apply when this action is clicked. Omit unless the inspected target is that goal."
			),
	}),
	z.object({
		type: z.literal("ask"),
		question: z
			.string()
			.trim()
			.min(1)
			.describe(
				"One short, teammate-facing question requesting a specific external fact that cannot be inspected and chooses between concrete next moves. Never ask the user to define a metric or choose from speculative interpretations."
			),
	}),
	z.object({
		type: z.literal("watch"),
		escalation: z
			.string()
			.trim()
			.min(1)
			.describe(
				"One short, exact measurable condition for reopening this work. Include an explicit numeric comparison and name its configured target, healthy range, prior baseline, or measured-severity anchor."
			),
		recheckAt: z.iso
			.datetime()
			.optional()
			.describe(
				"Exact ISO 8601 time to remeasure the escalation condition. Required from the investigation agent; optional only to preserve historical outcomes."
			),
	}),
	z.object({
		type: z.literal("resolve"),
		reason: z
			.string()
			.trim()
			.min(1)
			.describe(
				"One short, teammate-facing reason no investigation needs to remain open; a non-interrupting recommendation may still exist."
			),
	}),
]);

const insightRecommendationSchema = insightGoalOperationSchema
	.nullable()
	.describe(
		"Concrete evidence-backed next step worth suggesting without opening an investigation. Name the exact object and change; use null when there is no useful next step."
	);

export const investigationOutcomeSchema = z
	.object({
		title: z
			.string()
			.trim()
			.min(1)
			.describe(
				"A 5–12 word, sentence-case headline that states the human outcome. Use the exact entity only when it clarifies the outcome; never use a raw identifier, generic config label, schema label, or arrow relationship as the title."
			),
		summary: z
			.string()
			.trim()
			.min(1)
			.describe(
				"One short sentence with the measured change and useful conclusion. Do not repeat the title, impact, root cause, or evidence."
			),
		impact: z
			.string()
			.trim()
			.min(1)
			.nullable()
			.describe(
				"One short, distinct measured user, workflow, revenue, or decision consequence. For a broken definition, say the decision it cannot support. Null when only the metric change is known."
			),
		rootCause: z
			.string()
			.trim()
			.min(1)
			.nullable()
			.describe(
				"One short, known mechanism only; use null for unknown, suspected, or merely correlated explanations. A runtime stack, bundle location, browser document line, or error message is not a source-code mechanism."
			),
		evidence: z
			.array(
				z
					.string()
					.trim()
					.min(1)
					.describe(
						"One terse fact that supports a distinct claim in the brief."
					)
			)
			.min(1)
			.max(2),
		publish: z
			.boolean()
			.optional()
			.describe(
				"True only when this turn adds a new customer-relevant fact worth showing in Insights. False for unchanged, duplicate, or routine rechecks."
			),
		recommendation: insightRecommendationSchema.optional(),
		next: investigationNextSchema,
	})
	.strip()
	.superRefine((outcome, context) => {
		if (outcome.next.type === "act" && outcome.impact === null) {
			context.addIssue({
				code: "custom",
				message: "Actions require measured impact",
				path: ["impact"],
			});
		}
		if (outcome.next.type === "act" && outcome.rootCause === null) {
			context.addIssue({
				code: "custom",
				message: "Actions require a known mechanism",
				path: ["rootCause"],
			});
		}
		if (
			outcome.next.type === "act" &&
			outcome.next.execution?.operation &&
			outcome.next.execution.action !== outcome.next.action
		) {
			context.addIssue({
				code: "custom",
				message: "Executable actions must match the displayed action",
				path: ["next", "execution", "action"],
			});
		}
		if (
			(outcome.next.type === "act" || outcome.next.type === "ask") &&
			outcome.publish === false
		) {
			context.addIssue({
				code: "custom",
				message: "Actions and questions must be published",
				path: ["publish"],
			});
		}
		if (outcome.recommendation && outcome.publish !== true) {
			context.addIssue({
				code: "custom",
				message: "Recommendations must be published",
				path: ["publish"],
			});
		}
		if (
			outcome.recommendation &&
			(outcome.next.type === "act" || outcome.next.type === "ask")
		) {
			context.addIssue({
				code: "custom",
				message: "Actions and questions cannot also carry a recommendation",
				path: ["recommendation"],
			});
		}
	});

export const agentInvestigationOutcomeSchema = investigationOutcomeSchema
	.safeExtend({
		publish: z
			.boolean()
			.describe(
				"True only when this turn adds a new customer-relevant fact worth showing in Insights."
			),
		recommendation: insightRecommendationSchema,
	})
	.superRefine((outcome, context) => {
		if (
			(outcome.next.type === "act" || outcome.next.type === "watch") &&
			!outcome.next.recheckAt
		) {
			context.addIssue({
				code: "custom",
				message: "Actions and watches require an exact recheck time",
				path: ["next", "recheckAt"],
			});
		}
	});

const insightStatusSchema = z.enum(["open", "resolved"]);
const insightResolvedReasonSchema = z.enum(["recovered", "stale"]);
export const insightReplyStatusSchema = z.enum([
	"queued",
	"running",
	"succeeded",
	"failed",
]);

export const insightReplySlackDeliverySchema = z
	.object({
		channelId: z.string().trim().min(1).max(255),
		threadTs: z.string().trim().min(1).max(64),
		type: z.literal("slack"),
	})
	.strict();

export const insightBriefItemSchema = z.object({
	asOf: z.iso.datetime(),
	createdAt: z.iso.datetime(),
	evidence: z.array(z.string().trim().min(1)).min(1).max(2),
	id: z.string(),
	impact: z.string().trim().min(1).nullable(),
	investigationId: z.string().nullable(),
	recommendation: insightRecommendationSchema,
	rootCause: z.string().trim().min(1).nullable(),
	signal: investigationSignalSchema,
	summary: z.string().trim().min(1),
	title: z.string().trim().min(1),
	websiteDomain: z.string(),
	websiteId: z.string(),
	websiteName: z.string().nullable(),
});

export const historyInsightSchema = z.object({
	changePercent: z.number().optional(),
	description: z.string(),
	id: z.string(),
	resolvedReason: insightResolvedReasonSchema.nullable(),
	sentiment: insightSentimentSchema,
	severity: insightSeveritySchema,
	status: insightStatusSchema,
	title: z.string(),
	websiteDomain: z.string(),
	websiteId: z.string(),
	websiteName: z.string().nullable(),
});

const insightTimelineInvestigationSchema = z.object({
	createdAt: z.string(),
	entity: investigationEntitySchema,
	id: z.string(),
	kind: z.literal("investigation"),
	metric: insightMetricSchema,
	outcome: investigationOutcomeSchema,
	period: weekOverWeekPeriodSchema,
	subject: z.string(),
});

export const insightTimelineReplySchema = z.object({
	author: z.string(),
	body: z.string(),
	createdAt: z.string(),
	id: z.string(),
	kind: z.literal("reply"),
	status: insightReplyStatusSchema,
});

export const insightTimelineItemSchema = z.discriminatedUnion("kind", [
	insightTimelineInvestigationSchema,
	insightTimelineReplySchema,
]);

export type InsightSeverity = z.infer<typeof insightSeveritySchema>;
export type InsightSentiment = z.infer<typeof insightSentimentSchema>;
export type InsightMetric = z.infer<typeof insightMetricSchema>;
export type InsightBriefItem = z.infer<typeof insightBriefItemSchema>;
export type InvestigationSignal = z.infer<typeof investigationSignalSchema>;
export type InvestigationOutcome = z.infer<typeof investigationOutcomeSchema>;
export type InsightReplySlackDelivery = z.infer<
	typeof insightReplySlackDeliverySchema
>;

export function formatInvestigationNext(
	outcome: InvestigationOutcome,
	signal: InvestigationSignal
): string {
	const next = outcome.next;
	if (next.type === "act") {
		return `${next.action} Target: ${next.target}. Done when: ${next.verification}`;
	}
	if (next.type === "ask") {
		return next.question;
	}
	if (next.type === "watch") {
		return `Watch ${signal.metric.label}. Escalate: ${next.escalation}`;
	}
	return next.reason;
}

export function parseInvestigationOutcome(
	value: unknown
): InvestigationOutcome | null {
	const direct = investigationOutcomeSchema.safeParse(value);
	return direct.success ? direct.data : null;
}

export function parseInvestigationSignal(
	value: unknown
): InvestigationSignal | null {
	const result = storedInvestigationSignalSchema.safeParse(value);
	return result.success ? result.data : null;
}
