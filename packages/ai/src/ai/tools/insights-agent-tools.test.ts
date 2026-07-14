import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as actualQuery from "../../query";
import * as actualProductContext from "../insights/product-context";
import type {
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import type { AppContext } from "../config/context";
import type { ProductInsightTarget } from "../insights/product-context";
import type { InsightEvidenceReadRequest } from "./insights-agent-tools";

type WebQueryMode =
	| "changed"
	| "error-bundle"
	| "error-nullish-location"
	| "failed"
	| "large"
	| "normal"
	| "revenue-reconcile"
	| "uptime-empty"
	| "vital-pages";
type ProductQueryMode = "missing-goal" | "normal" | "stale-goal";

let queryCalls = 0;
let queryAbortSignals: Array<AbortSignal | undefined> = [];
let queryRequests: {
	filters?: { field: string; op: string; value: unknown }[];
	from?: string;
	type: string;
}[] = [];
let revenueCallsByFrom = new Map<string, number>();
let productCalls: {
	range: { from: string; to: string };
	target: ProductInsightTarget;
}[] = [];
let productQueryMode: ProductQueryMode = "normal";
let webQueryMode: WebQueryMode = "normal";

mock.module("../../query", () => ({
	...actualQuery,
	executeQuery: async (
		request: {
			filters?: { field: string; op: string; value: unknown }[];
			from?: string;
			type: string;
		},
		_domain?: string,
		_timezone?: string,
		abortSignal?: AbortSignal
	) => {
		queryCalls += 1;
		queryAbortSignals.push(abortSignal);
		queryRequests.push(request);
		if (webQueryMode === "failed") {
			throw new Error("warehouse unavailable");
		}
		if (webQueryMode === "large") {
			return [{ message: "x".repeat(60_000) }];
		}
		if (webQueryMode === "changed") {
			return [{ sessions: 121 }];
		}
		if (
			webQueryMode === "revenue-reconcile" &&
			request.type === "revenue_overview"
		) {
			const from = request.from ?? "unknown";
			const call = (revenueCallsByFrom.get(from) ?? 0) + 1;
			revenueCallsByFrom.set(from, call);
			return [
				{
					total_revenue: call === 1 ? 1 : from === "2026-07-01" ? 40 : 80,
					total_transactions: 4,
					unique_customers: 4,
				},
			];
		}
		if (
			webQueryMode === "error-nullish-location" &&
			request.type === "error_fingerprints"
		) {
			return [
				{
					message: " null ",
					name: "TypeError: placeholder location",
					count: 8,
					users: 5,
					sessions: 5,
					path: "/checkout",
					filename: " Undefined ",
					line: 31,
				},
			];
		}
		if (webQueryMode === "error-bundle") {
			if (request.type === "error_summary") {
				return [
					{
						totalErrors: 36,
						affectedUsers: 24,
						affectedSessions: 22,
						errorRate: 4.2,
					},
				];
			}
			if (request.type === "errors_by_page") {
				return [{ name: "/checkout", errors: 30, users: 21 }];
			}
			if (request.type === "error_fingerprints") {
				return [
					{
						name: "TypeError: example failure",
						count: 30,
						users: 21,
						sessions: 20,
						path: "/checkout",
						filename: "app.js",
						line: 42,
					},
				];
			}
		}
		if (
			webQueryMode === "vital-pages" &&
			request.type === "web_vitals_by_page"
		) {
			return [
				{
					name: "/outlier",
					p75_inp: 76_000_000,
					visitors: 7,
					measurements: 7,
				},
				{
					name: "/checkout",
					p75_inp: 320,
					visitors: 30,
					measurements: 60,
				},
				{
					name: "/pricing",
					p75_inp: 280,
					visitors: 25,
					measurements: 50,
				},
				{
					name: "/home",
					p75_inp: 240,
					visitors: 20,
					measurements: 40,
				},
				{
					name: "/healthy",
					p75_inp: 150,
					visitors: 100,
					measurements: 200,
				},
			];
		}
		if (webQueryMode === "uptime-empty" && request.type === "uptime_overview") {
			return [
				{
					total_checks: 0,
					uptime_percentage: 0,
					avg_response_time: null,
					ssl_expiry: null,
					ssl_valid: 0,
				},
			];
		}
		if (request.type === "top_pages") {
			return [];
		}
		return [{ sessions: 120 }];
	},
}));

mock.module("../insights/product-context", () => ({
	...actualProductContext,
	fetchProductMetrics: async (
		_context: unknown,
		range: { from: string; to: string },
		target: ProductInsightTarget
	) => {
		productCalls.push({ range, target });
		if (
			productQueryMode === "missing-goal" ||
			productQueryMode === "stale-goal"
		) {
			return {
				results: [
					{
						type: "goals_summary",
						count: 1,
						goals: [
							{
								id: target.id,
								is_active: true,
								definition_updated_at:
									productQueryMode === "stale-goal"
										? "2026-07-02T00:00:00.000Z"
										: "2026-06-01T00:00:00.000Z",
								type: "EVENT",
								target: "sign_up",
								name: "Signup",
								total_users_entered: 100,
								total_users_completed: 0,
								overall_conversion_rate: 0,
							},
						],
					},
				],
			};
		}
		return {
			results: [
				{
					type: "goals_summary",
					count: 1,
					goals: [{ id: target.id, conversion_rate: 42 }],
				},
			],
		};
	},
}));

const { countEvidenceRows, createInsightEvidenceReader } = await import(
	"./insights-agent-tools"
);

const signal: InvestigationSignal = {
	signalKey: "website:traffic",
	websiteId: "site_example",
	kind: "change",
	insightType: "traffic_drop",
	entity: { type: "website", id: "website", label: "Traffic" },
	metric: {
		key: "visitors",
		label: "Visitors",
		current: 80,
		previous: 120,
		format: "number",
	},
	changePercent: -33.33,
	direction: "down",
	severity: "warning",
	sentiment: "negative",
	priority: 7,
	period: {
		current: { from: "2026-07-01", to: "2026-07-07" },
		previous: { from: "2026-06-24", to: "2026-06-30" },
	},
	detectedAt: "2026-07-07",
	detection: {
		method: "period_comparison",
		reason: "Visitors fell from the previous period.",
	},
};

const revenueSignal: InvestigationSignal = {
	...signal,
	signalKey: "revenue",
	entity: { type: "website", id: "website", label: "Revenue" },
	metric: {
		key: "revenue",
		label: "Revenue",
		current: 40,
		previous: 80,
		format: "number",
	},
};

const appContext: AppContext = {
	chatId: "chat_test",
	currentDateTime: "2026-07-07T00:00:00.000Z",
	organizationId: "org_test",
	timezone: "UTC",
	userId: "user_test",
	websiteDomain: "example.com",
	websiteId: "site_example",
};

function createReader(
	onEvidence?: (evidence: InvestigationEvidence) => void,
	selectedSignal: InvestigationSignal = signal
) {
	return createInsightEvidenceReader({
		domain: "example.com",
		onEvidence,
		signal: selectedSignal,
		timezone: "UTC",
		websiteId: "site_example",
	});
}

describe("insight evidence reader", () => {
	beforeEach(() => {
		productCalls = [];
		productQueryMode = "normal";
		queryCalls = 0;
		queryAbortSignals = [];
		queryRequests = [];
		revenueCallsByFrom = new Map();
		webQueryMode = "normal";
	});

	afterAll(() => {
		mock.module("../../query", () => actualQuery);
		mock.module("../insights/product-context", () => actualProductContext);
	});

	test("returns stable, signal-scoped success and empty evidence", async () => {
		const observed: InvestigationEvidence[] = [];
		const reader = createReader((evidence) => observed.push(evidence));
		const request = {
			name: "web_metrics",
			input: {
				period: "current",
				queries: [{ type: "top_referrers" }, { type: "top_pages" }],
			},
		} satisfies InsightEvidenceReadRequest;

		const first = await reader(request, appContext);
		const second = await reader(request, appContext);

		expect(first).toHaveLength(2);
		expect(first[0]).toMatchObject({
			period: "current",
			queryType: "top_referrers",
			range: { from: "2026-07-01", to: "2026-07-07" },
			status: "ok",
		});
		expect(first[1]).toMatchObject({
			queryType: "top_pages",
			status: "empty",
		});
		expect(first[0]?.evidenceId).toMatch(/^evidence:web:[a-f0-9]{16}$/);
		expect(observed).toHaveLength(4);
		expect(observed[0]).toMatchObject({
			kind: "breakdown",
			rowCount: 1,
			signalKey: "website:traffic",
			source: "web",
		});
		expect(observed[0]?.evidenceId).toMatch(/^evidence:web:[a-f0-9]{16}$/);
		expect(observed.slice(0, 2).map((item) => item.evidenceId)).toEqual(
			observed.slice(2, 4).map((item) => item.evidenceId)
		);
		expect(second).toEqual(first);

		webQueryMode = "changed";
		await reader(request, appContext);
		expect(observed[4]?.evidenceId).toBe(observed[0]?.evidenceId);
	});

	test("reports query failures instead of treating them as empty data", async () => {
		webQueryMode = "failed";
		const reader = createReader();

		const result = await reader(
			{
				name: "web_metrics",
				input: {
					period: "current",
					queries: [{ type: "top_referrers" }],
				},
			},
			appContext
		);

		expect(result[0]).toMatchObject({
			error: "warehouse unavailable",
			period: "current",
			status: "failed",
		});
	});

	test("deduplicates repeated query types before reading analytics", async () => {
		const reader = createReader();

		const result = await reader(
			{
				name: "web_metrics",
				input: {
					period: "current",
					queries: [{ type: "country" }, { type: "country" }],
				},
			},
			appContext
		);

		expect(queryCalls).toBe(1);
		expect(result).toHaveLength(1);
	});

	test("forwards cancellation to ClickHouse evidence reads", async () => {
		const controller = new AbortController();
		const reader = createReader();

		await reader(
			{
				input: {
					period: "current",
					queries: [{ type: "top_referrers" }],
				},
				name: "web_metrics",
			},
			appContext,
			controller.signal
		);

		expect(queryAbortSignals).toEqual([controller.signal]);
	});

	test("does not treat empty result collections as populated evidence", () => {
		expect(countEvidenceRows({ count: 0, goals: [] })).toBe(0);
		expect(countEvidenceRows({ note: "No matches", results: [] })).toBe(0);
		expect(countEvidenceRows({ count: 1, goals: [{ id: "goal-1" }] })).toBe(1);
		expect(countEvidenceRows({ total: 12 })).toBe(1);
	});

	test("does not report an unconfigured uptime aggregate as an outage", async () => {
		webQueryMode = "uptime-empty";
		const reader = createReader();
		const result = await reader(
			{
				name: "ops_context",
				input: {
					period: "current",
					queries: [{ type: "uptime_summary" }],
				},
			},
			appContext
		);

		expect(result[0]).toMatchObject({
			queryType: "uptime_summary",
			status: "empty",
			summary: "uptime_summary returned no rows.",
		});
	});

	test("renders an exact error bundle as concise claims instead of raw JSON", async () => {
		webQueryMode = "error-bundle";
		const errorSignal: InvestigationSignal = {
			...signal,
			signalKey: "error_count",
			entity: { type: "error", id: "error_count", label: "Errors" },
			metric: {
				...signal.metric,
				key: "error_count",
				label: "Errors",
			},
		};
		const observed: InvestigationEvidence[] = [];
		const reader = createReader((item) => observed.push(item), errorSignal);
		const result = await reader(
			{
				name: "ops_context",
				input: {
					period: "current",
					queries: [
						{ type: "errors_summary" },
						{ type: "errors_by_page" },
						{ type: "error_fingerprints" },
					],
				},
			},
			appContext
		);

		const summaries = result.map((item) =>
			item.status === "failed" ? item.error : item.summary
		);
		expect(summaries).toEqual([
			"36 errors affected 24 users across 22 sessions (4.2% session error rate).",
			"Most affected pages: /checkout — 30 errors, 21 users.",
			"“TypeError: example failure” — 30 errors, 21 users, 20 sessions; seen at app.js:42.",
		]);
		expect(summaries.every((summary) => !summary.includes("{"))).toBe(true);
		expect(observed.at(-1)?.entity).toMatchObject({
			type: "error",
			label: "TypeError: example failure",
		});
	});

	test("ignores nullish text placeholders in error evidence", async () => {
		webQueryMode = "error-nullish-location";
		const errorSignal: InvestigationSignal = {
			...signal,
			signalKey: "error_count",
			entity: { type: "error", id: "error_count", label: "Errors" },
			metric: {
				...signal.metric,
				key: "error_count",
				label: "Errors",
			},
		};
		const reader = createReader(undefined, errorSignal);
		const result = await reader(
			{
				name: "ops_context",
				input: {
					period: "current",
					queries: [{ type: "error_fingerprints" }],
				},
			},
			appContext
		);

		expect(result[0]).toMatchObject({
			status: "ok",
			summary:
				"“TypeError: placeholder location” — 8 errors, 5 users, 5 sessions; seen at /checkout.",
			entity: {
				type: "error",
				label: "TypeError: placeholder location",
			},
		});
		expect(JSON.stringify(result[0])).not.toContain("undefined:31");
		expect(JSON.stringify(result[0])).not.toContain('"null"');
	});

	test("keeps only unhealthy, sufficiently sampled pages for a vital action", async () => {
		webQueryMode = "vital-pages";
		const vitalSignal: InvestigationSignal = {
			...signal,
			signalKey: "inp",
			entity: { type: "vital", id: "inp", label: "Interaction speed" },
			metric: {
				key: "inp",
				label: "Interaction speed",
				current: 320,
				previous: 180,
				format: "duration_ms",
			},
		};
		const observed: InvestigationEvidence[] = [];
		const reader = createReader((item) => observed.push(item), vitalSignal);
		const result = await reader(
			{
				name: "web_metrics",
				input: {
					period: "current",
					queries: [{ type: "web_vitals_by_page" }],
				},
			},
			appContext
		);

		expect(result[0]).toMatchObject({
			queryType: "web_vitals_by_page:qualified",
			status: "ok",
			summary:
				"Slowest supported segments: /checkout — p75 INP 320 ms across 30 visitors (60 measurements); /pricing — p75 INP 280 ms across 25 visitors (50 measurements).",
		});
		expect(result[0]?.entity?.label).toBe("/checkout");
		expect(JSON.stringify(result[0])).not.toContain("/outlier");
		expect(JSON.stringify(result[0])).not.toContain("/healthy");
		expect(JSON.stringify(result[0])).not.toContain("/home");
		expect(observed[0]?.entity).toMatchObject({
			type: "page",
			label: "/checkout",
		});
	});

	test("does not aggregate sparse z-score baselines as continuous periods", async () => {
		const zscoreSignal: InvestigationSignal = {
			...signal,
			detection: {
				method: "zscore",
				reason: "Traffic differs from comparable weekdays.",
				baselineDates: [
					"2026-06-24",
					"2026-06-25",
					"2026-06-26",
					"2026-06-27",
					"2026-06-28",
					"2026-06-30",
				],
			},
		};
		const reader = createReader(undefined, zscoreSignal);

		await expect(
			reader(
				{
					name: "web_metrics",
					input: {
						period: "both",
						queries: [{ type: "top_referrers" }],
					},
				},
				appContext
			)
		).rejects.toThrow();
		expect(queryCalls).toBe(0);
	});

	test("rejects fields outside the bounded reader contract", async () => {
		const reader = createReader();
		const forgedSignalRequest = {
			name: "web_metrics" as const,
			input: {
				period: "current" as const,
				queries: [{ type: "top_referrers" as const }],
				signalKey: "forged-signal",
			},
		};
		const tooManyQueriesRequest = {
			name: "web_metrics" as const,
			input: {
				period: "current" as const,
				queries: [
					{ type: "top_referrers" as const },
					{ type: "top_pages" as const },
					{ type: "country" as const },
					{ type: "device_types" as const },
				],
			},
		};
		const unrestrictedQueryRequest = {
			name: "web_metrics" as const,
			input: {
				period: "current" as const,
				queries: [
					{
						type: "top_pages" as const,
						limit: 50,
						filters: [{ field: "path", value: "/forged" }],
					},
				],
			},
		};

		await expect(reader(forgedSignalRequest, appContext)).rejects.toThrow();
		await expect(reader(tooManyQueriesRequest, appContext)).rejects.toThrow();
		await expect(
			reader(unrestrictedQueryRequest, appContext)
		).rejects.toThrow();
	});

	test("binds product reads to the backend signal target", async () => {
		const goalSignal: InvestigationSignal = {
			...signal,
			signalKey: "goal:checkout",
			entity: { type: "goal", id: "goal_backend", label: "Checkout" },
			metric: {
				...signal.metric,
				key: "goal:checkout",
				label: "Checkout conversion",
			},
		};
		const observed: InvestigationEvidence[] = [];
		const reader = createReader(
			(evidence) => observed.push(evidence),
			goalSignal
		);
		const forgedTargetRequest = {
			name: "product_metrics" as const,
			input: {
				period: "current" as const,
				target: { id: "goal_forged", type: "goal" },
			},
		};

		await expect(reader(forgedTargetRequest, appContext)).rejects.toThrow();
		const result = await reader(
			{ name: "product_metrics", input: { period: "current" } },
			appContext
		);

		expect(productCalls).toEqual([
			{
				range: { from: "2026-07-01", to: "2026-07-07" },
				target: { id: "goal_backend", type: "goal" },
			},
		]);
		expect(
			result.map(({ period, queryType, range }) => ({
				period,
				queryType,
				range,
			}))
		).toEqual([
			{
				period: "current",
				queryType: "goals_summary",
				range: { from: "2026-07-01", to: "2026-07-07" },
			},
		]);
		expect(observed).toHaveLength(1);
		expect(
			observed.every((item) => item.signalKey === goalSignal.signalKey)
		).toBe(true);
		expect(result.every((item) => item.evidenceId.length > 0)).toBe(true);
	});

	test("attaches only an exact backend-owned tracking repair", async () => {
		const expectation = {
			definitionUpdatedAt: "2026-06-01T00:00:00.000Z",
			eventName: "sign_up",
			instruction: 'Restore the "sign_up" event when Signup completes.',
			kind: "tracking" as const,
			previousCompletions: 20,
			currentEntrants: 100,
			currentCompletions: 0 as const,
		};
		const goalSignal: InvestigationSignal = {
			...signal,
			signalKey: "goal:signup",
			kind: "missing_expected_data",
			entity: { type: "goal", id: "goal_backend", label: "Signup" },
			metric: { ...signal.metric, key: "goal:signup" },
			expectation,
		};
		const observed: InvestigationEvidence[] = [];
		productQueryMode = "missing-goal";
		const reader = createReader((item) => observed.push(item), goalSignal);

		await reader(
			{ name: "product_metrics", input: { period: "current" } },
			appContext
		);

		expect(observed[0]?.remediation).toEqual(expectation);
		expect(observed[0]?.summary).toContain(
			'The active definition expects the "sign_up" event.'
		);

		productQueryMode = "stale-goal";
		const stale: InvestigationEvidence[] = [];
		const staleReader = createReader((item) => stale.push(item), goalSignal);
		await staleReader(
			{ name: "product_metrics", input: { period: "current" } },
			appContext
		);
		expect(stale[0]?.remediation).toBeUndefined();
	});

	test("rejects product definitions unrelated to the signal entity", async () => {
		const reader = createReader();

		await expect(
			reader(
				{ name: "product_metrics", input: { period: "current" } },
				appContext
			)
		).rejects.toThrow("Product evidence is not scoped to this website signal");
	});

	test("does not expose oversized raw query data", async () => {
		webQueryMode = "large";
		const reader = createReader();

		const result = await reader(
			{
				name: "web_metrics",
				input: {
					period: "current",
					queries: [{ type: "top_referrers" }],
				},
			},
			appContext
		);
		const evidence = result[0];

		expect(evidence).toMatchObject({
			status: "ok",
		});
		if (!evidence || evidence.status === "failed") {
			throw new Error("Expected successful evidence");
		}
		expect(evidence.summary.length).toBeLessThanOrEqual(500);
		expect(evidence).not.toHaveProperty("data");
	});

	test("classifies revenue evidence as measured business impact", async () => {
		const reader = createReader(undefined, revenueSignal);
		const result = await reader(
			{
				name: "web_metrics",
				input: {
					period: "both",
					queries: [{ type: "revenue_overview" }],
				},
			},
			appContext
		);

		expect(result[0]).toMatchObject({
			kind: "impact",
			source: "business",
			status: "ok",
		});
	});

	test("re-reads revenue once when query totals conflict with the detector", async () => {
		webQueryMode = "revenue-reconcile";
		const observed: InvestigationEvidence[] = [];
		const reader = createReader((item) => observed.push(item), revenueSignal);

		await reader(
			{
				name: "web_metrics",
				input: {
					period: "both",
					queries: [{ type: "revenue_overview" }],
				},
			},
			appContext
		);

		expect(queryCalls).toBe(4);
		expect(observed.map((item) => item.metrics?.[0]?.current)).toEqual([
			40, 80,
		]);
	});

	test("classifies UTM evidence as business context", async () => {
		const observed: InvestigationEvidence[] = [];
		const reader = createReader((item) => observed.push(item));
		await reader(
			{
				name: "web_metrics",
				input: {
					period: "current",
					queries: [{ type: "utm_campaigns" }],
				},
			},
			appContext
		);

		expect(observed[0]).toMatchObject({
			queryType: "utm_campaigns",
			source: "business",
			status: "ok",
		});
	});

	test("binds campaign evidence and filters to the backend target", async () => {
		const campaignSignal: InvestigationSignal = {
			...signal,
			signalKey: "campaign:acquisition",
			entity: {
				type: "campaign",
				id: "campaign_backend",
				label: "Acquisition",
			},
		};
		const observed: InvestigationEvidence[] = [];
		const reader = createReader((item) => observed.push(item), campaignSignal);

		await reader(
			{
				name: "web_metrics",
				input: {
					period: "current",
					queries: [{ type: "utm_campaigns" }],
				},
			},
			appContext
		);

		expect(queryRequests[0]?.filters).toEqual([
			{
				field: "utm_campaign",
				op: "eq",
				value: "campaign_backend",
			},
		]);
		expect(observed[0]).toMatchObject({
			entity: campaignSignal.entity,
			queryType: "utm_campaigns",
			source: "business",
		});
	});
});
