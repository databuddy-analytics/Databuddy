import { describe, expect, it } from "bun:test";
import {
	deriveInsightSubjectKey,
	generatedInsightSchema,
	type InsightDedupeInput,
	investigationEvidenceSchema,
	investigationResultSchema,
	investigationSignalSchema,
	investigationSubmissionSchema,
	insightDedupeKey,
} from "./insights";

const baseInsight = {
	title: "Pricing page traffic up 28%",
	description: "Pricing visitors grew while bounce rate improved.",
	suggestion: "Review the next high-intent step.",
	metrics: [
		{
			label: "Pricing Page Visitors",
			current: 640,
			previous: 500,
			format: "number" as const,
		},
	],
	severity: "info" as const,
	sentiment: "positive" as const,
	priority: 6,
	type: "traffic_spike" as const,
	subjectKey: "pricing_page",
	sources: ["web" as const],
	confidence: 0.82,
};

describe("generatedInsightSchema", () => {
	it("accepts the generated contract", () => {
		expect(generatedInsightSchema.safeParse(baseInsight).success).toBe(true);
		expect(
			generatedInsightSchema.safeParse({
				...baseInsight,
				impactSummary: "Revenue at risk if not addressed.",
			}).success
		).toBe(true);
	});

	it("requires one to five metrics", () => {
		expect(
			generatedInsightSchema.safeParse({ ...baseInsight, metrics: [] }).success
		).toBe(false);
		expect(
			generatedInsightSchema.safeParse({
				...baseInsight,
				metrics: Array.from({ length: 6 }, (_, index) => ({
					label: `Metric ${index}`,
					current: index,
					format: "number" as const,
				})),
			}).success
		).toBe(false);
	});
});

const signal = {
	signalKey: "site-1|goal|signup|completion_rate",
	websiteId: "site-1",
	kind: "absolute_state" as const,
	insightType: "conversion_leak" as const,
	entity: {
		type: "goal" as const,
		id: "signup",
		label: "Signup completed",
	},
	metric: {
		key: "goal_completion_rate",
		label: "Signup completion rate",
		current: 0,
		previous: 0.18,
		format: "percent" as const,
	},
	changePercent: -100,
	direction: "down" as const,
	severity: "critical" as const,
	sentiment: "negative" as const,
	priority: 10,
	period: {
		current: { from: "2026-07-01", to: "2026-07-07" },
		previous: { from: "2026-06-24", to: "2026-06-30" },
	},
	detectedAt: "2026-07-08",
	detection: {
		method: "rule" as const,
		reason: "The configured goal received traffic but no completions.",
	},
	sampleSize: { current: 412, previous: 389 },
};

const evidenceBase = {
	evidenceId: "evidence:goal-definition",
	signalKey: signal.signalKey,
	kind: "definition" as const,
	source: "product" as const,
	queryType: "goal_configuration",
	period: "current" as const,
	range: { from: "2026-07-01", to: "2026-07-07" },
};

describe("investigationSignalSchema", () => {
	it("accepts a complete backend-owned signal", () => {
		expect(investigationSignalSchema.parse(signal)).toEqual(signal);
	});

	it("requires exact entity identity and comparison windows", () => {
		expect(
			investigationSignalSchema.safeParse({
				...signal,
				entity: { type: "goal", label: "Signup completed" },
			}).success
		).toBe(false);
		expect(
			investigationSignalSchema.safeParse({
				...signal,
				period: {
					...signal.period,
					current: { from: "last week", to: "2026-07-07" },
				},
			}).success
		).toBe(false);
	});

	it("rejects model-authored identity fields", () => {
		expect(
			investigationSignalSchema.safeParse({
				...signal,
				subjectKey: "signup",
			}).success
		).toBe(false);
	});

	it("requires exact sparse baseline dates for zscore signals", () => {
		const baselineDates = [
			"2026-06-24",
			"2026-06-25",
			"2026-06-26",
			"2026-06-27",
			"2026-06-28",
			"2026-06-30",
		];
		const zscoreSignal = {
			...signal,
			period: {
				...signal.period,
				previous: { from: baselineDates[0], to: baselineDates.at(-1) },
			},
			detection: {
				method: "zscore",
				reason: "The latest day differs from comparable historical days.",
				baselineDates,
			},
		};

		expect(investigationSignalSchema.safeParse(zscoreSignal).success).toBe(true);
		expect(
			investigationSignalSchema.safeParse({
				...zscoreSignal,
				detection: { ...zscoreSignal.detection, baselineDates: undefined },
			}).success
		).toBe(false);
		expect(
			investigationSignalSchema.safeParse({
				...zscoreSignal,
				detection: {
					...zscoreSignal.detection,
					baselineDates: baselineDates.slice(1),
				},
			}).success
		).toBe(false);
	});
});

