import "@databuddy/test/env";
import { describe, expect, it, mock } from "bun:test";
import type { executeQuery, QueryRequest } from "@databuddy/ai/query";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import type { BusinessMeasurementPlan } from "@databuddy/shared/organization-business-context";
import { type StepResult, tool, type ToolSet } from "ai";
import { MockLanguageModelV3, mockValues } from "ai/test";
import dayjs from "dayjs";
import { z } from "zod";
import { getDataTool } from "../../../packages/ai/src/ai/tools/get-data";
import { renderRetentionDetail, runInsightAgent } from "./agent";
import { prepareInvestigation } from "./investigation";
import {
	detectRetentionSignals,
	type retentionRowSchema,
} from "./measurement-plan";

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

const plan = {
	websiteId: "retention-depth-fixture",
	domain: "example.com",
	name: "Shared reports",
	activationEvent: "report_shared",
	returnEvent: "report_opened",
	namespace: "reports",
	horizonDays: 7,
} satisfies BusinessMeasurementPlan;

type NativeRow = z.infer<typeof retentionRowSchema>;
type FixtureKind = "sufficient" | "sparse" | "uniform";
type Prepared = ReturnType<typeof prepareInvestigation>;

const aggregate =
	"7-day return among identified profiles: 224/280 (80%) → 152/280 (54.3%). Cohorts 2026-08-18–2026-08-24 → 2026-08-25–2026-08-31; fully observed through 2026-09-08 UTC. Activation events with identity: 280/350 (80%) → 280/350 (80%); anonymous excluded.";
const detail =
	"Activation dates 2026-08-22–2026-08-24 → 2026-08-29–2026-08-31: 96/120 (80%) → 24/120 (20%); remaining dates: 128/160 (80%) → 128/160 (80%).";
const selectedDetail = {
	claim: { retentionDetail: true },
	sources: [{ source: "signal" }],
};

async function prepareFixture(kind: FixtureKind = "sufficient") {
	const nativeReads: { request: QueryRequest; data: NativeRow[] }[] = [];
	const query: typeof executeQuery = async (request, domain, timezone) => {
		expect(domain).toBe(plan.domain);
		expect(timezone).toBe("UTC");
		expect(request).toEqual({
			projectId: plan.websiteId,
			type: "identified_profile_retention",
			...(request.from === "2026-08-18"
				? { from: "2026-08-18", to: "2026-08-24" }
				: { from: "2026-08-25", to: "2026-08-31" }),
			timezone: "UTC",
			limit: 100,
			filters: [
				{ field: "activation_event", op: "eq", value: plan.activationEvent },
				{ field: "return_event", op: "eq", value: plan.returnEvent },
				{ field: "horizon_days", op: "eq", value: 7 },
				{ field: "observation_end", op: "eq", value: "2026-09-08" },
				{ field: "namespace", op: "eq", value: plan.namespace },
			],
		});
		const eligible = kind === "sparse" ? 10 : 40;
		const events = kind === "sparse" ? 20 : 50;
		const daily: NativeRow[] = Array.from({ length: 7 }, (_, index) => {
			const retained =
				request.from === "2026-08-18"
					? eligible * 0.8
					: kind === "uniform"
						? 16
						: eligible * (index < 4 ? 0.8 : 0.2);
			return {
				row_type: "cohort",
				cohort_date: dayjs(request.from).add(index, "day").format("YYYY-MM-DD"),
				cohort_from: request.from,
				cohort_to: request.to,
				cohort_start: `${request.from}T00:00:00.000Z`,
				cohort_end: dayjs(request.to).add(1, "day").toISOString(),
				observation_end: "2026-09-08",
				observed_before: "2026-09-09T00:00:00.000Z",
				timezone: "UTC",
				horizon_days: 7,
				identity_basis: "direct_profile_id",
				activation_basis: "first_in_cohort_window",
				activated_profiles: eligible,
				eligible_profiles: eligible,
				retained_profiles: retained,
				not_retained_profiles: eligible - retained,
				incomplete_profiles: 0,
				activation_events: events,
				identified_activation_events: eligible,
				unidentified_activation_events: events - eligible,
			};
		});
		const overall: NativeRow = {
			...daily[0],
			row_type: "overall",
			cohort_date: null,
		};
		for (const field of [
			"activated_profiles",
			"eligible_profiles",
			"retained_profiles",
			"not_retained_profiles",
			"incomplete_profiles",
			"activation_events",
			"identified_activation_events",
			"unidentified_activation_events",
		] as const) {
			overall[field] = daily.reduce((sum, row) => sum + row[field], 0);
		}
		const data = [overall, ...daily];
		nativeReads.push({ request, data });
		return data;
	};
	const detected = await detectRetentionSignals(
		{ websiteId: plan.websiteId, timezone: "UTC", lookbackDays: 7 },
		dayjs("2026-09-09T12:00:00Z"),
		undefined,
		{ readPlan: async () => plan, query }
	);
	expect(detected).toHaveLength(1);
	expect(nativeReads.map(({ request }) => request.from).sort()).toEqual([
		"2026-08-18",
		"2026-08-25",
	]);
	const prepared = prepareInvestigation(detected[0], 7);
	const current = nativeReads.find(
		({ request }) => request.from === "2026-08-25"
	);
	if (!current) {
		throw new Error("Missing synthetic current cohort");
	}
	return {
		prepared,
		reading: {
			type: "identified_profile_retention",
			websiteId: plan.websiteId,
			from: current.request.from,
			to: current.request.to,
			timezone: "UTC",
			filters: current.request.filters,
			data: current.data,
		},
	};
}

