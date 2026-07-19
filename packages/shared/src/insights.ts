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
	"code",
]);
const generatedInsightTypeSchema = z.enum(generatedInsightTypes);
export const storedInsightTypeSchema = z.enum([
	...generatedInsightTypes,
	"cross_property_dependency",
	"deploy_correlation",
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

export const insightEvidenceSchema = z.object({
	type: z.enum(["segment", "error", "annotation", "temporal", "metric"]),
	description: z.string(),
});

const insightRemediationKindSchema = z.enum([
	"code",
	"tracking",
	"configuration",
	"campaign",
	"operations",
]);

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
		id: investigationKeySchema,
		label: z.string().trim().min(1).max(120),
	})
	.strict();

export const investigationSignalSchema = z
	.object({
		signalKey: investigationKeySchema.describe(
			"Backend-owned identity for this exact signal."
		),
		websiteId: investigationKeySchema,
		insightType: generatedInsightTypeSchema,
		entity: investigationEntitySchema,
		metric: insightMetricSchema
			.extend({
				key: investigationKeySchema,
			})
			.strict(),
		changePercent: z.number().nullable(),
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
				boundary: z
					.object({
						comparison: z.enum(["at_or_above", "at_or_below"]),
						value: z.number(),
					})
					.strict()
					.optional(),
			})
			.strict(),
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

export const investigationEvidenceSchema = z
	.object({
		source: insightSourceSchema,
		summary: z.string().trim().min(1).max(500),
		metrics: z.array(insightMetricSchema).max(10).optional(),
	})
	.strict();

const investigationNextSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("act"),
		action: z.string().trim().min(1),
		kind: insightRemediationKindSchema,
		owner: z.string().trim().min(1),
		target: z.string().trim().min(1),
		verification: z.string().trim().min(1),
	}),
	z.object({
		type: z.literal("ask"),
		question: z.string().trim().min(1),
		who: z.string().trim().min(1),
		why: z.string().trim().min(1),
	}),
	z.object({
		type: z.literal("watch"),
		escalation: z.string().trim().min(1),
	}),
	z.object({
		type: z.literal("resolve"),
		reason: z.string().trim().min(1),
	}),
]);

export const investigationOutcomeSchema = z
	.object({
		title: z.string().trim().min(1),
		summary: z.string().trim().min(1),
		impact: z.string().trim().min(1).nullable(),
		rootCause: z.string().trim().min(1).nullable(),
		rootCauseConfidence: z.number().min(0).max(1),
		impactConfidence: z.number().min(0).max(1),
		evidence: z.array(z.string().trim().min(1)).min(1).max(3),
		sources: z.array(insightSourceSchema).min(1).max(5),
		next: investigationNextSchema,
	})
	.strict();

export type InsightSeverity = z.infer<typeof insightSeveritySchema>;
export type InsightSentiment = z.infer<typeof insightSentimentSchema>;
export type InsightSource = z.infer<typeof insightSourceSchema>;
export type InsightMetric = z.infer<typeof insightMetricSchema>;
export type InsightEvidence = z.infer<typeof insightEvidenceSchema>;
export type StoredInsightType = z.infer<typeof storedInsightTypeSchema>;
export type InvestigationSignal = z.infer<typeof investigationSignalSchema>;
export type InvestigationEvidence = z.infer<typeof investigationEvidenceSchema>;
export type InvestigationOutcome = z.infer<typeof investigationOutcomeSchema>;

export function parseInvestigationOutcome(
	value: unknown
): InvestigationOutcome | null {
	const direct = investigationOutcomeSchema.safeParse(value);
	return direct.success ? direct.data : null;
}
