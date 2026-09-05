import { z } from "zod";
import { goalFunnelFilterFields } from "./analytics-filters";

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

const matchedErrorContinuationMeasurementSchema = z
	.object({
		type: z.literal("matched_error_continuation"),
		controlContinuationPercent: z.number().finite().min(0).max(100),
		exposedContinuationPercent: z.number().finite().min(0).max(100),
		matchedSessions: z.number().int().min(30),
	})
	.strict();

export type MatchedErrorContinuationMeasurement = z.infer<
	typeof matchedErrorContinuationMeasurementSchema
>;

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
	cohortMeasurement: matchedErrorContinuationMeasurementSchema.optional(),
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

export const insightDefinitionEditChangesSchema = z
	.object({
		description: z
			.string()
			.trim()
			.min(1)
			.max(500)
			.nullish()
			.describe("Exact replacement description; null to leave unchanged."),
		name: z
			.string()
			.trim()
			.min(1)
			.max(100)
			.nullish()
			.describe("Exact replacement name; null to leave unchanged."),
		target: z
			.string()
			.trim()
			.min(1)
			.max(2000)
			.nullish()
			.describe(
				"Exact replacement page path or event name for a goal; omit or null to leave unchanged. Not valid for funnels."
			),
		type: z
			.enum(["PAGE_VIEW", "EVENT", "CUSTOM"])
			.nullish()
			.describe(
				"Replacement goal type; omit or null to leave unchanged. Not valid for funnels."
			),
		steps: z
			.array(
				z.strictObject({
					name: z.string().trim().min(1).max(100),
					target: z.string().trim().min(1).max(2000),
					type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
					conditions: z.record(z.string(), z.unknown()).optional(),
				})
			)
			.min(2)
			.max(20)
			.nullish()
			.describe(
				"Complete ordered replacement steps for a funnel, preserving any existing conditions. Not valid for goals."
			),
		filters: z
			.array(
				z.strictObject({
					field: z.enum(goalFunnelFilterFields.map((field) => field.value)),
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
					value: z.union([z.string(), z.array(z.string())]),
				})
			)
			.max(20)
			.nullish()
			.describe(
				"Complete replacement filters; [] clears filters, omit or null leaves them unchanged."
			),
	})
	.strict()
	.refine((changes) => Object.values(changes).some((value) => value != null), {
		message: "Definition edits require at least one changed field",
	});

const definitionActionSchema = z
	.string()
	.trim()
	.min(1)
	.max(320)
	.describe(
		"One short, concrete definition change in teammate-facing language."
	);

const definitionEditOperationSchema = z
	.object({
		action: definitionActionSchema,
		changes: insightDefinitionEditChangesSchema,
		operation: z.literal("edit"),
	})
	.strict();

const definitionDeleteOperationSchema = z
	.object({
		action: definitionActionSchema,
		changes: z.null(),
		operation: z.literal("delete"),
	})
	.strict();

export const insightDefinitionOperationSchema = z.discriminatedUnion(
	"operation",
	[definitionEditOperationSchema, definitionDeleteOperationSchema]
);

const definitionEditExecutionSchema = z
	.object({
		changes: insightDefinitionEditChangesSchema,
		operation: z.literal("edit"),
	})
	.strip();

const definitionDeleteExecutionSchema = z
	.object({
		changes: z.null(),
		operation: z.literal("delete"),
	})
	.strip();

const legacyDefinitionExecutionSchema = z
	.object({
		changes: z.null(),
		operation: z.null(),
	})
	.strip();
const insightDefinitionExecutionSchema = z.discriminatedUnion("operation", [
	definitionEditExecutionSchema,
	definitionDeleteExecutionSchema,
	legacyDefinitionExecutionSchema,
]);

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
				"Optional source for a threshold stored by a historical outcome."
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
	execution: insightDefinitionExecutionSchema
		.nullable()
		.optional()
		.describe(
			"Exact edit or delete Databuddy can apply when this action is clicked. Use only for the signal's existing goal or funnel; null is accepted only for agent transport and normalized before persistence."
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
			"One short, exact measurable condition from a historical watch outcome."
		),
	recheckAt: z.iso
		.datetime()
		.optional()
		.describe("Exact ISO 8601 time to remeasure a historical watch outcome."),
	threshold: insightWatchThresholdSchema
		.optional()
		.describe("Machine-readable condition from a historical watch outcome."),
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
const agentInsightDefinitionExecutionSchema = z.discriminatedUnion(
	"operation",
	[definitionEditExecutionSchema, definitionDeleteExecutionSchema]
);