function startAgent(
	prepared: Prepared,
	evidence: unknown[] = [selectedDetail],
	readings: unknown[] = []
) {
	const candidate = {
		title: "Report returns fell",
		summary: "Repeat activators remain eligible.",
		rootCause: null,
		evidence,
		publish: true,
		findingKind: "product_outcome",
		publicationBasis: "measured_impact",
		next: {
			type: "resolve",
			reason: "The observed decline does not establish a repair.",
		},
	};
	const respond = mockValues(
		...readings.map((_, index) =>
			response("get_data", { index }, `read-${index}`)
		),
		...Array.from({ length: 3 }, (_, index) =>
			response("finish_investigation", candidate, `finish-${index}`)
		)
	);
	const model = new MockLanguageModelV3({ doGenerate: async () => respond() });
	const read = mock(async ({ index }: { index: number }) => {
		if (!(index in readings)) {
			throw new Error("Unexpected agent read");
		}
		return { results: { current: readings[index] } };
	});
	const steps: StepResult<ToolSet>[] = [];
	const result = runInsightAgent(
		{
			...prepared,
			appContext: {
				chatId: "insights:retention-depth-fixture",
				currentDateTime: "2026-09-09T12:00:00.000Z",
				defaultWebsiteId: plan.websiteId,
				mutationMode: "dry-run",
				organizationId: "synthetic-org",
				timezone: "UTC",
				userId: "system",
				websiteDomain: plan.domain,
				websiteId: plan.websiteId,
				websiteName: "Example reports",
			},
			history: [],
			otherOpenWork: [],
			githubRepository: null,
		},
		{
			model,
			tools: {
				get_data: tool({
					inputSchema: z.object({ index: z.number().int().nonnegative() }),
					execute: read,
				}),
			},
			onStepFinish: (step) => {
				steps.push(step);
			},
		}
	);
	return { model, read, steps, result };
}

function expectBrief(outcome: InvestigationOutcome, evidence: string[]) {
	expect(outcome).toMatchObject({
		title: "Report returns fell",
		summary: "Repeat activators remain eligible.",
		publish: true,
		findingKind: "product_outcome",
		publicationBasis: "measured_impact",
		rootCause: null,
		next: { type: "resolve" },
	});
	expect(outcome.evidence).toEqual(evidence);
	const brief = [
		outcome.title,
		outcome.summary,
		outcome.rootCause ?? "",
		...outcome.evidence,
	].join(" ");
	expect(brief.trim().split(/\s+/).length).toBeLessThanOrEqual(60);
}

function expectSingleFinish(run: ReturnType<typeof startAgent>) {
	expect(run.read).not.toHaveBeenCalled();
	expect(run.model.doGenerateCalls).toHaveLength(1);
	expect(
		run.steps.flatMap((step) => step.toolCalls).map((call) => call.toolName)
	).toEqual(["finish_investigation"]);
	expect(
		run.steps.flatMap((step) => step.toolResults).map((result) => result.output)
	).toEqual([{ accepted: true }]);
}

