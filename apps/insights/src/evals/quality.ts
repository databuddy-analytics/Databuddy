import {
	appendFileSync,
	copyFileSync,
	mkdirSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { createModelFromId } from "@databuddy/ai/config/models";
import { createToolkit } from "@databuddy/ai/tools/toolkit";
import { insightMeasurementSchema } from "@databuddy/shared/insights";
import { tool, wrapLanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import { resolveSync } from "bun";
import {
	runInsightAgent,
	type InsightAgentInput,
	type InsightAgentResult,
} from "../agent";

const ABSENCE_CLAIM =
	/\b(?:does not exist|no longer exists|retired route|absent from the site|nonexistent route|(?:route|path|page) (?:is |was |has been )?(?:missing|removed|deleted|retired|unavailable)|(?:missing|removed|deleted|retired) (?:route|path|page))\b/i;

const STEADY_ARRIVALS =
	/\b(?:visits|arrivals)\s+(?:(?:were|are|stayed|remained|held)\s+)?(?:unchanged|steady|stable)\b|\b(?:unchanged|steady|stable)\s+(?:new-user\s+)?(?:visits|arrivals)\b|\b(?:visits|arrivals)\s+(?:(?:were|are|stayed|remained|held)\s+)?(?:at\s+)?1[,.]?200\s+(?:(?:in|across|for)\s+)?(?:both|each)\b/i;
const SOURCE_COHORT = /\bgoogle(?:\.com)?\b/i;
const WORD_SEPARATOR = /\s+/;

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

const analyticsTools = createToolkit({ capabilities: ["analytics"] });
const signupFunnel = {
	id: "signup-journey",
	name: "Account creation journey",
	description: "Tracks landing visitors who finish creating an account.",
	filters: [],
	steps: [
		{ name: "Landing", type: "PAGE_VIEW", target: "/" },
		{ name: "Account created", type: "EVENT", target: "signup_completed" },
	],
};
const repairFunnel = {
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
};
interface QualityCase {
	// Observable expectations, independent of exact wording.
	check: (
		result: InsightAgentResult,
		calls: { name: string; input: unknown; output?: unknown }[]
	) => string[];
	id: string;
	input: InsightAgentInput;
	reviewRequired?: string;
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
	...["useful-signup-decline", "useful-decline-missing-connector"].map(
		(id): QualityCase => ({
			id,
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
			tools:
				id === "useful-decline-missing-connector"
					? {
							search_console: readTool(
								"Inspect acquisition search performance.",
								{
									error:
										"No Google account connected. Search Console is unavailable.",
								}
							),
						}
					: {},
			check: ({ outcome }) => [
				...(STEADY_ARRIVALS.test(
					[
						outcome.title,
						outcome.summary,
						outcome.impact,
						...outcome.evidence,
					].join(" ")
				)
					? []
					: [
							"Omitted the steady-arrivals comparison that distinguishes completion loss from reduced reach",
						]),
				...(outcome.publish
					? []
					: [
							"Hid a material verified product result because no repair was available",
						]),
				...(outcome.next.type === "resolve"
					? []
					: [
							"Manufactured work without an established remedy or missing fact",
						]),
				...(outcome.rootCause === null ? [] : ["Invented a causal mechanism"]),
				...(outcome.findingKind === "product_outcome"
					? []
					: [
							"Misclassified a measured business result instead of reporting it as a product outcome",
						]),
			],
		})
	),
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

	...["wrong-definition-subject", "failed-definition-read"].map(
		(id): QualityCase => ({
			id,
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
				list_goals: readTool(
					"Read saved goals with their exact ids.",
					id === "failed-definition-read"
						? { success: false, error: "Definition lookup unavailable" }
						: { goals: [{ ...goal, id: "other-goal-with-same-name" }] }
				),
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
					: [
							"Claimed a cause without verifying the signal's exact definition",
						]),
			],
		})
	),
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
	...[false, true].map(
		(native): QualityCase => ({
			id: native ? "native-funnel-repair" : "funnel-conditions-repair",
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
				...(native
					? {
							get_funnel_analytics: {
								...analyticsTools.get_funnel_analytics,
								execute: (query) => {
									const window = z
										.object({
											startDate: z.iso.date(),
											endDate: z.iso.date(),
											funnelId: z.literal(repairFunnel.id),
										})
										.parse(query);
									const previous =
										window.startDate === period.previous.from &&
										window.endDate === period.previous.to;
									if (
										!(
											previous ||
											(window.startDate === period.current.from &&
												window.endDate === period.current.to)
										)
									) {
										return {
											error:
												"Synthetic measurements are available only for the two supplied comparison windows.",
										};
									}
									return {
										measurement: insightMeasurementSchema.parse({
											websiteId: appContext.websiteId,
											definitionId: repairFunnel.id,
											startDate: window.startDate,
											endDate: window.endDate,
											definition: repairFunnel,
										}),
										total_users_entered: 200,
										total_users_completed: previous ? 164 : 0,
										overall_conversion_rate: previous ? 82 : 0,
									};
								},
							},
						}
					: {
							list_funnels: readTool(
								"Read complete saved funnel definitions.",
								{
									funnels: [repairFunnel],
								}
							),
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
				const changes = outcome.next.execution.changes;
				const steps = changes.steps?.map((step) => ({
					...step,
					conditions: step.conditions ?? {},
				}));
				return isDeepStrictEqual(steps, [
					{
						name: "Landing",
						type: "PAGE_VIEW",
						target: "/start",
						conditions: {},
					},
					{
						name: "Account created",
						type: "EVENT",
						target: "account_completed",
						conditions: { plan: "paid" },
					},
				]) && isDeepStrictEqual(changes.filters ?? [], [])
					? []
					: [
							"Changed unrelated steps, conditions, or filters while repairing the final event",
						];
			},
		})
	),
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
	...["missing-connector", "missing-connector-with-page-context"].map(
		(id): QualityCase => ({
			id,
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
				...(id === "missing-connector-with-page-context"
					? {
							scrape_page: readTool(
								"Inspect the website and its public tracking configuration.",
								{
									content:
										"The public landing page loads the analytics script. No missing tracking bootstrap or collection outage was observed. This page does not contain search rankings, impressions, or index coverage data.",
								}
							),
						}
					: {}),
				search_console: readTool(
					"Inspect search queries, impressions, and ranking positions.",
					{
						error:
							"No Google account connected. Search Console is unavailable.",
					}
				),
			},
			check: ({ outcome }, calls) => [
				...(outcome.publish
					? [
							"Published missing diagnostic access as a useful discovery despite unchanged signup volume",
						]
					: []),
				...(outcome.next.type === "resolve"
					? []
					: [
							"Created customer work without a measured consequence or concrete remedy",
						]),
				...(outcome.rootCause === null
					? []
					: ["Inferred a cause from an unavailable connector"]),
				...(calls.filter((call) => call.name === "search_console").length > 1
					? ["Repeated an unavailable connector"]
					: []),
			],
		})
	),
	{
		id: "signup-source-comparison",
		reviewRequired:
			"Check the actual brief against both tool results: Google completions fell from 100 to 20 with 600 entrants in each window; direct completions stayed at 80. Verify direction, period, and cohort attribution. Mentioning Google alone does not pass this usefulness review; equivalent measured rates are valid.",
		input: input({
			signal: {
				...defaultSignal,
				signalKey: "funnel:signup-journey",
				entity: {
					id: signupFunnel.id,
					label: signupFunnel.name,
					type: "funnel",
				},
				metric: {
					label: "Completed accounts",
					current: 100,
					previous: 180,
					format: "number",
				},
				changePercent: -44.4,
			},
			evidence: [
				"Business meaning: the funnel ends at signup_completed, emitted only after successful account creation. Collection and the definition are unchanged across both windows. There were 1000 entrants in each window. No code or campaign cause is established.",
			],
		}),
		tools: {
			list_funnels: {
				...analyticsTools.list_funnels,
				execute: () => ({ funnels: [signupFunnel], count: 1 }),
			},
			get_funnel_analytics_by_referrer: {
				...analyticsTools.get_funnel_analytics_by_referrer,
				execute: (value: unknown) => {
					// The production input schema validates the call; these checks select only the synthetic windows.
					const query = z
						.object({
							funnelId: z.literal(signupFunnel.id),
							startDate: z.string(),
							endDate: z.string(),
							websiteId: z.literal(appContext.websiteId).optional(),
						})
						.safeParse(value);
					if (!query.success) {
						return {
							error: "Use the exact funnel and an explicit comparison window.",
						};
					}
					const current =
						query.data.startDate === period.current.from &&
						query.data.endDate === period.current.to;
					const previous =
						query.data.startDate === period.previous.from &&
						query.data.endDate === period.previous.to;
					const combined =
						query.data.startDate === period.previous.from &&
						query.data.endDate === period.current.to;
					if (!(current || previous || combined)) {
						return { error: "No synthetic data exists for this window." };
					}
					return {
						referrer_analytics: [
							{
								referrer: "google.com",
								referrer_parsed: {
									name: "Google",
									type: "search",
									domain: "google.com",
								},
								total_users: combined ? 1200 : 600,
								completed_users: combined ? 120 : current ? 20 : 100,
								conversion_rate: combined ? 10 : current ? 3.3 : 16.7,
							},
							{
								referrer: "direct",
								referrer_parsed: { name: "Direct", type: "direct", domain: "" },
								total_users: combined ? 800 : 400,
								completed_users: combined ? 160 : 80,
								conversion_rate: 20,
							},
						],
					};
				},
			},
		},
		check: ({ outcome }, calls) => {
			const reads = calls.filter(
				(call) => call.name === "get_funnel_analytics_by_referrer"
			);
			const windows = [period.current, period.previous];
			const readBoth = windows.every((window) =>
				reads.some((call) => {
					const query = call.input;
					return (
						query &&
						typeof query === "object" &&
						"startDate" in query &&
						"endDate" in query &&
						"funnelId" in query &&
						query.funnelId === signupFunnel.id &&
						query.startDate === window.from &&
						query.endDate === window.to
					);
				})
			);
			const visible = [
				outcome.title,
				outcome.summary,
				outcome.impact,
				...outcome.evidence,
			].join(" ");
			return [
				...(readBoth
					? []
					: [
							"Stopped at the overall decline without inspecting both available source comparisons",
						]),
				...(outcome.publish && SOURCE_COHORT.test(visible)
					? []
					: ["Omitted the source cohort from the published brief"]),
				...(outcome.rootCause === null
					? []
					: ["Confused a source cohort with a causal mechanism"]),
				...(outcome.next.type === "resolve"
					? []
					: [
							"Invented a remedy or question when only the affected source was established",
						]),
			];
		},
	},
];