describe("investigationEvidenceSchema", () => {
	it("keeps usable, empty, truncated, and failed query states distinct", () => {
		expect(
			investigationEvidenceSchema.safeParse({
				...evidenceBase,
				status: "ok",
				rowCount: 1,
				summary: "The goal is configured for signup_completed.",
			}).success
		).toBe(true);
		expect(
			investigationEvidenceSchema.safeParse({
				...evidenceBase,
				status: "empty",
				rowCount: 0,
				summary: "No signup_completed events were recorded.",
			}).success
		).toBe(true);
		expect(
			investigationEvidenceSchema.safeParse({
				...evidenceBase,
				status: "truncated",
				rowCount: 147,
				summary: "The first 100 event names contain no exact match.",
				truncationReason: "The event-name query reached its row limit.",
			}).success
		).toBe(true);
		expect(
			investigationEvidenceSchema.safeParse({
				...evidenceBase,
				status: "failed",
				rowCount: 0,
				error: "The analytics query timed out.",
			}).success
		).toBe(true);
	});

	it("does not let failed or empty queries masquerade as measured evidence", () => {
		const metrics = [{ label: "Completions", current: 0, format: "number" }];
		expect(
			investigationEvidenceSchema.safeParse({
				...evidenceBase,
				status: "failed",
				rowCount: 0,
				error: "The analytics query timed out.",
				metrics,
			}).success
		).toBe(false);
		expect(
			investigationEvidenceSchema.safeParse({
				...evidenceBase,
				status: "empty",
				rowCount: 0,
				summary: "No rows matched.",
				metrics,
			}).success
		).toBe(false);
	});

	it("requires exact ranges for standard periods", () => {
		expect(
			investigationEvidenceSchema.safeParse({
				...evidenceBase,
				status: "ok",
				rowCount: 1,
				range: null,
				summary: "The goal is configured.",
			}).success
		).toBe(false);
		expect(
			investigationEvidenceSchema.safeParse({
				...evidenceBase,
				source: "sql",
				period: "custom",
				range: null,
				status: "ok",
				rowCount: 1,
				summary: "The scoped query returned one aggregate row.",
			}).success
		).toBe(true);
	});
});

const actionReadyResult = {
	signalKey: signal.signalKey,
	disposition: "action_ready" as const,
	evidenceIds: [evidenceBase.evidenceId],
	title: "Signup tracking stopped",
	summary: "Visitors reach signup, but its configured completion event is absent.",
	action: "Restore the signup_completed event on successful signup.",
	confidence: 0.94,
	rootCause: "The configured completion event is no longer emitted.",
	verification: {
		successCondition: "signup_completed is recorded after successful signup.",
		checkAfterDays: 1,
	},
};

