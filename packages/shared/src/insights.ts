import { z } from "zod";
import { userRuleSchema } from "./flags";

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

const measurementRecommendationActionSchema = z
	.string()
	.trim()
	.min(1)
	.max(320)
	.describe("One short, concrete measurement recommendation for a teammate.");

export const insightDatabuddySetupRecommendationSchema = z
	.object({
		action: measurementRecommendationActionSchema.describe(
			"Exact evidence-backed Databuddy setup and the future customer question it unlocks."
		),
		feature: z.literal("user_identification"),
		kind: z.literal("databuddy_setup"),
	})
	.strict();

const measurementGoalFilterSchema = z
	.object({
		field: z.string().trim().min(1),
		operator: z.enum([
			"equals",
			"contains",
			"not_contains",
			"starts_with",
			"ends_with",
			"not_equals",
			"in",
			"not_in",
		]),
		value: z.union([
			z.string().trim().min(1),
			z.array(z.string().trim().min(1)).min(1),
		]),
	})
	.strict();

const measurementFunnelFilterSchema = z
	.object({
		field: z.string().trim().min(1),
		operator: z.enum(["equals", "contains", "not_equals", "in", "not_in"]),
		value: z.union([
			z.string().trim().min(1),
			z.array(z.string().trim().min(1)).min(1),
		]),
	})
	.strict();

const measurementDraftTypeSchema = z.enum(["PAGE_VIEW", "EVENT"]);

export const insightGoalDraftSchema = z
	.object({
		description: z.string().trim().min(1).max(500).nullable(),
		filters: z
			.array(measurementGoalFilterSchema)
			.length(0, "Measurement goal drafts cannot include filters."),
		ignoreHistoricData: z.boolean(),
		name: z.string().trim().min(1).max(100),
		target: z.string().trim().min(1).max(500),
		type: measurementDraftTypeSchema,
	})
	.strict();

const insightFunnelDraftStepSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		target: z.string().trim().min(1).max(500),
		type: measurementDraftTypeSchema,
	})
	.strict();

export const insightFunnelDraftSchema = z
	.object({
		description: z.string().trim().min(1).max(500).nullable(),
		filters: z
			.array(measurementFunnelFilterSchema)
			.length(0, "Measurement funnel drafts cannot include filters."),
		ignoreHistoricData: z.boolean(),
		name: z.string().trim().min(1).max(100),
		steps: z.array(insightFunnelDraftStepSchema).min(2).max(10),
	})
	.strict();

export const insightFeatureFlagDraftSchema = z
	.object({
		defaultValue: z.boolean(),
		description: z.string().trim().min(1).max(500).nullable(),
		key: z
			.string()
			.trim()
			.min(1)
			.max(100)
			.regex(
				/^[a-zA-Z0-9_-]+$/,
				"Feature flag keys can contain only letters, numbers, underscores, and hyphens."
			),
		name: z.string().trim().min(1).max(100),
	})
	.strict();

export const insightTargetGroupDraftSchema = z
	.object({
		color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
		description: z.string().trim().min(1).max(500).nullable(),
		name: z.string().trim().min(1).max(100),
		rules: z.array(userRuleSchema),
	})
	.strict();

export const insightNativeRecommendationActionSchema = z.discriminatedUnion(
	"type",
	[
		z
			.object({
				draft: insightGoalDraftSchema,
				type: z.literal("goal.create"),
			})
			.strict(),
		z
			.object({
				changes: insightGoalEditChangesSchema,
				goalId: z.string().trim().min(1),
				type: z.literal("goal.update"),
			})
			.strict(),
		z
			.object({
				goalId: z.string().trim().min(1),
				type: z.literal("goal.delete"),
			})
			.strict(),
		z
			.object({
				draft: insightFunnelDraftSchema,
				type: z.literal("funnel.create"),
			})
			.strict(),
		z
			.object({
				draft: insightFeatureFlagDraftSchema,
				type: z.literal("feature_flag.create"),
			})
			.strict(),
		z
			.object({
				draft: insightTargetGroupDraftSchema,
				type: z.literal("target_group.create"),
			})
			.strict(),
	]
);

export type InsightNativeRecommendationAction = z.infer<
	typeof insightNativeRecommendationActionSchema