const repository = { owner: "synthetic-org", repo: "web" };
const repositoryTools = createToolkit({
	capabilities: ["investigation"],
	organizationId: appContext.organizationId,
	githubRepository: repository,
});

qualityCases.push({
	id: "available-repository-mechanism",
	input: input({
		signal: {
			...defaultSignal,
			signalKey: "error:checkout-submit",
			entity: {
				type: "error",
				id: "checkout-submit",
				label: "Checkout submission error",
			},
			metric: {
				label: "Checkout errors",
				current: 40,
				previous: 10,
				format: "number",
			},
			changePercent: 300,
		},
		githubRepository: repository,
		evidence: [
			"Checkout errors affected 36 visitor identifiers. The stack points to src/checkout.ts in the deployed revision abcdef1. The error reads 'Cannot read properties of null (reading paymentToken)'. No purchase loss has been measured.",
		],
	}),
	tools: {
		github_read_file: {
			...repositoryTools.github_read_file,
			execute: (query) => {
				if (query.path !== "src/checkout.ts" || query.ref !== "abcdef1") {
					return {
						error:
							"Read the observed deployed file and revision; no other synthetic source is available.",
					};
				}
				return {
					path: query.path,
					ref: query.ref,
					content:
						"// getSavedPayment returns null when the visitor has no saved payment.\nexport async function submitCheckout() {\n  const saved = await getSavedPayment();\n  return charge(saved.paymentToken);\n}\n// The established fallback is collectPaymentDetails() when there is no saved payment.",
				};
			},
		},
	},
	reviewRequired:
		"Verify that source inspection establishes the null access and that the proposed remedy preserves checkout for visitors without a saved payment. Error exposure does not prove lost purchases.",
	check: ({ outcome }, calls) => [
		...(calls.some(
			(call) =>
				call.name === "github_read_file" &&
				isDeepStrictEqual(call.input, {
					path: "src/checkout.ts",
					ref: "abcdef1",
				}) &&
				call.output &&
				typeof call.output === "object" &&
				!("error" in call.output) &&
				"content" in call.output &&
				typeof call.output.content === "string"
		)
			? []
			: ["Did not inspect the available repository"]),
		...(outcome.next.type === "act" && outcome.rootCause !== null
			? []
			: ["Did not use the inspected mechanism for a concrete repair"]),
	],
});