async function expectSuccessfulReads(
	run: ReturnType<typeof startAgent>,
	count: number
) {
	await run.result.catch(() => undefined);
	expect(run.read).toHaveBeenCalledTimes(count);
	expect(run.read.mock.calls.map(([input]) => input)).toEqual(
		Array.from({ length: count }, (_, index) => ({ index }))
	);
	const results = run.steps.flatMap((step) =>
		step.toolResults.filter((result) => result.toolName === "get_data")
	);
	expect(results).toHaveLength(count);
	for (const result of results) {
		expect(result.output).toMatchObject({
			results: { current: { type: "identified_profile_retention" } },
		});
	}
	expect(
		run.steps.flatMap((step) =>
			step.content.filter(
				(part) => part.type === "tool-error" && part.toolName === "get_data"
			)
		)
	).toEqual([]);
}

describe("native retention daily depth", () => {
	it("pools small daily cohorts into one cited contrast in the existing finish turn", async () => {
		const { prepared } = await prepareFixture();
		const run = startAgent(prepared);
		const result = await run.result;
		expectBrief(result.outcome, [aggregate, detail]);
		expectSingleFinish(run);
		expect(result.toolCallCount).toBe(0);
		expect(run.steps[0].toolCalls[0].input).toMatchObject({
			evidence: [selectedDetail],
		});
		const call = run.model.doGenerateCalls[0];
		const userMessage = call.prompt.find((message) => message.role === "user");
		if (!userMessage || typeof userMessage.content === "string") {
			throw new Error("Missing native prompt");
		}
		const text = userMessage.content.find((part) => part.type === "text");
		if (text?.type !== "text") {
			throw new Error("Missing native prompt text");
		}
		const prompt = JSON.parse(text.text);
		expect(prompt.signal.retentionMeasurement).not.toHaveProperty("daily");
		expect(JSON.stringify(call.prompt)).not.toContain("cohort_date");
		const finish = call.tools?.find(
			(item) => item.name === "finish_investigation"
		);
		expect(JSON.stringify(finish)).toContain("retentionDetail");
		expect(JSON.stringify(finish)).toContain(detail);
	});

	it.each([
		[
			"sparse",
			"7-day return among identified profiles: 56/70 (80%) → 38/70 (54.3%). Cohorts 2026-08-18–2026-08-24 → 2026-08-25–2026-08-31; fully observed through 2026-09-08 UTC. Activation events with identity: 70/140 (50%) → 70/140 (50%); anonymous excluded.",
		],
		[
			"uniform",
			"7-day return among identified profiles: 224/280 (80%) → 112/280 (40%). Cohorts 2026-08-18–2026-08-24 → 2026-08-25–2026-08-31; fully observed through 2026-09-08 UTC. Activation events with identity: 280/350 (80%) → 280/350 (80%); anonymous excluded.",
		],
	] as const)("keeps the valid %s aggregate without a detail option or repair turn", async (kind, expected) => {
		const { prepared } = await prepareFixture(kind);
		expect(renderRetentionDetail(prepared.signal)).toBeNull();
		const run = startAgent(prepared, []);
		const result = await run.result;
		expectBrief(result.outcome, [expected]);
		expectSingleFinish(run);
		expect(result.toolCallCount).toBe(0);
		expect(JSON.stringify(run.model.doGenerateCalls[0].tools)).not.toContain(
			"retentionDetail"
		);
	});

	it.each([
		"optional",
		"legacy",
	] as const)("preserves aggregate-only publication: %s", async (mode) => {
		const { prepared } = await prepareFixture();
		if (mode === "legacy") {
			const measured = prepared.signal.retentionMeasurement;
			if (!measured) {
				throw new Error("Missing retention fixture");
			}
			const { daily: _daily, ...aggregateOnly } = measured;
			prepared.signal.retentionMeasurement = aggregateOnly;
		}
		const run = startAgent(prepared, []);
		const result = await run.result;
		expectBrief(result.outcome, [aggregate]);
		expectSingleFinish(run);
	});

	it.each([
		[
			"provided source",
			{
				claim: { retentionDetail: true },
				sources: [{ source: "provided", index: 0 }],
			},
		],
		[
			"mixed sources",
			{
				claim: { retentionDetail: true },
				sources: [{ source: "signal" }, { source: "provided", index: 0 }],
			},
		],
	])("rejects optional detail with %s", async (_name, claim) => {
		const { prepared } = await prepareFixture();
		const run = startAgent(prepared, [claim]);
		await expect(run.result).rejects.toThrow();
		expect(run.read).not.toHaveBeenCalled();
		expect(run.model.doGenerateCalls).toHaveLength(3);
		expect(run.steps.flatMap((step) => step.toolResults)).toEqual([]);
	});

	it("accepts a confirming exact read while requiring the detail to cite the frozen signal", async () => {
		const { prepared, reading } = await prepareFixture();
		const confirmed = startAgent(prepared, [selectedDetail], [reading]);
		await expectSuccessfulReads(confirmed, 1);
		expectBrief((await confirmed.result).outcome, [aggregate, detail]);
		expect(confirmed.model.doGenerateCalls).toHaveLength(2);
		const toolCited = startAgent(
			prepared,
			[
				{
					claim: { retentionDetail: true },
					sources: [
						{
							source: "tool",
							name: "get_data",
							toolCallId: "read-0",
							resultKey: "current",
						},
					],
				},
			],
			[reading]
		);
		await expectSuccessfulReads(toolCited, 1);
		await expect(toolCited.result).rejects.toThrow(
			"Retention date detail requires the supported frozen signal comparison"
		);
	});

	it.each([
		"complete",
		"overall-only",
		"partial",
	] as const)("keeps a daily conflict sticky after a %s matching read, regardless of claim encoding", async (later) => {
		const { prepared, reading } = await prepareFixture();
		// Move one return across the partition, preserving every weekly total and
		// each row's eligible = retained + not-retained accounting.
		const changed = {
			...reading,
			data: reading.data.map((row) => {
				const delta =
					row.cohort_date === "2026-08-29"
						? 1
						: row.cohort_date === "2026-08-25"
							? -1
							: 0;
				return {
					...row,
					retained_profiles: row.retained_profiles + delta,
					not_retained_profiles: row.not_retained_profiles - delta,
				};
			}),
		};
		expect(changed.data[0]).toEqual(reading.data[0]);
		expect(
			changed.data.slice(1).reduce((sum, row) => sum + row.retained_profiles, 0)
		).toBe(152);
		const matching = {
			...reading,
			data: reading.data.filter(
				(row) =>
					later === "complete" ||
					row.row_type === "overall" ||
					(later === "partial" && row.cohort_date === "2026-08-30")
			),
		};
		const blocked = startAgent(prepared, [selectedDetail], [changed, matching]);
		await expectSuccessfulReads(blocked, 2);
		await expect(blocked.result).rejects.toThrow(
			"conflicts with the snapshot or the cited cohort uses a different scope"
		);
		expect(blocked.model.doGenerateCalls).toHaveLength(5);
		for (const evidence of [
			[],
			[
				{
					claim: "Late-week activators account for the decline.",
					sources: [{ source: "signal" }],
				},
			],
		]) {
			const prose = startAgent(prepared, evidence, [changed, matching]);
			await expectSuccessfulReads(prose, 2);
			await expect(prose.result).rejects.toThrow("conflicts with the snapshot");
			expect(prose.model.doGenerateCalls).toHaveLength(5);
		}
	});
});

