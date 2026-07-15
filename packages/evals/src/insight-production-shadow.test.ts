import { describe, expect, test } from "bun:test";
import type {
	GeneratedInsight,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import {
	assertShadowEvidenceUsesClickHouse,
	chronologicalOffsets,
	configureIsolatedShadowRedis,
	createSnapshotProductMetricsFetcher,
	evaluateShadowGates,
	HISTORICAL_LIMITATIONS,
	observationsAt,
	quarantineShadowPostgresEnvironment,
	renderShadowInsight,
	runCancellableAttempt,
	summarizeValidationErrors,
	withDefinitionSnapshot,
} from "./insight-production-shadow";
import type { ShadowObservation } from "./insight-production-shadow";
import type {
	FunnelDef,
	GoalDef,
} from "../../../apps/insights/src/funnel-detection";
import type { LatestInsightObservation } from "../../../apps/insights/src/observations";

function signal(signalKey: string, current: number): InvestigationSignal {
	return {
		changePercent: -50,
		detectedAt: "2026-01-08",
		detection: {
			method: "period_comparison",
			reason: "Visitors fell against the prior complete period.",
		},
		direction: "down",
		entity: { id: "website", label: "Website", type: "website" },
		insightType: "traffic_drop",
		kind: "change",
		metric: {
			current,
			format: "number",
			key: "visitors",
			label: "Visitors",
			previous: 100,
		},
		period: {
			current: { from: "2026-01-02", to: "2026-01-08" },
			previous: { from: "2025-12-26", to: "2026-01-01" },
		},
		priority: 7,
		sentiment: "negative",
		severity: "warning",
		signalKey,
		websiteId: "site-1",
	};
}

function observation(
	asOf: string,
	current: number,
	signalKey = "website:visitors"
): LatestInsightObservation {
	return {
		asOf: new Date(asOf),
		decision: { disposition: "monitor" },
		evidence: [],
		recheckAt: new Date("2026-02-01T00:00:00.000Z"),
		signal: signal(signalKey, current),
	};
}

describe("production shadow definition snapshots", () => {
	test("removes the live definition loader", async () => {
		const timestamp = new Date("2026-01-01T00:00:00.000Z");
		const funnels: FunnelDef[] = [
			{
				createdAt: timestamp,
				filters: null,
				id: "snapshot-funnel",
				name: "Checkout",
				steps: [
					{ name: "Start", target: "/", type: "PAGE_VIEW" },
					{ name: "Buy", target: "purchase", type: "EVENT" },
				],
				updatedAt: timestamp,
			},
		];
		const goals: GoalDef[] = [
			{
				createdAt: timestamp,
				filters: null,
				id: "snapshot-goal",
				name: "Signup",
				target: "signup",
				type: "EVENT",
				updatedAt: timestamp,
			},
		];
		const deps = withDefinitionSnapshot(
			{
				fetchDefinitionWindow: async () => {
					throw new Error("live loader must not run");
				},
				funnelConversion: async () => ({
					completions: 0,
					entrants: 0,
					rate: 0,
					steps: [],
				}),
				goalConversion: async () => ({ completions: 0, entrants: 0, rate: 0 }),
			},
			funnels,
			goals
		);

		expect(deps.fetchDefinitionWindow).toBeUndefined();
		expect(await deps.fetchFunnels?.()).toBe(funnels);
		expect(await deps.fetchGoals?.()).toBe(goals);
	});

	test("builds private goal and funnel evidence from snapshot conversions", async () => {
		const timestamp = new Date("2026-01-01T00:00:00.000Z");
		const fetch = createSnapshotProductMetricsFetcher(
			{
				funnelConversion: async () => ({
					completions: 20,
					entrants: 100,
					rate: 20,
					steps: [
						{ stepNumber: 1, users: 100 },
						{ stepNumber: 2, users: 20 },
					],
				}),
				goalConversion: async () => ({
					completions: 10,
					entrants: 40,
					rate: 25,
				}),
			},
			[
				{
					createdAt: timestamp,
					filters: null,
					id: "snapshot-funnel",
					name: "Checkout",
					steps: [
						{ name: "Start", target: "/", type: "PAGE_VIEW" },
						{ name: "Buy", target: "purchase", type: "EVENT" },
					],
					updatedAt: timestamp,
				},
			],
			[
				{
					createdAt: timestamp,
					filters: null,
					id: "snapshot-goal",
					name: "Signup",
					target: "signup",
					type: "EVENT",
					updatedAt: timestamp,
				},
			]
		);
		const appContext = {
			chatId: "shadow:test",
			currentDateTime: timestamp.toISOString(),
			organizationId: "org_example",
			timezone: "UTC",
			userId: "system",
			websiteId: "site_example",
		};

		await expect(
			fetch(
				appContext,
				{ from: "2025-12-01", to: "2025-12-07" },
				{ id: "snapshot-goal", type: "goal" }
			)
		).resolves.toMatchObject({
			results: [
				{
					goals: [
						{
							id: "snapshot-goal",
							overall_conversion_rate: 25,
							total_users_completed: 10,
						},
					],
					type: "goals_summary",
				},
			],
		});
		await expect(
			fetch(
				appContext,
				{ from: "2025-12-01", to: "2025-12-07" },
				{ id: "snapshot-funnel", type: "funnel" }
			)
		).resolves.toMatchObject({
			results: [
				{
					funnels: [
						{
							biggest_dropoff_rate: 80,
							biggest_dropoff_step: 2,
							id: "snapshot-funnel",
							steps: [{ users: 100 }, { users: 20 }],
						},
					],
					type: "funnels_summary",
				},
			],
		});
		expect(appContext).not.toHaveProperty("serviceAuth");
	});
});

describe("production shadow process isolation", () => {
	test("allows only ClickHouse-backed operations evidence", () => {
		expect(() =>
			assertShadowEvidenceUsesClickHouse({
				input: {
					period: "current",
					queries: [
						{ type: "error_fingerprints" },
						{ type: "uptime_summary" },
					],
				},
				name: "ops_context",
			})
		).not.toThrow();
		expect(() =>
			assertShadowEvidenceUsesClickHouse({
				input: {
					period: "current",
					queries: [{ type: "anomaly_summary" }],
				},
				name: "ops_context",
			})
		).toThrow("blocks non-ClickHouse ops evidence: anomaly_summary");
	});

	test("quarantines the process from the captured production database", () => {
		const previous = {
			databaseUrl: process.env.DATABASE_URL,
			timeout: process.env.DB_CONNECTION_TIMEOUT_MS,
			pgOptions: process.env.PGOPTIONS,
		};
		try {
			process.env.DATABASE_URL =
				"postgresql://user:secret@production.example.test/databuddy";

			quarantineShadowPostgresEnvironment();

			const guardedUrl = new URL(process.env.DATABASE_URL ?? "");
			expect(guardedUrl.hostname).toBe("127.0.0.1");
			expect(guardedUrl.port).toBe("1");
			expect(process.env.DB_CONNECTION_TIMEOUT_MS).toBe("250");
			expect(process.env.PGOPTIONS).toBeUndefined();
		} finally {
			for (const [key, value] of Object.entries({
				DATABASE_URL: previous.databaseUrl,
				DB_CONNECTION_TIMEOUT_MS: previous.timeout,
				PGOPTIONS: previous.pgOptions,
			})) {
				if (value === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = value;
				}
			}
		}
	});

	test("replaces production Redis and BullMQ URLs with loopback DB 15", () => {
		const previous = {
			bullmq: process.env.BULLMQ_REDIS_URL,
			insights: process.env.INSIGHTS_BULLMQ_REDIS_URL,
			redis: process.env.REDIS_URL,
		};
		try {
			process.env.REDIS_URL = "rediss://production.example.test/0";
			process.env.BULLMQ_REDIS_URL = "rediss://production.example.test/1";
			process.env.INSIGHTS_BULLMQ_REDIS_URL =
				"rediss://production.example.test/2";

			configureIsolatedShadowRedis();

			expect(process.env.REDIS_URL).toBe("redis://127.0.0.1:6379/15");
			expect(process.env.BULLMQ_REDIS_URL).toBe(
				"redis://127.0.0.1:6379/15"
			);
			expect(process.env.INSIGHTS_BULLMQ_REDIS_URL).toBe(
				"redis://127.0.0.1:6379/15"
			);
		} finally {
			for (const [key, value] of Object.entries({
				BULLMQ_REDIS_URL: previous.bullmq,
				INSIGHTS_BULLMQ_REDIS_URL: previous.insights,
				REDIS_URL: previous.redis,
			})) {
				if (value === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = value;
				}
			}
		}
	});
});

describe("production shadow historical replay", () => {
	test("orders offsets from oldest to newest without mutating input", () => {
		const offsets = [0, 60, 7, 30];

		expect(chronologicalOffsets(offsets)).toEqual([60, 30, 7, 0]);
		expect(offsets).toEqual([0, 60, 7, 30]);
	});

	test("loads backfills only after creation and overlays replay state", () => {
		const persisted = [
			{
				...observation("2026-01-03T00:00:00.000Z", 30),
				createdAt: new Date("2026-01-03T01:00:00.000Z"),
				organizationId: "org-1",
				signalKey: "website:visitors",
				websiteId: "site-1",
			},
			{
				...observation("2026-01-05T00:00:00.000Z", 40),
				createdAt: new Date("2026-01-05T01:00:00.000Z"),
				organizationId: "org-1",
				signalKey: "website:visitors",
				websiteId: "site-1",
			},
			{
				...observation("2026-01-05T00:00:00.000Z", 50),
				createdAt: new Date("2026-01-20T02:00:00.000Z"),
				organizationId: "org-1",
				signalKey: "website:visitors",
				websiteId: "site-1",
			},
		] satisfies ShadowObservation[];
		const params = {
			asOf: new Date("2026-01-10T00:00:00.000Z"),
			organizationId: "org-1",
			persisted,
			signalKeys: ["website:visitors"],
			websiteId: "site-1",
		};

		expect(
			observationsAt({ ...params, simulated: new Map() }).get(
				"website:visitors"
			)?.signal.metric.current
		).toBe(40);
		expect(
			observationsAt({
				...params,
				asOf: new Date("2026-01-21T00:00:00.000Z"),
				simulated: new Map(),
			}).get("website:visitors")?.signal.metric.current
		).toBe(50);
		expect(
			observationsAt({
				...params,
				simulated: new Map([
					[
						"website:visitors",
						observation("2026-01-08T00:00:00.000Z", 80),
					],
				]),
			}).get("website:visitors")?.signal.metric.current
		).toBe(80);
	});

	test("discloses the historical states the replay cannot reconstruct", () => {
		const disclosure = HISTORICAL_LIMITATIONS.join(" ");

		expect(disclosure).toContain("inactive, deleted, and pre-edit revisions");
		expect(disclosure).toContain("annotation edits");
		expect(disclosure).toContain("late-arriving");
		expect(disclosure).toContain("production state is never changed");
	});
});

describe("production shadow pre-ship gates", () => {
	const passingMetrics = {
		detectionFailures: 0,
		detectionIncomplete: 0,
		evidenceFailed: 0,
		evidenceTruncated: 0,
		repeatAgreement: 1,
		status: { completed: 4 },
		visibleWords: { max: 100 },
	};

	test("passes clean output and ignores repeat agreement when repeat is off", () => {
		expect(evaluateShadowGates(passingMetrics, true)).toEqual([]);
		expect(
			evaluateShadowGates(
				{ ...passingMetrics, repeatAgreement: null },
				false
			)
		).toEqual([]);
	});

	test("reports expected partial definition coverage without failing the release", () => {
		expect(
			evaluateShadowGates(
				{ ...passingMetrics, detectionIncomplete: 3 },
				true
			)
		).toEqual([]);
	});

	test("reports every failed PRD pre-ship gate", () => {
		expect(
			evaluateShadowGates(
				{
					detectionFailures: 3,
					detectionIncomplete: 3,
					evidenceFailed: 4,
					evidenceTruncated: 5,
					repeatAgreement: null,
					status: { error: 1, invalid_output: 2 },
					visibleWords: { max: 101 },
				},
				true
			)
		).toEqual([
			{ actual: 1, comparator: "eq", gate: "error_cases", required: 0 },
			{
				actual: 2,
				comparator: "eq",
				gate: "invalid_output_cases",
				required: 0,
			},
			{
				actual: 3,
				comparator: "eq",
				gate: "detection_failed_probes",
				required: 0,
			},
			{ actual: 4, comparator: "eq", gate: "evidence_failed", required: 0 },
			{
				actual: 5,
				comparator: "eq",
				gate: "evidence_truncated",
				required: 0,
			},
			{
				actual: 101,
				comparator: "lte",
				gate: "visible_words_max",
				required: 100,
			},
			{
				actual: null,
				comparator: "eq",
				gate: "repeat_agreement",
				required: 1,
			},
		]);
	});
});

describe("production shadow attempt deadline", () => {
	test("aborts timed-out work with the same generic error", async () => {
		let observedSignal: AbortSignal | undefined;
		const attempt = runCancellableAttempt(
			(signal) => {
				observedSignal = signal;
				return new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), {
						once: true,
					});
				});
			},
			5
		);

		await expect(attempt).rejects.toThrow(
			"Production shadow attempt exceeded 5ms"
		);
		expect(observedSignal?.aborted).toBe(true);
		expect((observedSignal?.reason as Error).name).toBe("TimeoutError");
	});

	test("returns completed work before the deadline", async () => {
		let observedSignal: AbortSignal | undefined;
		await expect(
			runCancellableAttempt(async (signal) => {
				observedSignal = signal;
				expect(signal.aborted).toBe(false);
				return "done";
			}, 5)
		).resolves.toBe("done");

		await Bun.sleep(10);
		expect(observedSignal?.aborted).toBe(false);
	});

	test("keeps concurrent attempt deadlines isolated", async () => {
		let completedSignal: AbortSignal | undefined;
		const timedOut = runCancellableAttempt(
			(signal) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), {
						once: true,
					});
				}),
			5
		);
		const completed = runCancellableAttempt(async (signal) => {
			completedSignal = signal;
			await Bun.sleep(15);
			return "done";
		}, 50);

		await expect(timedOut).rejects.toThrow(
			"Production shadow attempt exceeded 5ms"
		);
		await expect(completed).resolves.toBe("done");
		expect(completedSignal?.aborted).toBe(false);
	});
});

