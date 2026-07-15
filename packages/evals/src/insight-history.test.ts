import { describe, expect, it } from "bun:test";
import { investigateWebsiteWithSources } from "../../../apps/insights/src/generation";
import {
	insightTimelines,
	type InsightTimeline,
} from "./fixtures/insight-timelines";
import {
	formatInsightHistory,
	runInsightHistory,
} from "./insight-history";

function firstStageTimeline(): InsightTimeline {
	const source = insightTimelines[0];
	return {
		id: "runner-contract",
		name: "Runner contract",
		stages: [source.stages[0]],
	};
}

async function firstArtifact() {
	const stage = firstStageTimeline().stages[0];
	return investigateWebsiteWithSources(stage.input, stage.sources(new Map()));
}

async function actionArtifact() {
	const timeline = insightTimelines.find(
		(item) => item.id === "missing-funnel-step"
	);
	if (!timeline) {
		throw new Error("Missing action fixture");
	}
	const stage = timeline.stages[0];
	return {
		artifact: await investigateWebsiteWithSources(
			stage.input,
			stage.sources(new Map())
		),
		timeline,
	};
}

describe("historical insight runner", () => {
	it("passes the complete corpus including one independently verified repair", async () => {
		const result = await runInsightHistory();

		expect(result.passed).toBe(true);
		expect(result.aggregate).toMatchObject({
			actions: 1,
			failures: 0,
			insights: 9,
			stages: 17,
			timelines: 14,
		});
		const action = result.timelines
			.flatMap((timeline) => timeline.stages)
			.find(
				(stage) => stage.artifact?.decision?.disposition === "action_ready"
			)?.artifact?.insight;
		expect(action?.impactSummary).toContain(
			"Independent revenue tracking recorded 12 transactions"
		);
		expect(action?.suggestion).toBe(
			'Restore the "purchase" event at the Purchase step in Checkout.'
		);
		const payment = result.timelines.find(
			(timeline) => timeline.id === "payment-failure-regression"
		)?.stages[0];
		expect(payment?.lifecycle).toBe("detected");
		expect(payment?.artifact?.validationErrors).toEqual([]);
		expect(payment?.artifact?.insight?.impactSummary).toContain(
			"Most common failure: insufficient funds"
		);
		expect(payment?.artifact?.insight?.impactSummary).toContain(
			"2 distinct Stripe failure event types were observed"
		);
		expect(payment?.artifact?.insight?.impactSummary).not.toContain(
			"provider message"
		);
	});

	it("keeps low-volume noise out of the investigation queue", async () => {
		const result = await runInsightHistory(
			insightTimelines.filter((timeline) =>
				["one-session-bounce", "low-impact-error-spike"].includes(timeline.id)
			)
		);

		expect(result.passed).toBe(true);
		expect(result.aggregate).toEqual({
			actions: 0,
			contexts: 0,
			failures: 0,
			insights: 0,
			maxVisibleWords: 0,
			monitors: 0,
			stages: 2,
			timelines: 2,
		});
	});

	it("prints the exact visible insight and returns a passing exit code", async () => {
		const result = await runInsightHistory([firstStageTimeline()]);
		const report = formatInsightHistory(result);

		expect(result.passed).toBe(true);
		expect(result.aggregate.maxVisibleWords).toBe(37);
		expect(result.aggregate.actions).toBe(0);
		expect(result.aggregate.contexts).toBe(1);
		expect(report).toContain("Title: Visitors fell 60%");
		expect(report).toContain(
			"Next: Was this traffic drop expected? If not, check source traffic"
		);
	});

	it("fails deterministic replay when semantic output changes", async () => {
		const base = await firstArtifact();
		let calls = 0;
		const result = await runInsightHistory(
			[firstStageTimeline()],
			async () => {
				calls += 1;
				if (calls === 1 || !base.insight) {
					return base;
				}
				return {
					...base,
					insight: { ...base.insight, description: "Changed on replay." },
				};
			}
		);

		expect(result.passed).toBe(false);
		expect(result.timelines[0].stages[0].failures).toContain(
			"deterministic replay produced different semantic output"
		);
	});

	it("hard-fails customer-visible output above 100 words", async () => {
		const base = await firstArtifact();
		if (!base.insight) {
			throw new Error("Expected the traffic fixture to surface an insight");
		}
		const verbose = {
			...base,
			insight: {
				...base.insight,
				suggestion: Array.from({ length: 101 }, () => "word").join(" "),
			},
		};
		const result = await runInsightHistory(
			[firstStageTimeline()],
			async () => verbose
		);

		expect(result.passed).toBe(false);
		expect(result.timelines[0].stages[0].failures).toContainEqual(
			expect.stringContaining("maximum is 100")
		);
	});

	it("enforces field-level copy and evidence limits", async () => {
		const base = await firstArtifact();
		if (!base.insight) {
			throw new Error("Expected the traffic fixture to surface an insight");
		}
		const result = await runInsightHistory(
			[firstStageTimeline()],
			async () => ({
				...base,
				insight: {
					...base.insight!,
					description: Array.from({ length: 41 }, () => "word").join(" "),
					evidence: Array.from({ length: 4 }, (_, index) => ({
						type: "metric" as const,
						description: `Evidence ${index + 1}`,
					})),
					suggestion: Array.from({ length: 31 }, () => "check").join(" "),
				},
			})
		);

		const failures = result.timelines[0].stages[0].failures;
		expect(failures).toContainEqual(
			expect.stringContaining("verbose_description")
		);
		expect(failures).toContainEqual(
			expect.stringContaining("verbose_suggestion")
		);
		expect(failures).toContainEqual(expect.stringContaining("too_much_evidence"));
	});

	it("rejects raw JSON in any customer-visible field", async () => {
		const base = await firstArtifact();
		const insight = base.insight;
		if (!insight) {
			throw new Error("Expected the traffic fixture to surface an insight");
		}
		const result = await runInsightHistory(
			[firstStageTimeline()],
			async () => ({
				...base,
				insight: { ...insight, impactSummary: '{"secret":123}' },
			})
		);

		expect(result.timelines[0].stages[0].failures).toContainEqual(
			expect.stringContaining("raw_json_visible")
		);
	});

	it("rejects a displayed repair that differs from its verified instruction", async () => {
		const { artifact, timeline } = await actionArtifact();
		const insight = artifact.insight;
		if (!insight) {
			throw new Error("Expected the action fixture to surface an insight");
		}
		const result = await runInsightHistory([timeline], async () => ({
			...artifact,
			insight: { ...insight, suggestion: "Investigate checkout." },
		}));

		expect(result.timelines[0].stages[0].failures).toContainEqual(
			expect.stringContaining("non_executable_action")
		);
	});

	it("rejects a vague action verification step", async () => {
		const { artifact, timeline } = await actionArtifact();
		const insight = artifact.insight;
		if (!insight) {
			throw new Error("Expected the action fixture to surface an insight");
		}
		const result = await runInsightHistory([timeline], async () => ({
			...artifact,
			insight: {
				...insight,
				evidence: (insight.evidence ?? []).map((item) =>
					item.description.startsWith("Verify after ")
						? { ...item, description: "Verify after bananas." }
						: item
				),
			},
		}));

		expect(result.timelines[0].stages[0].failures).toContainEqual(
			expect.stringContaining("non_executable_action")
		);
	});

	it("reports unexpected engine errors as failures", async () => {
		const result = await runInsightHistory(
			[firstStageTimeline()],
			async () => {
				throw new Error("Synthetic engine failure");
			}
		);

		expect(result.passed).toBe(false);
		expect(result.timelines[0].stages[0].failures).toContain(
			"unexpected error: Synthetic engine failure"
		);
	});

	it("rejects an empty corpus before running", async () => {
		await expect(runInsightHistory([])).rejects.toThrow(
			"requires at least one timeline"
		);
	});
});
