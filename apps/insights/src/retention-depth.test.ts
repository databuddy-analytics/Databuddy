import { describe, expect, it, mock } from "bun:test";
import type { executeQuery, QueryRequest } from "@databuddy/ai/query";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import type { BusinessMeasurementPlan } from "@databuddy/shared/organization-business-context";
import { type StepResult, tool, type ToolSet } from "ai";
import { MockLanguageModelV3, mockValues } from "ai/test";
import dayjs from "dayjs";
import { z } from "zod";
import { renderRetentionDetail, runInsightAgent } from "./agent";
import { prepareInvestigation } from "./investigation";
import {
	detectRetentionSignals,
	type retentionRowSchema,
} from "./measurement-plan";

// All rows, plans, reads and model responses are synthetic. Run with
// bun --no-env-file test apps/insights/src/retention-depth.test.ts
// No test/env import, module mocks, provider calls or service queries are needed.
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
	if (!current) throw new Error("Missing synthetic current cohort");
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

function toolResponse(toolName: string, input: unknown, toolCallId: string) {
	return {
		content: [
			{
				type: "tool-call" as const,
				toolName,
				toolCallId,
				input: JSON.stringify(input),
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
			toolResponse("get_data", { index }, `read-${index}`)
		),
		...Array.from({ length: 3 }, (_, index) =>
			toolResponse("finish_investigation", candidate, `finish-${index}`)
		)
	);
	const model = new MockLanguageModelV3({ doGenerate: async () => respond() });
	const read = mock(async ({ index }: { index: number }) => {
		if (!(index in readings)) throw new Error("Unexpected agent read");
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
	// A rejected finish must not hide an unexecuted or failed fixture read.
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
		if (!userMessage || typeof userMessage.content === "string")
			throw new Error("Missing native prompt");
		const text = userMessage.content.find((part) => part.type === "text");
		if (text?.type !== "text") throw new Error("Missing native prompt text");
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
			if (!measured) throw new Error("Missing retention fixture");
			const { daily: _daily, ...aggregateOnly } = measured;
			prepared.signal.retentionMeasurement = aggregateOnly;
		}
		const run = startAgent(prepared, []);
		const result = await run.result;
		expectBrief(result.outcome, [aggregate]);
		expectSingleFinish(run);
	});

	it.each([
		["missing sources", { claim: { retentionDetail: true } }],
		["empty sources", { claim: { retentionDetail: true }, sources: [] }],
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
	] as const)("keeps a daily conflict sticky after a %s matching read, without vetoing the aggregate", async (later) => {
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
		const aggregateOnly = startAgent(prepared, [], [changed, matching]);
		await expectSuccessfulReads(aggregateOnly, 2);
		const result = await aggregateOnly.result;
		expectBrief(result.outcome, [aggregate]);
		expect(aggregateOnly.model.doGenerateCalls).toHaveLength(3);
		expect(result.toolCallCount).toBe(2);
	});
});
