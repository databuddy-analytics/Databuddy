import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import type { StepResult, ToolSet } from "ai";
import { MockLanguageModelV3, mockValues } from "ai/test";
import { getDataTool } from "../../../packages/ai/src/ai/tools/get-data";
import { runInsightAgent } from "./agent";

const appContext = {
	chatId: "retention-publication-test",
	currentDateTime: "2026-09-09T00:00:00.000Z",
	defaultWebsiteId: "site-1",
	mutationMode: "dry-run" as const,
	organizationId: "org-1",
	timezone: "UTC",
	userId: "system",
	websiteDomain: "example.com",
	websiteId: "site-1",
	websiteName: "Example reports",
};

// A real event subject can inspect retention during a reply without a detector
// retention snapshot. Do not manufacture a retentionMeasurement below its floor.
const signal: InvestigationSignal = {
	signalKey: "event:report_shared",
	entity: { type: "event", id: "report_shared", label: "Shared reports" },
	metric: {
		label: "Shared reports",
		current: 100,
		previous: 200,
		format: "number",
	},
	changePercent: -50,
	severity: "warning",
	sentiment: "negative",
	period: {
		previous: { from: "2026-08-18", to: "2026-08-24" },
		current: { from: "2026-08-25", to: "2026-08-31" },
	},
};

function reading(
	period: "previous" | "current",
	eligible = 50,
	incomplete = 0
) {
	const { from, to } = signal.period[period];
	const retained = Math.floor(eligible * (period === "previous" ? 0.8 : 0.2));
	const row = {
		cohort_from: from,
		cohort_to: to,
		observation_end: "2026-09-08",
		cohort_start: `${from}T00:00:00.000Z`,
		cohort_end: new Date(Date.parse(to) + 86_400_000).toISOString(),
		observed_before: appContext.currentDateTime,
		timezone: "UTC",
		horizon_days: 7,
		identity_basis: "direct_profile_id",
		activation_basis: "first_in_cohort_window",
		activated_profiles: eligible + incomplete,
		eligible_profiles: eligible,
		retained_profiles: retained,
		not_retained_profiles: eligible - retained,
		incomplete_profiles: incomplete,
		activation_events: (eligible + incomplete) * 2,
		identified_activation_events: eligible + incomplete,
		unidentified_activation_events: eligible + incomplete,
	};
	return {
		type: "identified_profile_retention",
		websiteId: "site-1",
		from,
		to,
		timezone: "UTC",
		filters: [
			{ field: "activation_event", op: "eq" as const, value: "report_shared" },
			{ field: "return_event", op: "eq" as const, value: "report_opened" },
			{ field: "horizon_days", op: "eq" as const, value: 7 },
			{ field: "observation_end", op: "eq" as const, value: "2026-09-08" },
			{ field: "namespace", op: "eq" as const, value: "product" },
		],
		data: [
			{ ...row, row_type: "overall", cohort_date: null },
			{ ...row, row_type: "cohort", cohort_date: from },
		] as Record<string, unknown>[],
		rowCount: 2,
		returnedRows: 2,
		truncated: false,
	};
}

const previousKey = "identified_profile_retention";
const currentKey = "identified_profile_retention@site-1";
const source = (resultKey: string) => ({
	source: "tool" as const,
	name: "get_data",
	toolCallId: "get_data-1",
	resultKey,
});
const sources = [source(previousKey), source(currentKey)];

function finish(claim: unknown = { retention: true }, publish = true) {
	return {
		title: "Report reuse fell",
		summary: "Fewer identified profiles returned after sharing a report.",
		rootCause: null,
		evidence: [{ sources, claim }],
		findingKind: "product_outcome",
		publish,
		publicationBasis: publish ? "measured_impact" : null,
		next: { type: "resolve", reason: "The cause remains unknown." },
	};
}

const privateFinish = {
	...finish("The cohort comparison remains unverified.", false),
	title: "Report reuse is unverified",
	summary: "The returned cohorts do not establish a complete comparison.",
};

