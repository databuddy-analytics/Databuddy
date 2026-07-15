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

const generatedInsightTypes = [
	"error_spike",
	"new_errors",
	"vitals_degraded",
	"custom_event_spike",
	"traffic_drop",
	"traffic_spike",
	"bounce_rate_change",
	"engagement_change",
	"referrer_change",
	"page_trend",
	"positive_trend",
	"performance",
	"uptime_issue",
	"conversion_leak",
	"funnel_regression",
	"channel_concentration",
	"reliability_improved",
	"persistent_error_hotspot",
	"quality_shift",
	"performance_improved",
	"segment_regression",
	"error_impact",
	"cross_signal",
] as const;

const storedInsightActionTypes = [
	"fix_goal",
	"create_funnel",
	"add_custom_event",
	"create_annotation",
	"add_tracking",
	"investigate_further",
	"update_config",
	"code_fix",
] as const;

export const insightSeveritySchema = z.enum(["critical", "warning", "info"]);
export const insightSentimentSchema = z.enum([
	"positive",
	"neutral",
	"negative",
]);
export const insightSourceSchema = z.enum([
	"web",
	"product",
	"ops",
	"business",
]);
const generatedInsightTypeSchema = z.enum(generatedInsightTypes);
export const storedInsightTypeSchema = z.enum([
	...generatedInsightTypes,
	"cross_property_dependency",
	"deploy_correlation",
]);
const storedInsightActionTypeSchema = z.enum(storedInsightActionTypes);

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

export const insightEvidenceSchema = z.object({
	type: z.enum(["segment", "error", "annotation", "temporal", "metric"]),
	description: z.string(),
});

export const storedInsightActionSchema = z.object({
	type: storedInsightActionTypeSchema,
	label: z.string().describe("Short button label"),
	params: z
		.record(z.string(), z.string())
		.describe("Action-specific string parameters"),
});

export const insightRemediationKindSchema = z.enum([
	"code",
	"tracking",
	"configuration",
	"campaign",
	"operations",
]);

const insightShape = {
	title: z
		.string()
		.describe("Outcome-first plain-English headline under 80 characters."),
	description: z
		.string()
		.describe("What happened and why it matters, under 300 characters."),
	suggestion: z
		.string()
		.describe("One specific action in plain English, under 300 characters."),
	metrics: z
		.array(insightMetricSchema)
		.min(1)
		.max(5)
		.describe(
			"Primary metric first, followed only by useful supporting metrics."
		),
	severity: insightSeveritySchema,
	sentiment: insightSentimentSchema.describe(
		"positive = improving metric, neutral = stable, negative = declining or broken"
	),
	priority: z
		.number()
		.min(1)
		.max(10)
		.describe(
			"1-10 from actionability and measured business impact, not raw percentage size."
		),
	changePercent: z
		.number()
		.optional()
		.describe("Signed percentage change for the primary metric."),
	subjectKey: z
		.string()
		.min(1)
		.describe("Stable identifier reused for the same underlying signal."),
	sources: z
		.array(insightSourceSchema)
		.min(1)
		.max(4)
		.describe("Evidence domains actually used for this finding."),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe("0-1 confidence based on how directly the evidence supports it."),
	impactSummary: z
		.string()
		.optional()
		.describe("Measured cost or blockage, only when it adds new information."),
	rootCause: z
		.string()
		.optional()
		.describe("Evidence-backed mechanism. Omit when unknown."),
	evidence: z
		.array(insightEvidenceSchema)
		.max(5)
		.optional()
		.describe("Distinct supporting facts not repeated in the narrative."),
};

export const generatedInsightSchema = z
	.object({
		...insightShape,
		type: generatedInsightTypeSchema,
		remediationKind: insightRemediationKindSchema.optional(),
	})
	.strict();

const investigationKeySchema = z.string().trim().min(1).max(160);
const investigationEntityIdSchema = z.string().trim().min(1).max(256);

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
		id: investigationEntityIdSchema,
		label: z.string().trim().min(1).max(120),
	})
	.strict();

export const investigationExpectationSchema = z
	.object({
		confirmation: z
			.object({
				count: z.number().int().positive(),
				definitionId: investigationKeySchema,
				definitionType: z.enum(["funnel", "goal"]),
				source: z.enum(["revenue_transactions", "server_completions"]),
			})
			.strict()
			.optional(),
		definitionUpdatedAt: z.iso.datetime(),
		eventName: investigationKeySchema,
		instruction: z.string().trim().min(1).max(180),
		kind: z.literal("tracking"),
		previousCompletions: z.number().int().min(10),
		currentEntrants: z.number().int().min(30),
		currentCompletions: z.literal(0),
		stepName: z.string().trim().min(1).max(120).optional(),
	})
	.strict();

