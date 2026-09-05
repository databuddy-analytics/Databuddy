import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createModelFromId } from "@databuddy/ai/config/models";
import { tool, wrapLanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import {
	runInsightAgent,
	type InsightAgentInput,
	type InsightAgentResult,
} from "../agent";

const ABSENCE_CLAIM =
	/\b(?:does not exist|no longer exists|retired route|absent from the site|nonexistent route|(?:route|path|page) (?:is |was |has been )?(?:missing|removed|deleted|retired|unavailable)|(?:missing|removed|deleted|retired) (?:route|path|page))\b/i;

// Entirely synthetic. No analytics clients, customer fixtures, writes, or delivery tools.
const period = {
	current: { from: "2026-08-29", to: "2026-09-04" },
	previous: { from: "2026-08-22", to: "2026-08-28" },
};
const appContext = {
	chatId: "synthetic-quality-eval",
	currentDateTime: "2026-09-05T00:00:00.000Z",
	organizationId: "synthetic-org",
	timezone: "UTC",
	userId: "synthetic-evaluator",
	websiteDomain: "synthetic.example.invalid",
	websiteId: "synthetic-site",
	websiteName: "Synthetic workspace",
};
const defaultSignal: InsightAgentInput["signal"] = {
	signalKey: "visitors",
	entity: { type: "website", id: "synthetic-site", label: "Visitors" },
	metric: { label: "Visitors", current: 0, previous: 480, format: "number" },
	changePercent: -100,
	severity: "critical",
	sentiment: "negative",
	period,
};
function input(overrides: Partial<InsightAgentInput> = {}): InsightAgentInput {
	return {
		appContext,
		signal: defaultSignal,
		evidence: [],
		history: [],
		otherOpenWork: [],
		githubRepository: null,
		...overrides,
	};
}
const goal = {
	id: "workspace-goal",
	name: "Workspace reached",
	description: "Counts visits to the workspace after login.",
	type: "PAGE_VIEW",
	target: "/start",
	filters: [],
};
function readTool(description: string, output: unknown) {
	return tool({
		description,
		inputSchema: z.object({}).strict(),
		execute: () => output,
	});
}
const goalTools: ToolSet = {
	list_goals: readTool(
		"Inspect the current goal, including its exact target and purpose.",
		{ goals: [goal] }
	),
	scrape_page: readTool(
		"Inspect the application's current routes and tracking implementation.",
		{
			content:
				"The inspected route map sends authenticated sessions to /workspace. /start is the retired workspace route. The saved goal is meant to count workspace visits. No code or tracking change is needed; the existing goal target is stale.",
		}
	),
	get_data: tool({
		description:
			"Inspect page traffic. An exact path filter returns the full count for that path; otherwise returns a partial top-pages table.",
		inputSchema: z.object({ path: z.string().nullable() }).strict(),
		execute: ({ path }) => ({
			results: {
				pages: path
					? {
							data: [{ path, visitors: path === "/workspace" ? 164 : 0 }],
							returnedRows: 1,
							rowCount: 1,
							truncated: false,
						}
					: {
							data: [
								{ path: "/", visitors: 680 },
								{ path: "/workspace", visitors: 164 },
							],
							returnedRows: 2,
							rowCount: 31,
							truncated: true,
						},
			},
		}),
	}),
};
interface QualityCase {
	// Observable expectations, independent of exact wording.
	check: (
		result: InsightAgentResult,
		calls: { name: string; input: unknown }[]
	) => string[];
	id: string;
	input: InsightAgentInput;
	tools: ToolSet;
}
export const qualityCases: QualityCase[] = [
	{
		id: "empty-evidence-signal",
		input: input(),
		tools: {},
		check: ({ outcome }) => [
			...(outcome.rootCause === null
				? []
				: ["Invented a cause from the signal alone"]),
			...(outcome.publish
				? ["Published unverified traffic loss from the signal alone"]
				: []),
		],
	},

	{
		id: "unrelated-context-traffic",
		input: input({
			request: {
				body: "Check the saved goals to determine whether the visitor loss is real.",
				createdAt: appContext.currentDateTime,
			},
		}),
		tools: {
			list_goals: readTool(
				"Read saved goal definitions; they do not measure collection health.",
				{ goals: [goal] }
			),
		},
		check: ({ outcome }) =>
			outcome.publish
				? ["An unrelated goal lookup unlocked an unsupported website finding"]
				: [],
	},
	{
		id: "sibling-metric-traffic",
		input: input({
			relatedSignals: [
				{
					...defaultSignal,
					signalKey: "event:account_created",
					entity: {
						type: "event",
						id: "account_created",
						label: "Completed accounts",
					},
					metric: {
						label: "Completed accounts",
						current: 24,
						previous: 80,
						format: "number",
					},
				},
			],
		}),
		tools: {},
		check: ({ outcome }) =>
			outcome.publish
				? [
						"A sibling product result was published as proof for the website traffic subject",
					]
				: [],
	},
	{
		id: "coverage-without-definition",
		input: input({
			evidence: [
				"Collection health: zero events arrived in the current window versus 480 visitors in the previous window. Independent origin request logs show 2200 successful HTML responses in the current window, so missing collection does not mean customer activity stopped.",
				"Release verification: the tracking bootstrap is absent from the inspected shared document template. Acquisition reporting cannot compare channels during this collection gap. The owning repository is not connected.",
			],
		}),
		tools: {},
		check: ({ outcome }) => [
			...(outcome.publish ? [] : ["Hid a verified reporting blind spot"]),
			...(outcome.findingKind === "measurement_coverage"
				? []
				: ["Misclassified missing collection as customer activity"]),
		],
	},
	{
		id: "useful-signup-decline",
		input: input({
			signal: {
				...defaultSignal,
				signalKey: "event:signup_completed",
				entity: {
					type: "event",
					id: "signup_completed",
					label: "Completed account creation",
				},
				metric: {
					label: "Completed account creations",
					current: 24,
					previous: 80,
					format: "number",
				},
				changePercent: -70,
			},
			evidence: [
				"Business meaning: the inspected signup_completed emitter runs only after a successful account creation; the emitter and collection coverage are unchanged across both windows. Completed accounts fell from 80 to 24.",
				"New-user visits stayed at 1200 in both windows. No causal source or campaign change has been established, and there is no justified repair or external question yet.",
			],
		}),
		tools: {},
		check: ({ outcome }) => [
			...(outcome.publish
				? []
				: [
						"Hid a material verified product result because no repair was available",
					]),
			...(outcome.next.type === "resolve"
				? []
				: ["Manufactured work without an established remedy or missing fact"]),
			...(outcome.rootCause === null ? [] : ["Invented a causal mechanism"]),
		],
	},
	{
		id: "executable-goal-target",
		input: input({
			signal: {
				...defaultSignal,
				signalKey: "goal:workspace-goal",
				entity: { type: "goal", id: goal.id, label: goal.name },
				metric: {
					label: "Workspace visits",
					current: 0,
					previous: 164,
					format: "number",
				},
			},
			evidence: [
				"Business meaning: counts visits to the workspace after login. The current saved target has no measured visits; inspect the saved definition and current route before deciding whether the product stopped working.",
			],
		}),
		tools: goalTools,
		check: ({ outcome }) =>
			outcome.next.type === "act" &&
			outcome.next.execution?.operation === "edit" &&
			"target" in outcome.next.execution.changes &&
			outcome.next.execution.changes.target === "/workspace"
				? outcome.title.includes("164")
					? [
							"Used a prior-period count as current missed activity in a repair headline",
						]
					: []
				: ["Did not produce an executable target repair"],
	},

	{
		id: "wrong-definition-subject",
		input: input({
			signal: {
				...defaultSignal,
				signalKey: "goal:workspace-goal",
				entity: { type: "goal", id: goal.id, label: goal.name },
				metric: {
					label: "Workspace visits",
					current: 0,
					previous: 164,
					format: "number",
				},
			},
			evidence: [
				"Business meaning: counts visits to the workspace after login. Inspect the exact saved goal before proposing a repair.",
			],
		}),
		tools: {
			...goalTools,
			list_goals: readTool("Read saved goals with their exact ids.", {
				goals: [{ ...goal, id: "other-goal-with-same-name" }],
			}),
		},
		check: ({ outcome }) => [
			...(outcome.next.type === "resolve"
				? []
				: ["Created work without inspecting the signal's exact definition"]),
			...(outcome.publish
				? ["Published a diagnosis for an unverified definition subject"]
				: []),
			...(outcome.rootCause === null
				? []
				: ["Claimed a cause without verifying the signal's exact definition"]),
		],
	},
	{
		id: "already-correct-goal",
		input: input({
			signal: {
				...defaultSignal,
				signalKey: "goal:workspace-goal",
				entity: { type: "goal", id: goal.id, label: goal.name },
				metric: {
					label: "Workspace visits",
					current: 0,
					previous: 164,
					format: "number",
				},
			},
			evidence: [
				"Business meaning: counts visits to the workspace after login. The signal was detected before the current definition was inspected.",
			],
		}),
		tools: {
			...goalTools,
			list_goals: readTool("Inspect the exact current goal definition.", {
				goals: [{ ...goal, target: "/workspace" }],
			}),
			scrape_page: readTool("Inspect the current workspace route.", {
				content:
					"Authenticated visitors reach /workspace. Tracking is present. This is the correct destination for the saved workspace goal; no code or definition mismatch has been established.",
			}),
		},
		check: ({ outcome }) =>
			outcome.next.type === "act"
				? [
						"Proposed another repair although the inspected definition already measures the correct route",
					]
				: [],
	},
	{
		id: "funnel-conditions-repair",
		input: input({
			signal: {
				...defaultSignal,
				signalKey: "funnel:account-journey",
				entity: {
					type: "funnel",
					id: "account-journey",
					label: "Account creation journey",
				},
				metric: {
					label: "Completed journeys",
					current: 0,
					previous: 164,
					format: "number",
				},
			},
			evidence: [
				"Business meaning: tracks landing-page visitors who finish creating an account. Inspect the final emitted event and the complete saved definition.",
			],
		}),
		tools: {
			list_funnels: readTool("Read complete saved funnel definitions.", {
				funnels: [
					{
						id: "account-journey",
						name: "Account creation journey",
						filters: [],
						steps: [
							{ name: "Landing", type: "PAGE_VIEW", target: "/start" },
							{
								name: "Account created",
								type: "EVENT",
								target: "account_started",
								conditions: { plan: "paid" },
							},
						],
					},
				],
			}),
			scrape_page: readTool(
				"Inspect the current account creation emitter and workflow.",
				{
					content:
						"The successful account-creation handler now emits account_completed. account_started was retired. The first step /start remains correct. Replace only the final event target. Stored step conditions must be preserved; analytics does not currently evaluate those conditions, so this does not establish a paid-only cohort.",
				}
			),
		},
		check: ({ outcome }) => {
			if (
				outcome.next.type !== "act" ||
				outcome.next.execution?.operation !== "edit"
			) {
				return ["Missed the verified executable funnel repair"];
			}
			const step = outcome.next.execution.changes.steps?.[1];
			return step?.target === "account_completed" &&
				step.conditions?.plan === "paid"
				? []
				: [
						"Did not preserve the step conditions while repairing the final event",
					];
		},
	},
	{
		id: "partial-table-not-absence",
		input: input({
			signal: {
				...defaultSignal,
				signalKey: "goal:workspace-goal",
				entity: { type: "goal", id: goal.id, label: goal.name },
				metric: {
					label: "Workspace visits",
					current: 0,
					previous: 0,
					format: "number",
				},
				changePercent: 0,
			},
			evidence: [
				"Business meaning: counts workspace visits. The aggregate top-pages list is partial; inspect the exact target if its absence matters.",
			],
		}),
		tools: {
			list_goals: goalTools.list_goals,
			scrape_page: readTool("Inspect public page context.", {
				content:
					"The product has a workspace behind authentication. No route mapping is visible in this public page.",
			}),
			get_data: tool({
				description:
					"Read pages; path=null returns top pages only. A specific path returns its exact full count.",
				inputSchema: z.object({ path: z.string().nullable() }).strict(),
				execute: ({ path }) => ({
					results: {
						pages: path
							? {
									data: [{ path, visitors: 0 }],
									rowCount: 1,
									returnedRows: 1,
									truncated: false,
								}
							: {
									data: [
										{ path: "/", visitors: 680 },
										{ path: "/docs", visitors: 164 },
									],
									rowCount: 31,
									returnedRows: 2,
									truncated: true,
								},
					},
				}),
			}),
		},
		check: ({ outcome }) => [
			...(outcome.rootCause === null
				? []
				: ["Invented a cause for an unchanged zero-volume goal"]),
			...(outcome.next.type === "act"
				? [
						"Changed or deleted a definition without an established replacement or invalid use",
					]
				: []),
			...(ABSENCE_CLAIM.test(JSON.stringify(outcome))
				? [
						"Claimed route absence; neither a partial table nor zero measured visits proves the route is absent",
					]
				: []),
		],
	},
	{
		id: "missing-connector",
		input: input({
			signal: {
				...defaultSignal,
				signalKey: "channel:organic",
				entity: {
					type: "channel",
					id: "organic",
					label: "Organic search visits",
				},
				metric: {
					label: "Organic search visits",
					current: 300,
					previous: 600,
					format: "number",
				},
				changePercent: -50,
			},
			evidence: [
				"Organic visits fell from 600 to 300. Other channels are unchanged; signup volume is unchanged. No search ranking, impression or index coverage data has been supplied.",
			],
		}),
		tools: {
			search_console: readTool(
				"Inspect search queries, impressions, and ranking positions.",
				{ error: "No Google account connected. Search Console is unavailable." }
			),
		},
		check: ({ outcome }, calls) => [
			...(outcome.rootCause === null
				? []
				: ["Inferred a cause from an unavailable connector"]),
			...(calls.filter((call) => call.name === "search_console").length > 1
				? ["Repeated an unavailable connector"]
				: []),
		],
	},
];

async function evaluate(
	agent: typeof runInsightAgent,
	fixture: QualityCase,
	directory: string,
	iteration: number,
	modelId: string
) {
	const id = `${fixture.id}-${iteration}`;
	const tracePath = resolve(directory, `${id}.jsonl`);
	const emit = (kind: string, value: unknown) =>
		appendFileSync(
			tracePath,
			`${JSON.stringify(
				{ time: new Date().toISOString(), kind, value },
				(_key, item) => {
					if (item && typeof item === "object" && item.type === "reasoning") {
						return { type: "reasoning", text: "[private reasoning omitted]" };
					}
					return typeof item === "bigint" ? item.toString() : item;
				}
			)}\n`,
			{ mode: 0o600 }
		);
	const calls: { name: string; input: unknown }[] = [];
	const model = wrapLanguageModel({
		model: createModelFromId(modelId),
		middleware: {
			specificationVersion: "v3",
			transformParams: ({ params }) => {
				emit("model.request", params);
				return Promise.resolve(params);
			},
			wrapGenerate: async ({ doGenerate }) => {
				const response = await Promise.resolve(doGenerate()).catch(
					(error: unknown) => {
						emit("model.error", {
							message: error instanceof Error ? error.message : String(error),
							statusCode:
								error && typeof error === "object" && "statusCode" in error
									? error.statusCode
									: null,
						});
						throw error;
					}
				);
				emit("model.response", {
					content: response.content.filter((item) => item.type !== "reasoning"),
					finishReason: response.finishReason,
					usage: response.usage,
				});
				return response;
			},
		},
	});
	const tools: ToolSet = Object.fromEntries(
		Object.entries(fixture.tools).map(([name, definition]) => [
			name,
			{
				...definition,
				execute: async (value: unknown, options) => {
					calls.push({ name, input: value });
					emit("tool.request", {
						name,
						input: value,
						toolCallId: options.toolCallId,
					});
					if (!definition.execute) {
						throw new Error("Synthetic tool needs an executor");
					}
					const output = await definition.execute(value, options);
					emit("tool.response", {
						name,
						output,
						toolCallId: options.toolCallId,
					});
					return output;
				},
			},
		])
	);
	const started = performance.now();
	emit("case.input", fixture.input);
	try {
		const result = await agent(fixture.input, {
			model,
			tools,
			onStepFinish: (step) => {
				emit("agent.step", {
					finishReason: step.finishReason,
					toolCalls: step.toolCalls,
					toolResults: step.toolResults,
					usage: step.usage,
				});
			},
		});
		const failures = fixture.check(result, calls);
		emit("case.result", { ...result, failures });
		return {
			id,
			completed: true,
			failures,
			durationMs: performance.now() - started,
			calls: calls.length,
			...result,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		emit("case.error", { message });
		return {
			id,
			completed: false,
			failures: [message],
			durationMs: performance.now() - started,
			calls: calls.length,
		};
	}
}

if (import.meta.main) {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			out: { type: "string" },
			runs: { type: "string", default: "2" },
			agent: { type: "string" },
			cases: { type: "string" },
			model: { type: "string", default: "openai/gpt-5.6-terra" },
		},
	});
	if (!values.out) {
		throw new Error(
			"Provide --out with a local directory for the report and observable traces."
		);
	}
	const runs = Number(values.runs);
	if (!Number.isInteger(runs) || runs < 1 || runs > 5) {
		throw new Error("--runs must be between 1 and 5");
	}
	const directory = resolve(values.out);
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const agent: typeof runInsightAgent = values.agent
		? (await import(resolve(values.agent))).runInsightAgent
		: runInsightAgent;
	const selectedIds = values.cases?.split(",");
	const selectedCases = selectedIds
		? qualityCases.filter((fixture) => selectedIds.includes(fixture.id))
		: qualityCases;
	if (
		selectedIds?.some(
			(id) => !qualityCases.some((fixture) => fixture.id === id)
		)
	) {
		throw new Error("Unknown case ID in --cases");
	}
	const results: Awaited<ReturnType<typeof evaluate>>[] = [];
	for (let iteration = 1; iteration <= runs; iteration++) {
		// Bounded batches keep provider pressure low and preserve independent case traces.
		for (let index = 0; index < selectedCases.length; index += 2) {
			const batch = await Promise.all(
				selectedCases
					.slice(index, index + 2)
					.map((fixture) =>
						evaluate(agent, fixture, directory, iteration, values.model)
					)
			);
			results.push(...batch);
			writeFileSync(
				resolve(directory, "results.json"),
				JSON.stringify({ model: values.model, results }, null, 2)
			);
			for (const result of batch) {
				process.stdout.write(
					`${result.id}: ${result.completed && result.failures.length === 0 ? "PASS" : "FAIL"} ${result.failures.join("; ")}\n`
				);
			}
		}
	}
	if (results.some((result) => result.failures.length > 0)) {
		process.exitCode = 1;
	}
}
