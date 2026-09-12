import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import {
	clarificationMetrics,
	createEvidenceSnapshot,
	snapshotJson,
} from "./evidence-snapshot";

const signal: InvestigationSignal = {
	signalKey: "funnel:signup",
	entity: { type: "funnel", id: "signup", label: "Signup" },
	metric: {
		label: "Completed visitors",
		current: 20,
		previous: 100,
		format: "number",
	},
	changePercent: -80,
	severity: "warning",
	sentiment: "negative",
	period: {
		current: { from: "2026-09-05", to: "2026-09-11" },
		previous: { from: "2026-08-29", to: "2026-09-04" },
	},
};
const input = {
	organizationId: "example-org",
	websiteId: "example-site",
	capturedAt: "2026-09-12T00:00:00.000Z",
	signal,
	evidence: ["Earlier detection may be stale."],
	descriptions: {
		get_funnel_analytics:
			"Counts entrants; stored step conditions are not evaluated.",
	},
};

describe("saved investigation evidence", () => {
	it("computes cross-period percentage point changes from counts before rounding", () => {
		const read = (
			toolCallId: string,
			startDate: string,
			endDate: string,
			completed: number
		) => ({
			toolName: "get_funnel_analytics_by_referrer",
			toolCallId,
			input: {
				websiteId: "example-site",
				funnelId: "signup",
				startDate,
				endDate,
				cohort: null,
			},
			output: {
				referrer_analytics: [
					{
						referrer: "google.com",
						total_users: 600,
						completed_users: completed,
					},
				],
			},
		});
		const saved = createEvidenceSnapshot({
			...input,
			reads: [
				read("current", "2026-09-05", "2026-09-11", 20),
				read("previous", "2026-08-29", "2026-09-04", 100),
			],
		});
		const [current] = clarificationMetrics(saved);
		expect(current?.changeFromPrevious?.changePercentagePoints).toBeCloseTo(
			-40 / 3,
			10
		);
		expect(current?.changeFromPrevious?.previousSource).toBe("previous");
		const changedScope = structuredClone(saved);
		changedScope.reads[1]!.input = {
			websiteId: "example-site",
			funnelId: "another-funnel",
			startDate: "2026-08-29",
			endDate: "2026-09-04",
			cohort: null,
		};
		expect(
			clarificationMetrics(changedScope)[0]?.changeFromPrevious
		).toBeNull();
	});
	it("labels derived counts with the actual measured window, separately from the requested window", () => {
		const measurement = {
			websiteId: "example-site",
			definitionId: "goal",
			startDate: "2026-09-08",
			endDate: "2026-09-11",
			definition: { type: "PAGE_VIEW", target: "/workspace", filters: [] },
		};
		const saved = createEvidenceSnapshot({
			...input,
			reads: [
				{
					toolName: "get_goal_analytics",
					toolCallId: "clipped",
					input: { startDate: "2026-09-05", endDate: "2026-09-11" },
					output: {
						measurement,
						total_users_entered: 200,
						total_users_completed: 164,
					},
				},
			],
		});
		expect(clarificationMetrics(saved)[0]).toMatchObject({
			scope: measurement,
			requestedScope: { startDate: "2026-09-05" },
			notCompleted: 36,
		});
	});
	it("retains actual successful inputs, outputs, scope and descriptions; failed mixed results are limitations", () => {
		const read = {
			toolName: "get_data",
			toolCallId: "query-1",
			input: {
				websiteId: "example-site",
				from: "2026-09-05",
				filters: [{ field: "namespace", op: "eq", value: "production" }],
			},
			output: {
				results: {
					measured: {
						type: "custom_events",
						data: [{ count: 0 }],
						timezone: "UTC",
					},
					unavailable: {
						success: false,
						error: "No access",
						data: [{ count: 0 }],
					},
				},
			},
		};
		const saved = createEvidenceSnapshot({ ...input, reads: [read] });
		expect(saved.reads).toHaveLength(1);
		expect(saved.reads[0]).toMatchObject({
			toolCallId: "query-1",
			resultKey: "measured",
			input: read.input,
			output: read.output.results.measured,
		});
		expect(saved.limitations[0]).toContain("unavailable");
		expect(saved.limitations[0]).toContain("not zero");
		expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
	});
	it("does not save credentials, private reasoning or header fields", () => {
		const saved = snapshotJson({
			headers: { authorization: "secret" },
			api_key: "private",
			reasoning: "private thought",
			output: "Bearer abcdefghijklmnopqrstuvwxyz",
			measured: { retained: 20, reasoning_tokens: 3 },
		});
		expect(JSON.stringify(saved)).not.toContain("private thought");
		expect(JSON.stringify(saved)).not.toContain("abcdefghijklmnopqrstuvwxyz");
		expect(saved).toMatchObject({
			headers: "[redacted]",
			api_key: "[redacted]",
			measured: { retained: 20 },
		});
	});
	it("bounds supplied context, results and omission notices without truncating data into a fake population", () => {
		const saved = createEvidenceSnapshot({
			...input,
			evidence: ["x".repeat(300_000)],
			reads: Array.from({ length: 200 }, (_, i) => ({
				toolName: "read",
				toolCallId: String(i),
				input: {},
				output: { data: "y".repeat(300_000) },
			})),
		});
		expect(Buffer.byteLength(JSON.stringify(saved))).toBeLessThanOrEqual(
			256_000
		);
		expect(saved.providedEvidence).toEqual([]);
		expect(saved.reads).toEqual([]);
		expect(saved.limitations.length).toBeLessThanOrEqual(16);
		expect(saved.limitations.join(" ")).toContain("omitted");
	});
	it("derives typed per-referrer counts and rates without treating ranked rows as totals", () => {
		const saved = createEvidenceSnapshot({
			...input,
			reads: [
				{
					toolName: "get_funnel_analytics_by_referrer",
					toolCallId: "read-1",
					input: {
						funnelId: "signup",
						startDate: "2026-09-05",
						endDate: "2026-09-11",
						limit: 10,
					},
					output: {
						referrer_analytics: [
							{
								referrer: "google.com",
								total_users: 600,
								completed_users: 20,
								conversion_rate: 3.3,
							},
						],
					},
				},
			],
		});
		const [metrics] = clarificationMetrics(saved);
		expect(metrics).toMatchObject({
			entrants: 600,
			completed: 20,
			notCompleted: 580,
			conversionPercent: 100 / 30,
			scope: { referrer: "google.com", limit: 10 },
		});
		expect(metrics.derivation).toContain("ranked/limited");
	});
	it("keeps zero denominator unknown and does not derive from arbitrary numeric prose or malformed counts", () => {
		const saved = createEvidenceSnapshot({
			...input,
			reads: [
				{
					toolName: "scrape_page",
					toolCallId: "page",
					input: {},
					output: { text: "100 users 20 converted" },
				},
				{
					toolName: "get_goal_analytics",
					toolCallId: "empty",
					input: {},
					output: { total_users_entered: 0, total_users_completed: 0 },
				},
				{
					toolName: "get_funnel_analytics",
					toolCallId: "invalid",
					input: {},
					output: { total_users_entered: 2, total_users_completed: 5 },
				},
			],
		});
		expect(clarificationMetrics(saved)).toEqual([
			expect.objectContaining({
				population: "eligible website visitors",
				notCompleted: 0,
				conversionPercent: null,
			}),
		]);
	});
});