function response(toolName: string, value: unknown, toolCallId: string) {
	return {
		content: [
			{
				type: "tool-call" as const,
				toolName,
				toolCallId,
				input: JSON.stringify(value),
			},
		],
		finishReason: { unified: "tool-calls" as const, raw: undefined },
		usage: {
			inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
			outputTokens: { total: 1, text: 1, reasoning: 0 },
		},
		warnings: [],
	};
}

async function investigate(
	readings = [reading("previous"), reading("current")],
	proposal: unknown = finish(),
	correction?: unknown,
	options: {
		earlierReadings?: ReturnType<typeof reading>[];
		limit?: number;
	} = {}
) {
	const { earlierReadings, limit = 100 } = options;
	const queries = readings.map(
		({ type, websiteId, from, to, timezone, filters }) => ({
			type,
			websiteId,
			from,
			to,
			timezone,
			filters,
			limit,
		})
	);
	const model = new MockLanguageModelV3({
		doGenerate: mockValues(
			...(earlierReadings
				? [response("get_data", { queries }, "get_data-earlier")]
				: []),
			response("get_data", { queries }, "get_data-1"),
			response("finish_investigation", proposal, "finish-1"),
			response("finish_investigation", correction ?? proposal, "finish-2"),
			response("finish_investigation", correction ?? proposal, "finish-3")
		),
	});
	const steps: StepResult<ToolSet>[] = [];
	const calls: unknown[] = [];
	const result = await runInsightAgent(
		{
			appContext,
			signal,
			evidence: [
				"The team defines report sharing as initial value and reopening as reuse.",
			],
			history: [],
			otherOpenWork: [],
			githubRepository: null,
			request: {
				body: "Check whether profiles return after sharing reports.",
				createdAt: appContext.currentDateTime,
			},
		},
		{
			model,
			onStepFinish: (step) => {
				steps.push(step);
			},
			tools: {
				get_data: {
					...getDataTool,
					execute: async (input, options) => {
						calls.push(input);
						const returned =
							options.toolCallId === "get_data-earlier"
								? (earlierReadings ?? readings)
								: readings;
						return {
							results: Object.fromEntries(
								returned.map((value, index) => [
									index === 0 ? previousKey : currentKey,
									value,
								])
							),
						};
					},
				},
			},
		}
	);
	// Native argument validation must reach the synthetic executor exactly once.
	expect(calls).toEqual(
		earlierReadings ? [{ queries }, { queries }] : [{ queries }]
	);
	expect(result.toolCallCount).toBe(earlierReadings ? 2 : 1);
	return { ...result, steps, model };
}

async function expectPrivate(
	readings: ReturnType<typeof reading>[],
	proposal: unknown = finish()
) {
	const result = await investigate(readings, proposal, privateFinish);
	expect(result.outcome.publish).toBe(false);
	expect(result.outcome.rootCause).toBeNull();
	expect(result.outcome.next.type).toBe("resolve");
	expect(result.model.doGenerateCalls).toHaveLength(3);
	expect(
		result.steps[1].content.some(
			(part) =>
				part.type === "tool-error" && part.toolName === "finish_investigation"
		)
	).toBe(true);
	return result;
}