const agentInvestigationNextSchema = z.discriminatedUnion("type", [
	investigationActNextSchema.extend({
		recheckAt: z.iso
			.datetime()
			.describe("Exact ISO 8601 time to remeasure the verification condition."),
		execution: agentInsightDefinitionExecutionSchema
			.nullable()
			.describe(
				"Exact edit or delete Databuddy can apply when this action is clicked, or null when no definition edit applies."
			),
	}),
	investigationAskNextSchema,
	investigationResolveNextSchema,
]);

export const insightFindingKindSchema = z.enum([
	"user_experience",
	"product_outcome",
	"reliability_exposure",
	"measurement_definition",
	"measurement_coverage",
]);

export const insightPublicationBasisSchema = z.enum([
	"measured_impact",
	"measured_reliability",
	"decision_safety",
]);

export const investigationOutcomeSchema = z
	.object({
		findingKind: insightFindingKindSchema
			.optional()
			.describe(
				"Semantic classification of the finding. User experience requires a directly measured downstream experience; reliability exposure reports a directly measured error or performance exposure without implying a downstream outcome; a measurement definition or coverage finding must not imply product harm. Optional only for legacy stored outcomes."
			),
		title: z
			.string()
			.trim()
			.min(1)
			.describe(
				"A 5–12 word news headline stating the verified finding. For a directly measured user experience, lead with the affected visitor or customer count and observed problem. For a measurement definition or coverage finding, name the mismatch or blind spot, never an implied user failure. Never translate occurrences, sessions, entrants, or performance samples into people, or use a raw identifier, generic config label, schema label, arrow relationship, or measurement language as the title."
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
		publicationBasis: insightPublicationBasisSchema
			.nullable()
			.optional()
			.describe(
				"Why a published turn deserves feed attention. Null for unpublished turns. Optional only for legacy stored outcomes."
			),
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
			(outcome.next.type === "act" || outcome.next.type === "ask") &&
			outcome.publish === false
		) {
			context.addIssue({
				code: "custom",
				message: "Actions and questions must be published",
				path: ["publish"],
			});
		}
		const hasOutcomeSemantics =
			outcome.findingKind !== undefined ||
			outcome.publicationBasis !== undefined;
		if (!hasOutcomeSemantics) {
			return;
		}
		if (outcome.findingKind === undefined) {
			context.addIssue({
				code: "custom",
				message:
					"Finding classification is required when outcome semantics exist",
				path: ["findingKind"],
			});
		}
		if (outcome.publicationBasis === undefined) {
			context.addIssue({
				code: "custom",
				message: "Publication basis is required when outcome semantics exist",
				path: ["publicationBasis"],
			});
		}
		if (outcome.publish === undefined) {
			context.addIssue({
				code: "custom",
				message: "Publish state is required when outcome semantics exist",
				path: ["publish"],
			});
		}
		if (outcome.publish === true && outcome.publicationBasis === null) {
			context.addIssue({
				code: "custom",
				message: "Published outcomes require a publication basis",
				path: ["publicationBasis"],
			});
		}
		if (outcome.publish === false && outcome.publicationBasis !== null) {
			context.addIssue({
				code: "custom",
				message: "Unpublished outcomes must not claim a publication basis",
				path: ["publicationBasis"],
			});
		}
		const isPublishedMeasurementFinding =
			outcome.publish === true &&
			(outcome.findingKind === "measurement_definition" ||
				outcome.findingKind === "measurement_coverage");
		const isPublishedMeasuredFinding =
			outcome.publish === true &&
			(outcome.findingKind === "user_experience" ||
				outcome.findingKind === "product_outcome");
		const isPublishedReliabilityFinding =
			outcome.publish === true &&
			outcome.findingKind === "reliability_exposure";
		if (
			isPublishedMeasurementFinding &&
			outcome.publicationBasis !== "decision_safety"
		) {
			context.addIssue({
				code: "custom",
				message:
					"Published measurement findings must be published for decision safety",
				path: ["publicationBasis"],
			});
		}
		if (
			isPublishedMeasuredFinding &&
			outcome.publicationBasis !== "measured_impact"
		) {
			context.addIssue({
				code: "custom",
				message:
					"Published experience and product findings require measured impact",
				path: ["publicationBasis"],
			});
		}
		if (
			isPublishedReliabilityFinding &&
			outcome.publicationBasis !== "measured_reliability"
		) {
			context.addIssue({
				code: "custom",
				message:
					"Published reliability exposure findings require measured reliability",
				path: ["publicationBasis"],
			});
		}
		if (
			(outcome.findingKind === "user_experience" ||
				outcome.publicationBasis === "measured_impact" ||
				isPublishedMeasurementFinding ||
				isPublishedMeasuredFinding ||
				isPublishedReliabilityFinding) &&
			outcome.impact === null
		) {
			context.addIssue({
				code: "custom",
				message:
					"Measured experience and published decision findings require impact",
				path: ["impact"],
			});
		}
	});