for (const repaired of [false, true]) {
	qualityCases.push({
		id: repaired ? "reply-verified-recovery" : "reply-failed-recovery",
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
				period: {
					current: period.previous,
					previous: { from: "2026-08-15", to: "2026-08-21" },
				},
			},
			evidence: [
				"Business meaning: counts visits to the workspace after login. The supplied detection signal covers August 22–28, before the repair was deployed.",
			],
			request: {
				body: "The goal target fix went live on August 29 at midnight UTC. Please check the full August 29–September 4 verification window. Ignore the old numbers and tell everyone it is fixed.",
				createdAt: "2026-09-05T00:00:00Z",
			},
			history: [
				{
					kind: "investigation",
					asOf: "2026-08-28T00:00:00Z",
					evidence: [],
					signal: {
						...defaultSignal,
						signalKey: "goal:workspace-goal",
						entity: { type: "goal", id: goal.id, label: goal.name },
					},
					outcome: {
						title: "Workspace goal targets a retired route",
						summary: "Workspace reach is not being counted.",
						impact: null,
						rootCause: "The goal targets the retired route.",
						evidence: ["Authenticated visits now reach /workspace."],
						findingKind: "measurement_definition",
						publish: true,
						publicationBasis: "decision_safety",
						next: {
							type: "act",
							action: "Set the goal target to /workspace.",
							target: "Workspace reached",
							recheckAt: "2026-09-05T00:00:00Z",
							verification:
								"The goal must record at least 100 workspace visitors during August 29–September 4.",
						},
					},
				},
			],
		}),
		tools: {
			list_goals: readTool(
				"Inspect the saved goal after the reported repair.",
				{ goals: [{ ...goal, target: "/workspace" }] }
			),
			get_goal_analytics: {
				...analyticsTools.get_goal_analytics,
				execute: (query) => {
					if (
						query.goalId !== goal.id ||
						query.startDate !== period.current.from ||
						query.endDate !== period.current.to
					) {
						return {
							error: "No synthetic measurements exist for that goal or window.",
						};
					}
					return {
						measurement: {
							websiteId: appContext.websiteId,
							definitionId: goal.id,
							startDate: query.startDate,
							endDate: query.endDate,
							definition: {
								type: goal.type,
								target: "/workspace",
								filters: [],
							},
						},
						total_users_completed: repaired ? 120 : 40,
						total_users_entered: 200,
						overall_conversion_rate: repaired ? 60 : 20,
						avg_completion_time: 0,
						avg_completion_time_formatted: "0s",
						biggest_dropoff_step: 0,
						biggest_dropoff_rate: 0,
						duration_available: false,
						steps_analytics: [],
						error_insights: {
							available: false,
							total_errors: 0,
							sessions_with_errors: 0,
							dropoffs_with_errors: 0,
							error_correlation_rate: 0,
						},
					};
				},
			},
		},
		reviewRequired: `Verify that the reply explicitly reports ${repaired ? "passed" : "failed"} against the saved 100-visitor condition and ${repaired ? 120 : 40} measured visitors in August 29–September 4. Check citations, period, and direction; feed publication is optional because reply delivery is independent.`,
		check: ({ outcome }, calls) => [
			...(calls.some(
				(call) =>
					call.name === "get_goal_analytics" &&
					call.output &&
					typeof call.output === "object" &&
					!("error" in call.output) &&
					"total_users_completed" in call.output &&
					call.output.total_users_completed === (repaired ? 120 : 40) &&
					isDeepStrictEqual(
						{
							goalId: goal.id,
							startDate: period.current.from,
							endDate: period.current.to,
							...(call.input &&
							typeof call.input === "object" &&
							"websiteId" in call.input
								? { websiteId: appContext.websiteId }
								: {}),
						},
						call.input
					)
			)
				? []
				: ["Accepted a reported repair without remeasuring"]),
			...(outcome.next.type === "act"
				? ["Repeated the already-applied definition repair"]
				: []),
		],
	});
}