>;

export const insightNativeRecommendationSchema = z
	.object({
		action: measurementRecommendationActionSchema,
		nativeAction: insightNativeRecommendationActionSchema,
	})
	.strict();

const insightInstrumentationEventAdviceSchema = z
	.object({
		description: z.string().trim().min(1).max(500),
		name: z.string().trim().min(1).max(100),
	})
	.strict();

export const insightMeasurementGapRecommendationSchema = z
	.object({
		action: measurementRecommendationActionSchema,
		kind: z.literal("measurement_gap"),
		route: z
			.string()
			.trim()
			.min(1)
			.max(120)
			.nullable()
			.describe(
				"One observed, safe navigation reference, or null when current telemetry cannot safely name a route. It never proves a completed conversion."
			),
	})
	.strict();

export const insightMeasurementRecommendationSchema = z.discriminatedUnion(
	"kind",
	[
		insightMeasurementGapRecommendationSchema,
		z
			.object({
				action: measurementRecommendationActionSchema,
				draft: insightGoalDraftSchema,
				kind: z.literal("goal_draft"),
			})
			.strict(),
		z
			.object({
				action: measurementRecommendationActionSchema,
				draft: insightFunnelDraftSchema,
				kind: z.literal("funnel_draft"),
			})
			.strict(),
		z
			.object({
				action: measurementRecommendationActionSchema,
				events: z
					.array(insightInstrumentationEventAdviceSchema)
					.min(1)
					.max(10)
					.refine(
						(events) =>
							new Set(events.map((event) => event.name)).size === events.length,
						"Instrumentation recommendations cannot repeat an event name."
					),
				kind: z.literal("instrumentation"),
			})
			.strict(),
	]
);

const agentEvidenceReferenceSchema = z.discriminatedUnion("source", [
	z
		.object({
			index: z
				.number()
				.int()
				.nonnegative()
				.describe("Zero-based index in the supplied evidence array."),
			source: z.literal("provided"),
		})
		.strict(),
	z
		.object({
			name: z
				.string()
				.trim()
				.min(1)
				.max(100)
				.describe("Exact name of a read tool used during this investigation."),
			source: z.literal("tool"),
		})
		.strict(),
]);

/**
 * Root-cause provenance is agent-private and stricter than a normal evidence
 * reference. Keep generic evidence refs stable for durable outcomes, while a
 * causal claim names the exact source-file tool result that established it.
 */
const agentRootCauseEvidenceReferenceSchema = z.union([
	agentEvidenceReferenceSchema,
	z
		.object({
			name: z.literal("github_read_file"),
			path: z
				.string()
				.trim()
				.min(1)
				.max(500)
				.describe("Exact inspected source path returned by github_read_file."),
			receipt: z
				.string()
				.trim()
				.min(1)
				.max(200)
				.describe(
					"Opaque receipt copied exactly from that successful github_read_file result."
				),
			source: z.literal("tool"),
		})
		.strict(),
]);

const agentBriefScopeSchema = z.enum([
	"exact_signal",
	"error_fingerprint",
	"route_error",
]);

export const agentBriefProvenanceSchema = z
	.object({
		claimRefs: z
			.object({
				impact: agentEvidenceReferenceSchema
					.nullable()
					.describe(
						"Source for impact when impact is non-null; null when no impact is stated."
					),
				problem: agentEvidenceReferenceSchema.describe(
					"Source for the observed problem named by the title and summary."
				),
				rootCause: agentRootCauseEvidenceReferenceSchema
					.nullable()
					.describe(
						"Source for rootCause when rootCause is non-null; null when no mechanism is known."
					),
			})
			.strict(),
		scope: agentBriefScopeSchema.describe(
			"One backend-owned scope shared by the title, summary, impact, and next move. exact_signal is the selected signal; error_fingerprint is one exact error cohort that can span routes; route_error is the whole route error cohort."
		),
		userExperience: z
			.enum([
				"measured",
				"observed_configured_completion",
				"observed_session_behavior",
				"unmeasured",
			])
			.describe(
				"measured only when evidence directly establishes what people experienced. observed_configured_completion and observed_session_behavior are reserved for backend-owned, non-causal post-exposure cohort comparisons."
			),
	})
	.strict();