describe("investigationResultSchema", () => {
	it("accepts an evidence-cited action with a verification plan", () => {
		expect(investigationResultSchema.parse(actionReadyResult)).toEqual(
			actionReadyResult
		);
	});

	it("allows missing context without fabricated evidence", () => {
		expect(
			investigationResultSchema.safeParse({
				signalKey: signal.signalKey,
				disposition: "needs_context",
				evidenceIds: [],
				summary: "The goal definition cannot be loaded.",
				confidence: 1,
				missingContext: "The configured event name and matching rules.",
				question: "Which event should complete this goal?",
			}).success
		).toBe(true);
	});

	it("requires evidence for conclusions and an escalation threshold to monitor", () => {
		expect(
			investigationResultSchema.safeParse({
				...actionReadyResult,
				evidenceIds: [],
			}).success
		).toBe(false);
		expect(
			investigationResultSchema.safeParse({
				signalKey: signal.signalKey,
				disposition: "monitor",
				evidenceIds: [evidenceBase.evidenceId],
				summary: "One incomplete day is not enough to establish a break.",
				confidence: 0.72,
				checkAfterDays: 2,
			}).success
		).toBe(false);
	});

	it("rejects duplicate evidence citations", () => {
		expect(
			investigationResultSchema.safeParse({
				...actionReadyResult,
				evidenceIds: [evidenceBase.evidenceId, evidenceBase.evidenceId],
			}).success
		).toBe(false);
	});
});

describe("investigationSubmissionSchema", () => {
	it("submits one terminal result per signal", () => {
		expect(
			investigationSubmissionSchema.safeParse({
				results: [actionReadyResult],
			}).success
		).toBe(true);
		expect(
			investigationSubmissionSchema.safeParse({
				results: [
					actionReadyResult,
					{
						signalKey: signal.signalKey,
						disposition: "not_a_problem",
						evidenceIds: [evidenceBase.evidenceId],
						summary: "This was an expected configuration change.",
						confidence: 0.98,
					},
				],
			}).success
		).toBe(false);
	});
});

describe("deriveInsightSubjectKey", () => {
	it("normalizes the explicit key", () => {
		expect(
			deriveInsightSubjectKey({
				subjectKey: "  Google / Organic  ",
				type: "traffic_spike",
			})
		).toBe("google_organic");
	});

	it("falls back through title and type", () => {
		expect(
			deriveInsightSubjectKey({
				subjectKey: "",
				title: "Bounce Rate Spike",
				type: "engagement_change",
			})
		).toBe("bounce_rate_spike");
		expect(
			deriveInsightSubjectKey({
				subjectKey: null,
				title: null,
				type: "performance",
			})
		).toBe("performance");
	});

	it("trims separators and limits keys to 80 characters", () => {
		expect(
			deriveInsightSubjectKey({
				subjectKey: "---hello---",
				type: "performance",
			})
		).toBe("hello");
		expect(
			deriveInsightSubjectKey({
				subjectKey: "a".repeat(100),
				type: "performance",
			}).length
		).toBe(80);
	});
});

describe("insightDedupeKey", () => {
	const base: InsightDedupeInput = {
		websiteId: "site-1",
		type: "traffic_spike",
		sentiment: "positive",
		changePercent: 15,
		subjectKey: "google",
	};

	it("includes website, type, direction, and subject", () => {
		expect(insightDedupeKey(base)).toBe(
			"site-1|traffic_spike|up|google"
		);
		expect(insightDedupeKey({ ...base, changePercent: -10 })).toBe(
			"site-1|traffic_spike|down|google"
		);
	});

	it("uses sentiment when change is absent or flat", () => {
		expect(
			insightDedupeKey({ ...base, changePercent: 0, sentiment: "negative" })
		).toBe("site-1|traffic_spike|down|google");
		expect(
			insightDedupeKey({
				...base,
				changePercent: null,
				sentiment: "neutral",
			})
		).toBe("site-1|traffic_spike|flat|google");
	});

	it("falls back to the title for missing subject keys", () => {
		expect(
			insightDedupeKey({
				websiteId: "site-1",
				type: "error_spike",
				sentiment: "negative",
				changePercent: -5,
				subjectKey: null,
				title: "404 errors rising",
			})
		).toBe("site-1|error_spike|down|404_errors_rising");
	});
});