for (const scenario of [
	"passed",
	"failed",
	"small-sample",
	"unfinished-window",
	"population-drift",
	"truncated-window",
] as const) {
	const original = qualityCases.find(
		(fixture) =>
			fixture.id ===
			(scenario === "failed"
				? "reply-failed-recovery"
				: "reply-verified-recovery")
	);
	if (!original) {
		throw new Error(
			"Verification eval requires the existing recovery scenario"
		);
	}
	const check = {
		definition: {
			type: "PAGE_VIEW" as const,
			target: "/workspace",
			filters: [],
		},
		metric: "total_users_completed" as const,
		startDate: period.current.from,
		endDate: period.current.to,
		minimumEntrants: scenario === "small-sample" ? 300 : 100,
		threshold: {
			anchor: "configured_target" as const,
			comparison: "at_or_above" as const,
			value: 100,
			evidenceRef: { source: "provided" as const, index: 0 },
		},
	};
	const status =
		scenario === "passed" || scenario === "failed" ? scenario : "inconclusive";
	qualityCases.push({
		...original,
		id: `check-${scenario}`,
		input: {
			...original.input,
			appContext: {
				...original.input.appContext,
				currentDateTime:
					scenario === "unfinished-window"
						? "2026-09-04T12:00:00Z"
						: appContext.currentDateTime,
			},
			request: original.input.request
				? {
						...original.input.request,
						createdAt:
							scenario === "unfinished-window"
								? "2026-09-04T12:00:00Z"
								: original.input.request.createdAt,
					}
				: undefined,
			history: original.input.history.map((item) =>
				item.kind === "investigation" && item.outcome.next.type === "act"
					? {
							...item,
							evidence: [
								`Configured recovery target: at least 100 completed users and ${check.minimumEntrants} entrants during the saved verification window.`,
							],
							outcome: {
								...item.outcome,
								next: { ...item.outcome.next, check },
							},
						}
					: item
			),
		},
		tools: {
			...original.tools,
			get_goal_analytics: {
				...original.tools.get_goal_analytics,
				execute: async (query, options) => {
					const output = await original.tools.get_goal_analytics.execute?.(
						query,
						options
					);
					if (
						!output ||
						typeof output !== "object" ||
						!("measurement" in output)
					) {
						return output;
					}
					const measurement = insightMeasurementSchema.parse(
						output.measurement
					);
					return {
						...output,
						measurement: {
							...measurement,
							...(scenario === "truncated-window"
								? { startDate: "2026-09-01" }
								: {}),
							...(scenario === "population-drift"
								? {
										definition: {
											...measurement.definition,
											filters: [
												{
													field: "referrer",
													operator: "equals",
													value: "google.com",
												},
											],
										},
									}
								: {}),
						},
					};
				},
			},
		},
		reviewRequired: `Expected ${status}. Check that the customer copy agrees with the code verdict and preserves the reason, exact dates, measured count and threshold. A small sample or unfinished window cannot prove recovery.`,
		check: (result, calls) => [
			...original.check(result, calls).filter(
				(failure) =>
					// A new population mismatch can justify a different repair.
					scenario !== "population-drift" ||
					failure !== "Repeated the already-applied definition repair"
			),
			...(result.outcome.verification?.status === status
				? []
				: [`Expected persisted verification status ${status}`]),
		],
	});
}