describe("tool-supplied retention publication without a saved snapshot", () => {
	it.each([
		{ period: "previous" as const, eligible: 20 },
		{ period: "current" as const, eligible: 20 },
		{ period: "previous" as const, eligible: 49 },
		{ period: "current" as const, eligible: 49 },
	])("keeps $period cohort with $eligible eligible profiles private", async ({
		period,
		eligible,
	}) => {
		await expectPrivate([
			reading("previous", period === "previous" ? eligible : 200),
			reading("current", period === "current" ? eligible : 200),
		]);
	});

	it("publishes exactly 50 eligible profiles per complete cohort using rendered evidence", async () => {
		const result = await investigate();
		expect(result.outcome.publish).toBe(true);
		expect(result.outcome.rootCause).toBeNull();
		expect(result.model.doGenerateCalls).toHaveLength(2);
		const evidence = result.outcome.evidence.join(" ");
		expect(evidence).toContain("40/50");
		expect(evidence).toContain("10/50");
		expect(evidence).toContain("2026-08-18");
		expect(evidence).toContain("2026-08-31");
		expect(evidence).toMatch(/7|seven/);
		expect(evidence).toMatch(/identified profiles/i);
	});

	it.each([
		"previous",
		"current",
	] as const)("keeps incomplete %s follow-up private despite 50 eligible profiles", async (period) => {
		await expectPrivate([
			reading("previous", 50, period === "previous" ? 1 : 0),
			reading("current", 50, period === "current" ? 1 : 0),
		]);
	});

	it("rejects public prose citing valid native retention but permits a private explanation", async () => {
		await expectPrivate(
			[reading("previous"), reading("current")],
			finish(
				"Eligible identified profiles returning within seven days fell from 40/50 to 10/50."
			)
		);
	});

	it("rejects a public native-prose comparison of 16/20 to 4/20 eligible profiles", async () => {
		await expectPrivate(
			[reading("previous", 20), reading("current", 20)],
			finish(
				"Eligible identified profiles returning within seven days fell from 16/20 to 4/20."
			)
		);
	});

	it.each([
		"overall-only",
		"truncated-daily",
	])("publishes a complete overall aggregate with %s rows", async (mode) => {
		const readings = [reading("previous"), reading("current")];
		for (const [index, value] of readings.entries()) {
			if (mode === "overall-only") {
				// The SQL LIMIT applies after the overall aggregate is computed.
				value.data = value.data.slice(0, 1);
				value.rowCount = 1;
				value.returnedRows = 1;
				continue;
			}
			// Native get_data caps a 28-day table at 20 rows, keeping overall first.
			value.from = index === 0 ? "2026-07-07" : "2026-08-04";
			value.to = index === 0 ? "2026-08-03" : "2026-08-31";
			const overall = {
				...value.data[0],
				cohort_from: value.from,
				cohort_to: value.to,
				cohort_start: `${value.from}T00:00:00.000Z`,
				cohort_end: new Date(Date.parse(value.to) + 86_400_000).toISOString(),
			};
			let remainingRetained = index === 0 ? 40 : 10;
			const daily = Array.from({ length: 28 }, (_, day) => {
				const eligible = day < 22 ? 2 : 1;
				const retained = Math.min(eligible, remainingRetained);
				remainingRetained -= retained;
				return {
					...overall,
					row_type: "cohort",
					cohort_date: new Date(Date.parse(value.from) + day * 86_400_000)
						.toISOString()
						.slice(0, 10),
					activated_profiles: eligible,
					eligible_profiles: eligible,
					retained_profiles: retained,
					not_retained_profiles: eligible - retained,
					activation_events: eligible * 2,
					identified_activation_events: eligible,
					unidentified_activation_events: eligible,
				};
			});
			value.data = [overall, ...daily].slice(0, 20);
			value.returnedRows = 20;
			value.rowCount = 29;
			value.truncated = true;
		}
		const result = await investigate(readings, finish(), undefined, {
			limit: mode === "overall-only" ? 1 : 100,
		});
		expect(result.outcome.publish).toBe(true);
		expect(result.outcome.evidence.join(" ")).toContain("40/50");
	});

	it.each([
		"namespace",
		"return-event",
		"cohort-dates",
		"overlapping-windows",
		"missing-overall",
		"cutoff",
		"identity-basis",
		"inconsistent-counts",
	] as const)("rejects mismatched or invalid native metadata: %s", async (mode) => {
		const previous = reading("previous");
		const current = reading("current");
		if (mode === "namespace" || mode === "return-event") {
			const field = mode === "namespace" ? "namespace" : "return_event";
			current.filters = current.filters.map((filter) =>
				filter.field === field ? { ...filter, value: "different" } : filter
			);
		} else if (mode === "cohort-dates") {
			current.data[0].cohort_to = "2026-08-30";
		} else if (mode === "overlapping-windows") {
			current.from = previous.from;
			current.to = previous.to;
			current.data = current.data.map((row) => ({
				...row,
				cohort_from: previous.from,
				cohort_to: previous.to,
				cohort_start: previous.data[0].cohort_start,
				cohort_end: previous.data[0].cohort_end,
			}));
		} else if (mode === "missing-overall") {
			current.data = current.data.slice(1);
			current.rowCount = current.returnedRows = 1;
		} else if (mode === "cutoff") {
			current.data[0].observed_before = "2026-09-08T00:00:00.000Z";
		} else if (mode === "identity-basis") {
			current.data[0].identity_basis = "anonymous_visitor_id";
		} else {
			current.data[0].not_retained_profiles = 0;
		}
		await expectPrivate([previous, current]);
	});

	it.each([
		"one-reference",
		"duplicate-reference",
		"provided-reference",
	])("requires two exact native result references: %s", async (mode) => {
		const proposal = finish();
		if (mode === "one-reference") {
			proposal.evidence[0].sources = [source(previousKey)];
		}
		if (mode === "duplicate-reference") {
			proposal.evidence[0].sources = [source(previousKey), source(previousKey)];
		}
		if (mode === "provided-reference") {
			const malformed = {
				...proposal,
				evidence: [
					{
						claim: { retention: true },
						sources: [{ source: "provided", index: 0 }],
					},
				],
			};
			// The model supplies untrusted JSON; this reference is valid generally,
			// but cannot replace a native measured retention result.
			const result = await investigate(
				[reading("previous"), reading("current")],
				malformed,
				privateFinish
			);
			expect(result.outcome.publish).toBe(false);
			expect(result.model.doGenerateCalls).toHaveLength(3);
			return;
		}
		await expectPrivate([reading("previous"), reading("current")], proposal);
	});

	it("preserves an independent measured finding after an uncited undersized retention read", async () => {
		const unrelated = reading("previous", 20);
		unrelated.filters = unrelated.filters.map((filter) =>
			filter.field === "activation_event"
				? { ...filter, value: "tutorial_started" }
				: filter
		);
		const proposal = {
			...finish(),
			title: "Report sharing fell",
			summary: "Fewer reports were shared; the cause remains unknown.",
			evidence: [
				{
					sources: [{ source: "signal" }],
					claim: "Shared report events fell from 200 to 100.",
				},
			],
		};
		const result = await investigate([unrelated], proposal);
		expect(result.outcome.publish).toBe(true);
		expect(result.outcome.evidence).toEqual([
			"Shared report events fell from 200 to 100.",
		]);
		expect(result.model.doGenerateCalls).toHaveLength(2);
	});

	it.each([
		"undersized",
		"different-return-count",
	])("keeps an earlier exact-query %s conflict binding when only later matching reads are cited", async (mode) => {
		const earlier = [
			reading("previous", mode === "undersized" ? 20 : 50),
			reading("current"),
		];
		if (mode === "different-return-count") {
			for (const row of earlier[0].data) {
				row.retained_profiles = 30;
				row.not_retained_profiles = 20;
			}
		}
		const result = await investigate(
			[reading("previous"), reading("current")],
			finish(),
			privateFinish,
			{ earlierReadings: earlier }
		);
		expect(result.outcome.publish).toBe(false);
		expect(result.outcome.rootCause).toBeNull();
		expect(result.model.doGenerateCalls).toHaveLength(4);
		const rejected = result.steps[2].content.find(
			(part) =>
				part.type === "tool-error" && part.toolName === "finish_investigation"
		);
		expect(rejected).toBeDefined();
		if (rejected?.type === "tool-error") {
			expect(String(rejected.error)).toMatch(/conflict/i);
		}
	});
});
