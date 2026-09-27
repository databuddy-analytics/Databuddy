import {
	appendFileSync,
	copyFileSync,
	mkdirSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createModelFromId } from "@databuddy/ai/config/models";
import type { BusinessContext } from "@databuddy/shared/insights";
import { wrapLanguageModel } from "ai";
import { spawnSync } from "bun";
import { runInsightAgent } from "../agent";
import { chooseInvestigationSignals } from "../business-aware-selection";
import { organizationProfileContext } from "../business-context";
import type { DetectedSignal } from "../detection";
import { planInvestigationsWithBusinessContext } from "../generation";
import { evaluate, qualityCases } from "./quality";

interface SelectionResult {
	id: string;
	investigations: Awaited<ReturnType<typeof evaluate>>[];
	planned: { key: string; objective: string | undefined }[];
	requiredFirst: boolean;
	requiredSelected: boolean;
	selectionCalls: number;
	selectionMs: number;
	selectionUsage: unknown[];
}

// Frozen synthetic measurements and native selection/investigation entry points.
// Only gateway model requests are live. No persistence, billing or delivery runs.
const asOf = "2026-09-05T00:00:00.000Z";
const modelId = "openai/gpt-5.6-terra";
const input = {
	organizationId: "synthetic-org",
	websiteId: "synthetic-site",
	domain: "synthetic.example.invalid",
	timezone: "UTC",
	asOf,
};
const base: DetectedSignal = {
	baseline: 1000,
	current: 100,
	deltaPercent: -90,
	detectedAt: "2026-09-04",
	direction: "down",
	label: "Visitors",
	method: "wow",
	metric: "visitors",
	severity: "critical",
};
const activation: DetectedSignal = {
	...base,
	baseline: 18,
	current: 10,
	deltaPercent: -44.4,
	severity: "warning",
	metric: "funnel:first-report",
	subjectKey: "funnel:first-report",
	entityId: "first-report",
	entityLabel: "First report delivered",
	label: "First report delivery rate",
	definitionEvidence:
		"Funnel first-report: EVENT project_created then EVENT first_report_delivered; no filters; ordered unique visitors, not projects or event occurrences.",
	investigationObjective:
		"Compare the same ordered visitor population in both full seven-day windows. A first-report event name alone does not establish delivery, payment or causality.",
};
const profile = {
	content:
		"Example builds report delivery software. The public documentation moved to a separate domain; that explains its visitor decline. Public demo activity is deliberately separate from customer outcomes.",
	origin: "team" as const,
	sources: [],
	revision: 4,
	updatedAt: "2026-09-04T12:00:00.000Z",
	updatedBy: "synthetic-owner",
	sourceWebsiteId: null,
	teamContext: {
		priority:
			"Improve first successful report delivery after project creation. Investigate its unexplained decline before public docs or demo activity.",
		successDefinition:
			"The team defines first_report_delivered as an event emitted after the first successful report delivery. Analytics counts distinct visitors through these steps, not distinct projects or customers.",
		exclusions:
			"Public demo events named demo_action_* only count marketing demo button clicks. They do not represent product outcomes and their changes are outside this team's current investigation scope. The documentation migration is already understood.",
	},
};
const context = organizationProfileContext(
	profile,
	input.organizationId,
	new Date(asOf)
);
const absent: BusinessContext = {
	capturedAt: asOf,
	status: "disabled",
	sources: [],
	issues: [],
};
const demo = (index: number): DetectedSignal => ({
	...base,
	metric: "custom_event_count",
	subjectKey: `event:demo_action_${index}`,
	entityId: `demo_action_${index}`,
	entityLabel: `Public demo action ${index}`,
	label: `Public demo action ${index} occurrences`,
	definitionEvidence: `CUSTOM_EVENT demo_action_${index}; total event occurrences; no completion or revenue definition is available in analytics.`,
});
const production: DetectedSignal = {
	...activation,
	metric: "goal:production-delivery",
	subjectKey: "goal:production-delivery",
	entityId: "production-delivery",
	entityLabel: "Production report accepted",
	label: "Production report acceptance rate",
	definitionEvidence:
		'Goal production-delivery: EVENT customer_delivery_accepted; visitors with environment="production"; counts matching visitors, not payments.',
};
const long = organizationProfileContext(
	{
		...profile,
		content:
			"Example provides report preparation and delivery, with collaboration, scheduling and public demonstrations. "
				.repeat(100)
				.slice(0, 10_000),
		teamContext: {
			priority: profile.teamContext.priority.padEnd(
				1950,
				" Details recorded in the business brief."
			),
			successDefinition: profile.teamContext.successDefinition.padEnd(
				1950,
				" Definitions are team assertions."
			),
			exclusions: profile.teamContext.exclusions.padEnd(
				1950,
				" Public demos are excluded."
			),
		},
	},
	input.organizationId,
	new Date(asOf)
);
long.sources.push({
	id: "latest-team-correction",
	kind: "team_reply",
	subjectKey: "funnel:first-report",
	author: "Current teammate",
	observedAt: "2026-09-04T23:00:00.000Z",
	content:
		"Correction to the saved brief: first_report_delivered now belongs only to an intentionally retained public demo. The known demo decline needs no further investigation. The production outcome is customer_delivery_accepted and is measured by goal:production-delivery. Prioritize its unexplained decline. This supersedes the old first-report emitter definition and priority. ".repeat(
			8
		),
});
const scenarios = [
	{
		id: "manual-exclusions",
		signals: [base, activation],
		context,
		required: "funnel:first-report",
		downstream: false,
	},
	{
		id: "small",
		signals: [base, activation],
		context,
		required: "funnel:first-report",
		downstream: true,
	},
	{
		id: "busy-nine",
		signals: [
			base,
			...Array.from({ length: 7 }, (_, index) => demo(index)),
			activation,
		],
		context,
		required: "funnel:first-report",
		downstream: true,
	},
	{
		id: "busy-twenty-four",
		signals: [
			base,
			...Array.from({ length: 22 }, (_, index) => demo(index)),
			activation,
		],
		context,
		required: "funnel:first-report",
		downstream: false,
	},
	{
		id: "latest-correction",
		signals: [activation, production],
		context: long,
		required: "goal:production-delivery",
		downstream: false,
	},
];

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			out: { type: "string" },
			runs: { type: "string", default: "2" },
			cases: { type: "string" },
			reverse: { type: "boolean", default: false },
		},
	});
	if (!values.out) {
		throw new Error(
			"--out is required; use a fresh directory for every experiment"
		);
	}
	const runs = Number(values.runs);
	if (!Number.isInteger(runs) || runs < 1 || runs > 3) {
		throw new Error("--runs must be 1–3");
	}
	const directory = resolve(values.out);
	mkdirSync(directory, { recursive: false, mode: 0o700 });
	for (const name of [
		"agent.ts",
		"business-aware-selection.ts",
		"business-context.ts",
		"generation.ts",
		"coverage-planner.ts",
		"investigation.ts",
	]) {
		copyFileSync(
			resolve(import.meta.dir, "..", name),
			resolve(directory, name)
		);
	}
	copyFileSync(import.meta.path, resolve(directory, "context-selection.ts"));
	copyFileSync(
		resolve(import.meta.dir, "quality.ts"),
		resolve(directory, "quality.ts")
	);
	writeFileSync(
		resolve(directory, "fixtures.json"),
		JSON.stringify(scenarios, null, 2)
	);
	writeFileSync(
		resolve(directory, "metadata.json"),
		JSON.stringify(
			{
				modelId,
				asOf,
				runs,
				reverse: values.reverse,
				sourceRevision: spawnSync(["git", "rev-parse", "HEAD"])
					.stdout.toString()
					.trim(),
				synthetic: true,
			},
			null,
			2
		)
	);
	const selected = values.cases
		? scenarios.filter((item) => values.cases?.split(",").includes(item.id))
		: scenarios;
	if (!selected.length) {
		throw new Error("No matching cases");
	}
	const results: SelectionResult[] = [];
	for (let iteration = 1; iteration <= runs; iteration++) {
		for (const scenario of selected) {
			for (const arm of iteration % 2
				? ["absent", "present"]
				: ["present", "absent"]) {
				const id = `${scenario.id}-${arm}-${iteration}`;
				const trace = resolve(directory, `${id}.selection.jsonl`);
				const emit = (kind: string, value: unknown) =>
					appendFileSync(
						trace,
						`${JSON.stringify({ kind, value }, (_key, item) => (item && typeof item === "object" && item.type === "reasoning" ? { type: "reasoning", text: "[omitted]" } : item))}\n`,
						{ mode: 0o600 }
					);
				const calls: unknown[] = [];
				const usage: unknown[] = [];
				const model = wrapLanguageModel({
					model: createModelFromId(modelId),
					middleware: {
						specificationVersion: "v3",
						wrapGenerate: async ({ doGenerate, params }) => {
							calls.push(params.prompt);
							emit("model.request", params);
							try {
								const response = await doGenerate();
								usage.push(response.usage);
								emit("model.response", {
									content: response.content.filter(
										(item) => item.type !== "reasoning"
									),
									usage: response.usage,
									finishReason: response.finishReason,
								});
								return response;
							} catch (error) {
								emit(
									"model.error",
									error instanceof Error ? error.message : String(error)
								);
								throw error;
							}
						},
					},
				});
				const started = performance.now();
				const supplied = arm === "present" ? scenario.context : absent;
				const signals = values.reverse
					? [...scenario.signals].reverse()
					: scenario.signals;
				emit("case.input", { input, signals, businessContext: supplied });
				const candidates = await planInvestigationsWithBusinessContext(
					input,
					signals,
					{
						loadBusinessProfile: async () => supplied,
						selectCandidates: (selection) =>
							chooseInvestigationSignals(selection, model),
					},
					false,
					undefined,
					{
						reason:
							scenario.id === "manual-exclusions" ? "manual" : "scheduled",
					}
				);
				const planned = candidates.map((candidate) => ({
					key: candidate.signal.signalKey,
					objective: candidate.investigationObjective,
				}));
				const selectionMs = performance.now() - started;
				emit("selection.result", {
					planned,
					selectionMs,
					calls: calls.length,
					usage,
				});
				const investigations: Awaited<ReturnType<typeof evaluate>>[] = [];
				if (scenario.downstream) {
					for (const candidate of candidates) {
						const source = qualityCases.find(
							(fixture) =>
								fixture.id ===
								(candidate.signal.signalKey === activation.subjectKey
									? "activation-source-comparison"
									: "empty-evidence-signal")
						);
						if (!source) {
							throw new Error("Missing native investigation fixture");
						}
						const fixture = {
							...source,
							id: `${id}-${candidate.signal.signalKey.replaceAll(":", "-")}`,
							input: {
								...source.input,
								signal: candidate.signal,
								investigationObjective: candidate.investigationObjective,
								businessContext: candidate.businessContext,
								evidence:
									candidate.signal.signalKey === activation.subjectKey
										? [
												"The unchanged funnel counted 1000 visitors reaching its first step in each window. Completions fell from 180 to 100. No source or implementation cause is established.",
											]
										: [],
							},
						};
						investigations.push(
							await evaluate(runInsightAgent, fixture, directory, 1, modelId)
						);
					}
				}
				const result = {
					id,
					planned,
					selectionMs,
					selectionCalls: calls.length,
					selectionUsage: usage,
					requiredSelected: planned.some(
						(candidate) => candidate.key === scenario.required
					),
					requiredFirst: planned[0]?.key === scenario.required,
					investigations,
				};
				results.push(result);
				writeFileSync(
					resolve(directory, "results.json"),
					JSON.stringify(results, null, 2)
				);
				console.log(
					JSON.stringify({
						id,
						chosen: planned.map((candidate) => candidate.key),
						calls: calls.length,
						investigations: investigations.map((item) => ({
							id: item.id,
							completed: item.completed,
							failures: item.failures,
						})),
					})
				);
			}
		}
	}
	process.exit(0);
}