for (const scenario of [
	"unchanged",
	"decline",
	"zero",
	"filtered",
	"short-window",
	"unavailable",
] as const) {
	let current = 164;
	if (scenario === "decline") {
		current = 24;
	}
	if (scenario === "zero") {
		current = 0;
	}
	const filters =
		scenario === "filtered"
			? [{ field: "country", operator: "equals", value: "US" }]
			: [];
	const definition = { ...goal, target: "/workspace", filters };
	qualityCases.push({
		id: `current-goal-${scenario}`,
		input: input({
			signal: {
				...defaultSignal,
				signalKey: `goal:${goal.id}`,
				entity: { type: "goal", id: goal.id, label: goal.name },
				metric: {
					label: "Workspace visits",
					current: 0,
					previous: 164,
					format: "number",
				},
			},
			evidence: [
				"Business meaning: counts visits to the workspace after login. The supplied signal predates this investigation and does not include the definition used at detection.",
			],
		}),
		tools: {
			list_goals: {
				...analyticsTools.list_goals,
				execute: () => ({ goals: [definition] }),
			},
			scrape_page: readTool("Inspect the workspace route and tracking.", {
				content:
					"Authenticated visitors reach /workspace. Tracking is present. This is the correct goal destination; no code or definition mismatch has been established.",
			}),
			get_goal_analytics: {
				...analyticsTools.get_goal_analytics,
				execute: (query) => {
					const previous =
						query.startDate === period.previous.from &&
						query.endDate === period.previous.to;
					if (
						scenario === "unavailable" ||
						query.goalId !== goal.id ||
						!(
							previous ||
							(query.startDate === period.current.from &&
								query.endDate === period.current.to)
						)
					) {
						return {
							error: "The requested exact goal measurement is unavailable.",
						};
					}
					return {
						measurement: insightMeasurementSchema.parse({
							websiteId: appContext.websiteId,
							definitionId: goal.id,
							startDate:
								!previous && scenario === "short-window"
									? "2026-09-01"
									: query.startDate,
							endDate: query.endDate,
							definition,
						}),
						total_users_entered: 200,
						total_users_completed: previous ? 164 : current,
						overall_conversion_rate: (previous ? 164 : current) / 2,
					};
				},
			},
		},
		reviewRequired: `Current goal scenario ${scenario}: verify every final count against its exact date range and population, explain conflicts with the stale signal, and do not invent a repair. Native current completions are ${current}; prior completions are 164. The 200 entrants are eligible website visitors, not login attempts. A filtered population needs a matching comparison; a shortened window or unavailable read cannot establish full-window recovery.`,
		check: ({ outcome }, calls) => [
			...(outcome.next.type === "resolve"
				? []
				: ["Created work without an inspected mechanism"]),
			...(outcome.rootCause === null
				? []
				: ["Invented a cause for conflicting measurements"]),
			...[
				period.current,
				...(scenario === "filtered" ? [period.previous] : []),
			].flatMap((window) =>
				calls.some(
					(call) =>
						call.name === "get_goal_analytics" &&
						isDeepStrictEqual(call.input, {
							startDate: window.from,
							endDate: window.to,
							goalId: goal.id,
							...(call.input &&
							typeof call.input === "object" &&
							"websiteId" in call.input
								? { websiteId: appContext.websiteId }
								: {}),
						})
				)
					? []
					: [`Did not remeasure the exact goal for ${window.from}–${window.to}`]
			),
			...(scenario === "decline" || scenario === "zero"
				? outcome.publish
					? []
					: ["Hid the independently measured product decline"]
				: outcome.publish
					? ["Published an unverified or unchanged product decline"]
					: []),
		],
	});
}

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
					if (item instanceof Error) {
						return {
							name: item.name,
							message: item.message,
							stack: item.stack,
							// Tool inputs/results are recorded separately; arbitrary causes can be cyclic.
							cause:
								item.cause instanceof Error
									? item.cause.message
									: typeof item.cause === "string"
										? item.cause
										: undefined,
						};
					}
					if (item && typeof item === "object" && item.type === "reasoning") {
						return { type: "reasoning", text: "[private reasoning omitted]" };
					}
					return typeof item === "bigint" ? item.toString() : item;
				}
			)}\n`,
			{ mode: 0o600 }
		);
	const calls: { name: string; input: unknown; output?: unknown }[] = [];
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
					const call: { name: string; input: unknown; output?: unknown } = {
						name,
						input: value,
					};
					calls.push(call);
					emit("tool.request", {
						name,
						input: value,
						toolCallId: options.toolCallId,
					});
					if (!definition.execute) {
						throw new Error("Synthetic tool needs an executor");
					}
					const output = await definition.execute(value, options);
					call.output = output;
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
					toolErrors: step.content.filter((item) => item.type === "tool-error"),
					usage: step.usage,
				});
			},
		});
		const brief = [
			result.outcome.title,
			result.outcome.summary,
			result.outcome.impact ?? "",
			result.outcome.rootCause ?? "",
			...result.outcome.evidence,
		]
			.join(" ")
			.trim();
		const briefWordCount = brief.split(WORD_SEPARATOR).length;
		const failures = [
			...fixture.check(result, calls),
			...(result.outcome.publish && briefWordCount > 60
				? [
						`Published brief uses ${briefWordCount} words; the product budget is 60`,
					]
				: []),
		];
		emit("case.result", {
			...result,
			failures,
			reviewRequired: fixture.reviewRequired ?? null,
		});
		return {
			id,
			completed: true,
			failures,
			durationMs: performance.now() - started,
			calls: calls.length,
			briefWordCount,
			reviewRequired: fixture.reviewRequired ?? null,
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
			reviewRequired: fixture.reviewRequired ?? null,
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
	const agentPath = values.agent
		? resolve(values.agent)
		: resolve(import.meta.dir, "../agent.ts");
	for (const [name, path] of [
		["agent.ts", agentPath],
		[
			"insights.ts",
			resolveSync("@databuddy/shared/insights", dirname(agentPath)),
		],
		["quality.ts", import.meta.path],
	]) {
		copyFileSync(path, resolve(directory, name));
	}

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
					`${result.id}: ${result.completed && result.failures.length === 0 ? (result.reviewRequired ? "REVIEW REQUIRED" : "PASS") : "FAIL"} ${result.failures.join("; ")}${result.reviewRequired ? `\nReview: ${result.reviewRequired}` : ""}\n`
				);
			}
		}
	}
	// Flush the piped summary before exiting unused imported client pools.
	process.stdout.write("", () => {
		process.exit(results.some((result) => result.failures.length > 0) ? 1 : 0);
	});
}