export const insightWatchThresholdSchema = z
	.object({
		anchor: z
			.enum([
				"configured_target",
				"healthy_range",
				"prior_baseline",
				"measured_severity",
			])
			.describe(
				"Why this threshold is defensible; never use an invented round-number target."
			),
		comparison: z
			.enum(["above", "at_or_above", "below", "at_or_below"])
			.describe("How the next measurement must compare with the threshold."),
		evidenceRef: agentEvidenceReferenceSchema
			.optional()
			.describe(
				"Source that establishes the threshold. Required from the investigation agent; optional only to preserve historical outcomes."
			),
		value: z
			.number()
			.finite()
			.nonnegative()
			.describe("Exact threshold in the signal metric's native unit."),
	})
	.strict();

const investigationActNextSchema = z.object({
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
		.nullable()
		.optional()
		.describe(
			"Exact goal mutation Databuddy can apply when this action is clicked. Omit unless the inspected target is that goal; agent output uses null before normalization."
		),
});

const investigationAskNextSchema = z.object({
	type: z.literal("ask"),
	question: z
		.string()
		.trim()
		.min(1)
		.describe(
			"One short, teammate-facing question requesting a specific external fact that cannot be inspected and chooses between concrete next moves. Never ask the user to define a metric or choose from speculative interpretations."
		),
});

const investigationWatchNextSchema = z.object({
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
	threshold: insightWatchThresholdSchema
		.optional()
		.describe(
			"Machine-readable watch condition. Required from the investigation agent; optional only to preserve historical outcomes."
		),
});

const investigationResolveNextSchema = z.object({
	type: z.literal("resolve"),
	reason: z
		.string()
		.trim()
		.min(1)
		.describe(
			"One short, teammate-facing reason no investigation needs to remain open; a non-interrupting recommendation may still exist."
		),
});

const investigationNextSchema = z.discriminatedUnion("type", [
	investigationActNextSchema,
	investigationAskNextSchema,
	investigationWatchNextSchema,
	investigationResolveNextSchema,
]);

/**
 * The OpenAI strict-output contract requires every object field to be present.
 * Historical outcomes intentionally keep these fields optional, so the agent
 * receives a stricter, nullable-or-required version and normalizes it before
 * persistence.
 */
const agentInsightWatchThresholdSchema = insightWatchThresholdSchema.extend({
	evidenceRef: agentEvidenceReferenceSchema.describe(
		"Source that establishes this threshold."
	),
});

const agentInvestigationNextSchema = z.discriminatedUnion("type", [
	investigationActNextSchema.extend({
		execution: insightGoalOperationSchema
			.nullable()
			.describe(
				"Exact goal mutation Databuddy can apply when this action is clicked, or null when no goal mutation applies."
			),
		recheckAt: z.iso
			.datetime()
			.describe("Exact ISO 8601 time to remeasure the verification condition."),
	}),
	investigationAskNextSchema,
	investigationWatchNextSchema.omit({ escalation: true }).extend({
		recheckAt: z.iso
			.datetime()
			.describe("Exact ISO 8601 time to remeasure the escalation condition."),
		threshold: agentInsightWatchThresholdSchema.describe(
			"Machine-readable watch condition."
		),
	}),
	investigationResolveNextSchema,
]);

export const insightRecommendationSchema = z
	.union([
		insightGoalOperationSchema,
		insightMeasurementRecommendationSchema,
		insightDatabuddySetupRecommendationSchema,
		insightNativeRecommendationSchema,
	])
	.nullable()
	.describe(
		"Concrete evidence-backed next step worth suggesting without opening an investigation. Native actions are typed, target explicit configuration, and are only emitted from backend-verified candidates. Databuddy setup must use a backend-verified setup or instrumentation candidate that names the exact blind spot and future decision it unlocks. Use null when there is no useful next step."
	);

/**
 * Native recommendations are applied only from backend-provided candidates.
 * The investigation agent has no such candidate in its input, so keep them
 * out of its strict response schema while preserving the durable domain schema
 * for recommendation application and existing Insights.
 */