export const investigationSignalSchema = z
	.object({
		signalKey: investigationKeySchema.describe(
			"Backend-owned identity for this exact signal."
		),
		websiteId: investigationKeySchema,
		kind: z.enum(["change", "absolute_state", "missing_expected_data"]),
		insightType: generatedInsightTypeSchema,
		entity: investigationEntitySchema,
		metric: insightMetricSchema
			.extend({
				key: investigationKeySchema,
			})
			.strict(),
		changePercent: z.number().nullable(),
		currency: z.string().trim().length(3).optional(),
		direction: z.enum(["up", "down", "flat"]),
		severity: insightSeveritySchema,
		sentiment: insightSentimentSchema,
		priority: z.number().int().min(1).max(10),
		period: weekOverWeekPeriodSchema,
		detectedAt: z.iso.date(),
		detection: z
			.object({
				method: z.enum(["zscore", "period_comparison", "rule"]),
				reason: z.string().trim().min(1).max(300),
				baselineDates: z.array(z.iso.date()).min(6).max(90).optional(),
			})
			.strict(),
		expectation: investigationExpectationSchema.optional(),
		sampleSize: z
			.object({
				current: z.number().int().nonnegative(),
				previous: z.number().int().nonnegative(),
			})
			.strict()
			.optional(),
	})
	.strict()
	.superRefine((signal, context) => {
		const baselineDates = signal.detection.baselineDates;
		if (signal.detection.method === "zscore" && !baselineDates) {
			context.addIssue({
				code: "custom",
				message:
					"Z-score signals require their exact comparable baseline dates",
				path: ["detection", "baselineDates"],
			});
			return;
		}
		if (signal.detection.method !== "zscore" && baselineDates) {
			context.addIssue({
				code: "custom",
				message: "Only Z-score signals may include sparse baseline dates",
				path: ["detection", "baselineDates"],
			});
			return;
		}
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
				path: ["detection", "baselineDates"],
			});
		}
	});

const investigationEvidenceBaseSchema = z
	.object({
		evidenceId: investigationKeySchema.describe(
			"Backend-owned identifier cited by an investigation result."
		),
		signalKey: investigationKeySchema,
		kind: z.enum([
			"data_health",
			"trend",
			"definition",
			"breakdown",
			"impact",
			"related_change",
		]),
		source: z.enum(["web", "product", "ops", "business", "sql"]),
		queryType: investigationKeySchema,
		entity: investigationEntitySchema.optional(),
		period: z.enum(["current", "previous", "custom"]),
		comparison: weekOverWeekPeriodSchema.optional(),
		remediation: investigationExpectationSchema.optional(),
		range: z
			.object({
				from: z.iso.date(),
				to: z.iso.date(),
			})
			.strict()
			.nullable(),
	})
	.strict();

const completedInvestigationEvidenceShape = {
	summary: z.string().trim().min(1).max(500),
	metrics: z.array(insightMetricSchema).max(10).optional(),
};

export const investigationEvidenceSchema = z
	.discriminatedUnion("status", [
		investigationEvidenceBaseSchema
			.extend({
				status: z.literal("ok"),
				rowCount: z.number().int().nonnegative(),
				...completedInvestigationEvidenceShape,
			})
			.strict(),
		investigationEvidenceBaseSchema
			.extend({
				status: z.literal("truncated"),
				rowCount: z.number().int().nonnegative(),
				...completedInvestigationEvidenceShape,
				truncationReason: z.string().trim().min(1).max(200),
			})
			.strict(),
		investigationEvidenceBaseSchema
			.extend({
				status: z.literal("empty"),
				rowCount: z.literal(0),
				summary: z.string().trim().min(1).max(500),
			})
			.strict(),
		investigationEvidenceBaseSchema
			.extend({
				status: z.literal("failed"),
				rowCount: z.literal(0),
				error: z.string().trim().min(1).max(500),
			})
			.strict(),
	])
	.superRefine((evidence, context) => {
		if (evidence.period === "custom" && evidence.range !== null) {
			context.addIssue({
				code: "custom",
				message: "Custom query evidence cannot claim a standard period range",
				path: ["range"],
			});
		}
		if (evidence.period !== "custom" && evidence.range === null) {
			context.addIssue({
				code: "custom",
				message: "Current and previous evidence require an exact range",
				path: ["range"],
			});
		}
		if (evidence.period !== "custom" && evidence.comparison) {
			context.addIssue({
				code: "custom",
				message:
					"Standard-period evidence cannot also claim a comparison window",
				path: ["comparison"],
			});
		}
	});