describe("production shadow validation errors", () => {
	test("projects a bounded sanitized invalid-output summary", () => {
		const summary = summarizeValidationErrors(
			[
				"First validation error for secret-token",
				"Second validation error",
				"Third validation error",
				"Fourth validation error",
				"Fifth validation error",
				"This sixth error must be omitted",
			],
			["secret-token"]
		);

		expect(summary).toContain("[entity]");
		expect(summary).not.toContain("secret-token");
		expect(summary).not.toContain("sixth");
		expect(summary?.length).toBeLessThanOrEqual(300);
	});

	test("sanitizes whole tokens and counts exactly the rendered fields", () => {
		const insight: GeneratedInsight = {
			changePercent: 300,
			confidence: 0.65,
			description: "Failure remains for AI.",
			evidence: [
				{
					description:
						"xAI:checkoutx and AI:checkout affected 21 sessions while Failure stayed isolated.",
					type: "error",
				},
			],
			impactSummary: "Thirty additional failures were measured.",
			metrics: [
				{ current: 40, format: "number", label: "Errors", previous: 10 },
			],
			priority: 9,
			rootCause: "Failure originated in AI checkout handling.",
			sentiment: "negative",
			severity: "critical",
			sources: ["ops"],
			subjectKey: "error_count",
			suggestion: "Inspect AI checkout handling immediately.",
			title: "AI checkout failures increased sharply this week",
			type: "error_spike",
		};

		const rendered = renderShadowInsight(insight, true, ["AI", "AI:checkout"]);
		const visibleText = [
			rendered.title,
			rendered.description,
			rendered.impact,
			rendered.rootCause,
			...rendered.evidence,
			rendered.suggestion,
		]
			.filter((value): value is string => Boolean(value))
			.join(" ");

		expect(rendered.title).toBe("Investigate [error]");
		expect(rendered.description).toBe("Failure remains for [entity].");
		expect(rendered.rootCause).toContain("Failure originated");
		expect(rendered.rootCause).not.toContain("F[entity]lure");
		expect(rendered.evidence[0]).toContain("xAI:checkoutx and [entity]");
		expect(rendered.visibleWords).toBe(visibleText.split(/\s+/).length);
	});
});