const agentInsightRecommendationSchema = z
	.union([
		insightGoalOperationSchema,
		insightMeasurementRecommendationSchema,
		insightDatabuddySetupRecommendationSchema,
	])
	.nullable()
	.describe(
		"Concrete evidence-backed next step worth suggesting without opening an investigation. Use null when there is no useful next step."
	);

const investigationOutcomeShape = {
	title: z
		.string()
		.trim()
		.min(1)
		.describe(
			"A concise news headline of at most 12 words stating the verified human outcome. When an affected-visitor or affected-customer count is known, lead with that count and the observed problem. Never translate occurrences, sessions, entrants, or performance samples into people, or use a raw identifier, generic config label, schema label, arrow relationship, or measurement language as the title."
		),
	summary: z
		.string()
		.trim()
		.min(1)
		.describe(
			"One short sentence stating what happened, where, and when. Prefer the verified problem or experience over the percentage change; keep comparison detail in evidence when an affected cohort is known. Do not repeat the title, impact, root cause, or evidence."
		),
	impact: z
		.string()
		.trim()
		.min(1)
		.nullable()
		.describe(
			"One short, directly measured user, reliability, business, or decision consequence. State affected scope and notable verified cohorts when available. Error exposure does not prove a broken page, failed task, lost work, or blocked conversion. For a broken definition, say the decision it cannot support. Null when no consequence was measured."
		),
	rootCause: z
		.string()
		.trim()
		.min(1)
		.nullable()
		.describe(
			"One short, inspected causal mechanism. Use null for unknown, suspected, or merely correlated explanations. Error text, a runtime stack, bundle location, route, browser document line, timing, or annotation is not a source-code mechanism."
		),
	evidence: z
		.array(
			z
				.string()
				.trim()
				.min(1)
				.describe(
					"One sourced fact for scale, comparison, or verified cohort coverage. Distinguish visitor identifiers, sessions, identified profiles, and attributed completed-payment history; unknown is not zero."
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
};

export const investigationOutcomeSchema = z
	.object(investigationOutcomeShape)
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
			"nativeAction" in outcome.recommendation &&
			outcome.next.type !== "resolve"
		) {
			context.addIssue({
				code: "custom",
				message: "Native recommendations must resolve without opening a case",
				path: ["recommendation"],
			});
		}
		if (
			outcome.recommendation &&
			(outcome.next.type === "act" || outcome.next.type === "ask") &&
			(!("kind" in outcome.recommendation) ||
				outcome.recommendation.kind !== "databuddy_setup")
		) {
			context.addIssue({
				code: "custom",
				message:
					"Actions and questions can only carry a backend-verified Databuddy setup recommendation",
				path: ["recommendation"],
			});
		}
	});

export const agentInvestigationOutcomeSchema = z
	.object({
		...investigationOutcomeShape,
		brief: agentBriefProvenanceSchema.describe(
			"Private provenance check for the customer-facing brief. It is not shown to teammates."
		),
		evidenceRefs: z
			.array(agentEvidenceReferenceSchema)
			.min(1)
			.max(2)
			.describe(
				"One source reference for each evidence item, in the same order."
			),
		publish: z
			.boolean()
			.describe(
				"True only when this turn adds a new customer-relevant fact worth showing in Insights."
			),
		next: agentInvestigationNextSchema,
		recommendation: agentInsightRecommendationSchema,
	})
	.strip()
	.superRefine((outcome, context) => {
		const durableOutcome = investigationOutcomeSchema.safeParse({
			...outcome,
			next:
				outcome.next.type === "watch"
					? { ...outcome.next, escalation: "backend-owned" }
					: outcome.next,
		});
		if (!durableOutcome.success) {
			for (const issue of durableOutcome.error.issues) {
				context.addIssue({
					code: "custom",
					message: issue.message,
					path: issue.path,
				});
			}
		}
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
		if (outcome.next.type === "watch" && !outcome.next.threshold) {
			context.addIssue({
				code: "custom",
				message: "Watches require a machine-readable threshold",
				path: ["next", "threshold"],
			});
		}
		if (outcome.next.type === "watch" && !outcome.next.threshold?.evidenceRef) {
			context.addIssue({
				code: "custom",
				message: "Watch thresholds require a source reference",
				path: ["next", "threshold", "evidenceRef"],
			});
		}
		if (outcome.evidenceRefs.length !== outcome.evidence.length) {
			context.addIssue({
				code: "custom",
				message: "Every evidence item requires one source reference",
				path: ["evidenceRefs"],
			});
		}
	});