describe("tool-supplied retention publication without a saved snapshot", () => {
	it.each([
		"small",
		"incomplete",
	])("records a private structured %s limitation without a repair turn", async (kind) => {
		const result = await investigate(
			[
				reading("previous", kind === "small" ? 20 : 50),
				reading(
					"current",
					kind === "small" ? 20 : 50,
					kind === "incomplete" ? 1 : 0
				),
			],
			{
				...privateFinish,
				summary: `${kind === "small" ? 20 : 50} eligible profiles; the comparison remains unconfirmed.`,
				evidence: [{ sources, claim: { retention: true } }],
			}
		);
		expect(result.outcome.publish).toBe(false);
		expect(result.model.doGenerateCalls).toHaveLength(2);
		expect(result.outcome.evidence[0]).toContain(
			"Retention comparison withheld."
		);
		expect(result.outcome.evidence[0]).not.toContain("%");
		expect(
			result.steps
				.flatMap((step) => step.content)
				.filter((part) => part.type === "tool-error")
		).toHaveLength(0);
	});
	it("identifies the exact numeric summary that needs correction", async () => {
		const result = await investigate(
			undefined,
			{ ...finish(), summary: "Identity coverage was 50%." },
			finish()
		);
		expect(result.outcome.publish).toBe(true);
		const rejection = result.steps[1].content.find(
			(part) => part.type === "tool-error"
		);
		expect(rejection?.type).toBe("tool-error");
		if (rejection?.type === "tool-error") {
			expect(String(rejection.error)).toContain(
				'summary: "Identity coverage was 50%."'
			);
		}
	});

	it.each([
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