export const investigationDispositionSchema = z.enum([
	"action_ready",
	"needs_context",
	"monitor",
	"not_a_problem",
]);

export const externalContextGapSchema = z.enum([
	"expected_behavior",
	"business_priority",
	"planned_external_change",
]);

const remediationSchema = z
	.object({
		kind: insightRemediationKindSchema,
		evidenceId: investigationKeySchema.describe(
			"Backend-owned evidence ID that directly supports this repair."
		),
		instruction: z.string().trim().min(1).max(180),
	})
	.strict();

export const investigationDecisionSchema = z.discriminatedUnion("disposition", [
	z
		.object({
			disposition: z.literal("action_ready"),
			remediation: remediationSchema,
		})
		.strict(),
	z
		.object({
			disposition: z.literal("needs_context"),
			gap: externalContextGapSchema,
		})
		.strict(),
	z.object({ disposition: z.literal("monitor") }).strict(),
	z.object({ disposition: z.literal("not_a_problem") }).strict(),
]);

export type InsightSeverity = z.infer<typeof insightSeveritySchema>;
export type InsightSentiment = z.infer<typeof insightSentimentSchema>;
export type InsightSource = z.infer<typeof insightSourceSchema>;
export type InsightMetric = z.infer<typeof insightMetricSchema>;
export type InvestigationExpectation = z.infer<
	typeof investigationExpectationSchema
>;
export type InsightEvidence = z.infer<typeof insightEvidenceSchema>;
export type StoredInsightType = z.infer<typeof storedInsightTypeSchema>;
export type StoredInsightAction = z.infer<typeof storedInsightActionSchema>;
export type InsightRemediationKind = z.infer<
	typeof insightRemediationKindSchema
>;
export type ExternalContextGap = z.infer<typeof externalContextGapSchema>;
export type GeneratedInsight = z.infer<typeof generatedInsightSchema>;
export type InvestigationSignal = z.infer<typeof investigationSignalSchema>;
export type InvestigationEvidence = z.infer<typeof investigationEvidenceSchema>;
export type InvestigationDecision = z.infer<typeof investigationDecisionSchema>;

function normalizeInsightSubject(value: string): string {
	let key = "";
	let lastWasUnderscore = true;
	for (const character of value.trim().toLowerCase()) {
		if (
			(character >= "a" && character <= "z") ||
			(character >= "0" && character <= "9")
		) {
			key += character;
			lastWasUnderscore = false;
		} else if (!lastWasUnderscore) {
			key += "_";
			lastWasUnderscore = true;
		}
	}
	return (key.endsWith("_") ? key.slice(0, -1) : key).slice(0, 80);
}

export function deriveInsightSubjectKey(input: {
	subjectKey?: string | null;
	title?: string | null;
	type: StoredInsightType;
}): string {
	for (const value of [input.subjectKey, input.title]) {
		if (value) {
			const normalized = normalizeInsightSubject(value);
			if (normalized) {
				return normalized;
			}
		}
	}
	return input.type;
}

export interface InsightDedupeInput {
	changePercent?: number | null;
	sentiment: InsightSentiment;
	subjectKey?: string | null;
	title?: string | null;
	type: StoredInsightType;
	websiteId: string;
}

export function directionKeyFromParts(
	changePercent: number | null | undefined,
	sentiment: InsightSentiment
): "down" | "flat" | "up" {
	if (
		changePercent !== null &&
		changePercent !== undefined &&
		changePercent !== 0
	) {
		return changePercent > 0 ? "up" : "down";
	}
	if (sentiment === "positive") {
		return "up";
	}
	if (sentiment === "negative") {
		return "down";
	}
	return "flat";
}

export function insightDedupeKey(input: InsightDedupeInput): string {
	const direction = directionKeyFromParts(input.changePercent, input.sentiment);
	return `${input.websiteId}|${input.type}|${direction}|${deriveInsightSubjectKey(input)}`;
}