const insightStatusSchema = z.enum(["open", "resolved"]);
const insightResolvedReasonSchema = z.enum(["recovered", "stale"]);
export const insightReplyStatusSchema = z.enum([
	"queued",
	"running",
	"skipped",
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

export const insightRecommendationItemSchema = insightBriefItemSchema.extend({
	recommendation: insightRecommendationSchema.unwrap(),
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
export type InsightRecommendationItem = z.infer<
	typeof insightRecommendationItemSchema
>;
export type InvestigationSignal = z.infer<typeof investigationSignalSchema>;
export type InvestigationOutcome = z.infer<typeof investigationOutcomeSchema>;
export type AgentInvestigationOutcome = z.infer<
	typeof agentInvestigationOutcomeSchema
>;
export type AgentBriefProvenance = z.infer<typeof agentBriefProvenanceSchema>;
export type InsightMeasurementRecommendation = z.infer<
	typeof insightMeasurementRecommendationSchema
>;
export type InsightMeasurementGapRecommendation = z.infer<
	typeof insightMeasurementGapRecommendationSchema
>;
export type InsightDatabuddySetupRecommendation = z.infer<
	typeof insightDatabuddySetupRecommendationSchema
>;
export type InsightRecommendation = z.infer<typeof insightRecommendationSchema>;
export type InsightWatchThreshold = z.infer<typeof insightWatchThresholdSchema>;
export type InsightReplySlackDelivery = z.infer<
	typeof insightReplySlackDeliverySchema
>;

export function formatInvestigationNext(outcome: InvestigationOutcome): string {
	const next = outcome.next;
	if (next.type === "act") {
		return `${next.action} Target: ${next.target}. Done when: ${next.verification}`;
	}
	if (next.type === "ask") {
		return next.question;
	}
	if (next.type === "watch") {
		return next.escalation;
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

/**
 * Older investigation runs put teammate annotations in the public evidence
 * array. The old formatter is deliberately narrow so normal customer-facing
 * facts that happen to mention an annotation are not quarantined.
 */
export const LEGACY_INSIGHT_ANNOTATION_PREFIX = "Annotation: ";

const LEGACY_INSIGHT_ANNOTATION_DATE_LENGTH = 10;
const LEGACY_INSIGHT_ANNOTATION_DATE_SEPARATOR = ": ";

export function isLegacyInsightAnnotationEvidence(value: unknown): boolean {
	if (
		typeof value !== "string" ||
		!value.startsWith(LEGACY_INSIGHT_ANNOTATION_PREFIX)
	) {
		return false;
	}
	const dateStart = LEGACY_INSIGHT_ANNOTATION_PREFIX.length;
	const dateEnd = dateStart + LEGACY_INSIGHT_ANNOTATION_DATE_LENGTH;
	const titleStart = dateEnd + LEGACY_INSIGHT_ANNOTATION_DATE_SEPARATOR.length;
	return (
		value.slice(dateEnd, titleStart) ===
			LEGACY_INSIGHT_ANNOTATION_DATE_SEPARATOR &&
		z.iso.date().safeParse(value.slice(dateStart, dateEnd)).success &&
		value.slice(titleStart).trim().length > 0
	);
}

export function hasLegacyInsightAnnotationEvidence(value: unknown): boolean {
	return Array.isArray(value) && value.some(isLegacyInsightAnnotationEvidence);
}

/**
 * Preserve historical rows in storage, but prevent the exact old
 * annotation-as-evidence format from becoming agent or customer context.
 */
export function isQuarantinedInsightObservation(value: {
	evidence?: unknown;
	outcome?: unknown;
}): boolean {
	if (hasLegacyInsightAnnotationEvidence(value.evidence)) {
		return true;
	}
	if (
		!value.outcome ||
		typeof value.outcome !== "object" ||
		Array.isArray(value.outcome)
	) {
		return false;
	}
	return hasLegacyInsightAnnotationEvidence(
		(value.outcome as { evidence?: unknown }).evidence
	);
}