const RAW_IDENTIFIER_PATTERN =
	/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[a-z0-9]+(?:_[a-z0-9]+)+\b|https?:\/\//i;
const TITLE_WORD_SEPARATOR = /\s+/;

const agentTitleSchema = z
	.string()
	.trim()
	.max(120)
	.refine(
		(title) => {
			const words = title.split(TITLE_WORD_SEPARATOR).length;
			return words >= 5 && words <= 12;
		},
		{ message: "Titles must be 5-12 words" }
	)
	.refine((title) => !RAW_IDENTIFIER_PATTERN.test(title), {
		message:
			"Titles must use natural product language, never raw identifiers, event names, or URLs",
	})
	.describe(
		"A 5–12 word news headline stating the verified finding in natural product language. Lead with the affected count and observed problem. Never use raw identifiers, snake_case event names, URLs, or measurement jargon."
	);

export const agentInvestigationOutcomeSchema = investigationOutcomeSchema
	.safeExtend({
		title: agentTitleSchema,
		evidenceRefs: z
			.array(agentEvidenceReferenceSchema)
			.min(1)
			.max(2)
			.describe(
				"One source reference for each evidence item, in the same order."
			),
		next: agentInvestigationNextSchema,
		publish: z
			.boolean()
			.describe(
				"True only when this turn adds a new customer-relevant fact worth showing in Insights."
			),
		findingKind: insightFindingKindSchema.describe(
			"Classify this as user_experience only for a directly measured downstream user experience; product_outcome for a measured business or journey result; reliability_exposure for directly measured error or performance exposure without a measured downstream outcome; measurement_definition for a named definition that measures something other than its stated purpose; or measurement_coverage for missing telemetry/setup. Published user experience and product outcomes require measured impact, reliability exposure requires measured reliability, and published measurement findings require decision safety."
		),
		publicationBasis: insightPublicationBasisSchema
			.nullable()
			.describe(
				"For published user experience or product outcomes, use measured_impact. For published reliability exposure, use measured_reliability. For published measurement definition or coverage findings, use decision_safety. Use null when publish is false."
			),
	})
	.superRefine((outcome, context) => {
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
export type AgentInvestigationOutcome = z.infer<
	typeof agentInvestigationOutcomeSchema
>;
export type InsightDefinitionEditChanges = z.infer<
	typeof insightDefinitionEditChangesSchema
>;
export type InsightDefinitionOperation = z.infer<
	typeof insightDefinitionOperationSchema
>;

export function describeInsightDefinitionAction(
	label: string,
	operation: InsightDefinitionOperation
): string {
	if (operation.operation === "delete") {
		return `Delete ${label}.`;
	}
	const changes = operation.changes;
	const edits: string[] = [];
	if (changes.target != null) {
		edits.push(`set target to ${JSON.stringify(changes.target)}`);
	}
	if (changes.type != null) {
		edits.push(`set type to ${changes.type}`);
	}
	if (changes.steps != null) {
		edits.push(
			`replace steps with ${changes.steps.map((step) => `${step.name} (${step.type}: ${step.target})`).join(" → ")}`
		);
	}
	if (changes.filters != null) {
		edits.push(
			`set filters to ${changes.filters.length ? changes.filters.map((filter) => `${filter.field} ${filter.operator} ${JSON.stringify(filter.value)}`).join(" AND ") : "none"}`
		);
	}
	if (changes.name != null) {
		edits.push(`rename to ${JSON.stringify(changes.name)}`);
	}
	if (changes.description != null) {
		edits.push(`set description to ${JSON.stringify(changes.description)}`);
	}
	return `For ${label}, ${edits.join("; ")}.`;
}

export function insightDefinitionEditError(
	entity: "goal" | "funnel",
	changes: InsightDefinitionEditChanges
): string | null {
	if (entity === "goal" && changes.steps != null) {
		return "Goal edits cannot replace funnel steps.";
	}
	if (entity === "funnel" && (changes.target != null || changes.type != null)) {
		return "Funnel edits must replace steps, not a goal target or type.";
	}
	return null;
}
export type InsightWatchThreshold = z.infer<typeof insightWatchThresholdSchema>;
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
		return next.threshold
			? next.escalation
			: `Watch ${signal.metric.label}. ${next.escalation}`;
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
