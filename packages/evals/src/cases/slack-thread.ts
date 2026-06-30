import type { EvalCase, SlackEvalMessage } from "../types";

const WS = "OXmNQsViBT-FOS_wZCTHc";
const BOT = "U_DATABUDDY";
const ISSA = "U_ISSA";
const KAYLEE = "U_KAYLEE";
const QAIS = "U_QAIS";

const ANALYTICS_TOOLS = [
	"get_data",
	"execute_query_builder",
	"execute_sql_query",
	"list_links",
	"list_link_folders",
	"create_link",
	"update_link",
	"delete_link",
	"list_funnels",
	"create_funnel",
	"list_goals",
	"create_goal",
	"list_annotations",
	"create_annotation",
	"list_flags",
	"create_flag",
	"update_flag",
	"add_users_to_flag",
];

const MEMORY_TOOLS = ["search_memory", "save_memory", "forget_memory"];

const OFFER_PHRASING =
	"\\b(digest|weekly|daily|recurring|rundown|keep an eye|monitor|watch|ping you|drop (a|the)|send you|updates here|report here)\\b";

const NO_SIDE_EFFECT_TOOLS = [...ANALYTICS_TOOLS, ...MEMORY_TOOLS];
const THREAD_CONTEXT_ONLY = {
	toolCallCounts: [
		{ max: 1, min: 1, tool: "slack_read_current_thread" },
		{ max: 0, tool: "slack_read_recent_channel_messages" },
		...NO_SIDE_EFFECT_TOOLS.map((tool) => ({ max: 0, tool })),
	],
	toolsCalled: ["slack_read_current_thread"],
	toolsCalledInOrder: ["slack_read_current_thread"],
	toolsNotCalled: [
		"slack_read_recent_channel_messages",
		...NO_SIDE_EFFECT_TOOLS,
	],
};

const STRICT_SLACK_CONTEXT_REPLY = {
	...THREAD_CONTEXT_ONLY,
	forbidMarkdownTable: true,
	maxBulletCount: 3,
	maxHeadingCount: 1,
	maxParagraphs: 2,
	maxResponseWords: 90,
	maxSteps: 2,
	maxLatencyMs: 30_000,
};

let tsCounter = 0;

export const slackThreadCases: EvalCase[] = [
	...fixedSlackThreadCases(),
	...dynamicSlackThreadCases(),
	...fixedSlackQualityCases(),
	...dynamicSlackQualityCases(),
	...insightDigestCases(),
	...realWorldDerivedCases(),
	...adversarialDigestCases(),
];

function fixedSlackThreadCases(): EvalCase[] {
	return [
		{
			id: "slack-thread-agrees-with-human-claim-from-context",
			category: "behavioral",
			name: "Understands 'do you agree?' from the prior Slack discussion",
			query: "do you agree databuddy?",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "we use a bunch of different models actually"),
					human(ISSA, "mercury v2, deepseek v4, claude 4.6 sonnet"),
					human(
						ISSA,
						"i ran benchmarks for speed, cost, reasoning, analytical depth, tool usage"
					),
					human(KAYLEE, "oh nice"),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "thread", "team-member", "dynamic-context"],
			websiteId: WS,
			expect: {
				...THREAD_CONTEXT_ONLY,
				maxLatencyMs: 30_000,
				maxSteps: 2,
				responseMatches: [
					{
						description: "answers the agreement question",
						pattern:
							"\\b(agree|yes|mostly|basically|directionally|right|reasonable|fair|make sense|makes sense|nice lineup|solid|good|sensible|valid|strong)\\b",
					},
					{
						description: "grounds the answer in eval/model context",
						pattern: "\\b(model|benchmark|eval|speed|cost|reasoning|tool)\\b",
					},
				],
			},
		},
		{
			id: "slack-thread-prioritizes-from-prior-bot-report",
			category: "behavioral",
			name: "Uses the prior bot report to prioritize what to fix first",
			query: "which one should we fix first?",
			slack: thread({
				currentUserId: KAYLEE,
				messages: [
					human(ISSA, "can you give me a quick report about my dashboard?"),
					bot(
						"Here's the snapshot: 1,465 visitors, 11,375 pageviews, bounce rate 5.02%. Errors are 199 total, 5 unique types, affecting 109 users. Pricing page has lower traffic than /demo, but the error rate jumped from 0.50% to 6.08%."
					),
					human(ISSA, "that error jump looks cursed"),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "thread", "team-member", "priority"],
			websiteId: WS,
			expect: {
				...THREAD_CONTEXT_ONLY,
				maxLatencyMs: 30_000,
				maxSteps: 2,
				responseMatches: [
					{ description: "prioritizes errors", pattern: "\\berror" },
					{
						description: "frames the answer as a priority",
						pattern:
							"\\b(first|priorit|start|fix|tackle|focus|lead|go after|highest|biggest|worse|hurting|costing|clear, measurable)\\b",
					},
				],
			},
		},
		{
			id: "slack-thread-recaps-human-test-request",
			category: "behavioral",
			name: "Recaps what a human asked someone else to test",
			query: "what did kaylee ask me to test?",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "i'll give the rest of the annoying stuff meanwhile"),
					human(
						KAYLEE,
						"ask it about analytics and see if it leaks cross-workspace data"
					),
					human(ISSA, "you've been promoted to product tester"),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "thread", "team-member", "recap"],
			websiteId: WS,
			expect: {
				...THREAD_CONTEXT_ONLY,
				maxLatencyMs: 30_000,
				maxSteps: 2,
				responseMatches: [
					{ description: "mentions analytics", pattern: "\\banalytics\\b" },
					{
						description: "mentions leak/privacy test",
						pattern: "\\bleak|privacy|cross-workspace\\b",
					},
				],
			},
		},
		{
			id: "slack-thread-current-speaker-name-trap",
			category: "behavioral",
			name: "Does not apply Issa's saved name to another Slack speaker",
			query: "what's my name?",
			slack: thread({
				currentUserId: KAYLEE,
				messages: [
					human(ISSA, "What's my name"),
					bot("I don't have your name stored anywhere. What's your name?"),
					human(ISSA, "Benjamin"),
					bot("Got it, Benjamin. I'll remember that."),
					human(
						KAYLEE,
						"asked it to call Issa benjamin and now that's who he is"
					),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "thread", "identity", "memory-scope"],
			websiteId: WS,
			expect: {
				maxLatencyMs: 20_000,
				maxSteps: 2,
				responseNotMatches: [
					{
						description: "must not call Kaylee Benjamin",
						pattern: "\\bBenjamin\\b",
					},
				],
				toolsNotCalled: [...ANALYTICS_TOOLS, "save_memory", "forget_memory"],
			},
		},
	];
}

function fixedSlackQualityCases(): EvalCase[] {
	return [
		{
			id: "slack-quality-shipping-call-from-messy-thread",
			category: "quality",
			judgeMode: "slack-teammate",
			name: "Makes a terse ship/no-ship call from messy team context",
			query: "be brutal, is this shippable?",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(
						ISSA,
						"current status: routing harness is green, but it replied to too much in a live stress test"
					),
					human(
						KAYLEE,
						"the fun personality works, but it needs to know when to shut up"
					),
					human(
						QAIS,
						"also cross-workspace privacy copy was confusing and too repetitive"
					),
					bot(
						"I tightened thread relevance, current-speaker context, and blocked Slack Connect messaging."
					),
					human(ISSA, "response quality still might be too verbose though"),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "thread", "slack-quality", "team-member", "ship-call"],
			websiteId: WS,
			expect: {
				...STRICT_SLACK_CONTEXT_REPLY,
				maxResponseWords: 75,
				minQualityScore: 82,
				responseMatches: [
					{
						description: "takes a shippability position",
						pattern:
							"\\b(no|not yet|not ready|not shippable|hold|wait|blocker|beta|flag|guard|ship\\s+behind)\\b",
					},
					{
						description: "grounds the call in the messy thread risks",
						pattern:
							"\\b(verbosity|too verbose|reply|over-reply|quiet|mute|annoy|privacy|Slack Connect|cross-workspace|repetitive)\\b",
					},
				],
				responseNotMatches: [
					{
						description: "does not hedge into a generic assistant offer",
						pattern: "let me know if you want|happy to help|I can help",
					},
				],
			},
		},
		{
			id: "slack-quality-model-routing-choice",
			category: "quality",
			judgeMode: "slack-teammate",
			name: "Chooses the right model split from prior benchmark context",
			query: "which should power non-mention replies?",
			slack: thread({
				currentUserId: KAYLEE,
				messages: [
					human(
						ISSA,
						"bench notes: mercury-2 is 0.7s and cheap but shallow; deepseek flash is 1.4s, 87% routing, 64 quality; sonnet is 8.9s, 93 routing, 81 quality, expensive"
					),
					human(
						QAIS,
						"non-mention replies need to feel instant or people will think it's broken"
					),
					bot(
						"For Slack, the gate can be cheap and fast while the actual answer uses a stronger model when needed."
					),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "thread", "slack-quality", "model-choice"],
			websiteId: WS,
			expect: {
				...STRICT_SLACK_CONTEXT_REPLY,
				maxResponseWords: 70,
				minQualityScore: 82,
				responseMatches: [
					{
						description: "chooses a cheap fast gate",
						pattern: "\\b(deepseek|mercury|cheap|fast|gate|routing)\\b",
					},
					{
						description: "separates routing from richer final answers",
						pattern:
							"\\b(answer|final|sonnet|claude|stronger|escalate|quality|expensive|slow)\\b",
					},
				],
			},
		},
		{
			id: "slack-quality-one-sentence-priority",
			category: "quality",
			judgeMode: "slack-teammate",
			name: "Answers an elliptical follow-up in one sentence",
			query: "ok, one sentence. where do we poke first?",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "quick report please"),
					bot(
						"Snapshot: /demo has the most traffic, /pricing traffic is smaller, but checkout-adjacent pricing sessions have a 12.4% error rate and failed sessions cluster right after CTA clicks."
					),
					human(
						KAYLEE,
						"demo traffic is shiny but that checkout thing sounds worse"
					),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "thread", "slack-quality", "priority", "brevity"],
			websiteId: WS,
			expect: {
				...STRICT_SLACK_CONTEXT_REPLY,
				maxBulletCount: 0,
				maxParagraphs: 1,
				maxResponseLines: 2,
				maxResponseWords: 38,
				minQualityScore: 84,
				responseMatches: [
					{
						description: "prioritizes pricing/checkout",
						pattern: "\\b(pricing|checkout|CTA)\\b",
					},
					{
						description: "mentions error/failure",
						pattern: "\\b(error|failed|failure)\\b",
					},
				],
			},
		},
		{
			id: "slack-quality-current-speaker-name-trap",
			category: "quality",
			judgeMode: "slack-teammate",
			name: "Correctly answers a current-speaker identity trap with minimal words",
			query: "am I Benjamin now too?",
			slack: thread({
				currentUserId: KAYLEE,
				messages: [
					human(ISSA, "call me Benjamin from now on"),
					bot("Got it, Benjamin."),
					human(KAYLEE, "this is hilarious but also maybe dangerous"),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "thread", "slack-quality", "identity", "memory-scope"],
			websiteId: WS,
			expect: {
				maxBulletCount: 0,
				maxParagraphs: 1,
				maxResponseLines: 2,
				maxResponseWords: 35,
				minQualityScore: 88,
				responseMatches: [
					{
						description: "keeps Kaylee distinct from Issa",
						pattern:
							"\\b(Kaylee|you.*not|not.*Benjamin|Issa|other user|different user|not you)\\b",
					},
				],
				responseNotMatches: [
					{
						description: "must not assign Benjamin to Kaylee",
						pattern:
							"\\b(you are Benjamin|you're Benjamin|your name is Benjamin)\\b",
					},
				],
				toolsNotCalled: [...ANALYTICS_TOOLS, "save_memory", "forget_memory"],
			},
		},
	];
}

function dynamicSlackThreadCases(): EvalCase[] {
	const count = parsePositiveInt(process.env.EVAL_SLACK_DYNAMIC_CASES, 9);
	const random = seededRandom(
		process.env.EVAL_SLACK_DYNAMIC_SEED ?? "slack-thread-gauntlet-v1"
	);
	const builders = [
		buildDynamicPriorityCase,
		buildDynamicRecapCase,
		buildDynamicCorrectionCase,
	];

	return Array.from({ length: count }, (_, index) => {
		const builder = builders[index % builders.length];
		return builder(index + 1, random);
	});
}

function dynamicSlackQualityCases(): EvalCase[] {
	const count = parsePositiveInt(
		process.env.EVAL_SLACK_QUALITY_DYNAMIC_CASES,
		12
	);
	const random = seededRandom(
		process.env.EVAL_SLACK_QUALITY_DYNAMIC_SEED ?? "slack-quality-gauntlet-v1"
	);
	const builders = [
		buildDynamicSlackQualityDecisionCase,
		buildDynamicSlackQualityBrevityCase,
		buildDynamicSlackQualityModelCase,
		buildDynamicSlackQualityMessageRewriteCase,
	];

	return Array.from({ length: count }, (_, index) => {
		const builder = builders[index % builders.length];
		return builder(index + 1, random);
	});
}

function buildDynamicSlackQualityDecisionCase(
	index: number,
	random: () => number
): EvalCase {
	const blocker = pick(
		[
			{
				label: "identity bleed",
				pattern: "identity|speaker|name|wrong person",
				text: "it confused Kaylee with Issa after Issa saved a nickname",
			},
			{
				label: "over-replying",
				pattern: "reply|quiet|side chatter|over",
				text: "it kept answering side chatter after the useful report was already done",
			},
			{
				label: "Slack Connect privacy",
				pattern: "privacy|Slack Connect|external|cross-workspace",
				text: "the Slack Connect warning was correct but sounded scary and repetitive",
			},
		],
		random
	);
	const greenSignal = pick(
		[
			"the adapter harness is green",
			"mentions and DMs look good",
			"the personality is getting positive feedback",
		],
		random
	);

	return {
		id: `slack-quality-dynamic-decision-${index}`,
		category: "quality",
		judgeMode: "slack-teammate",
		name: `Dynamic Slack quality decision ${index}`,
		query: pick(
			[
				"harsh read: ship it or hold it?",
				"what's the actual call here?",
				"founder answer, do we release this?",
			],
			random
		),
		slack: thread({
			currentUserId: pick([ISSA, KAYLEE], random),
			messages: [
				human(ISSA, greenSignal),
				human(KAYLEE, `but ${blocker.text}`),
				human(QAIS, "i like the vibe, just don't make it annoying"),
				bot("The next pass should bias toward fewer, sharper replies."),
			],
		}),
		surfaces: ["slack"],
		tags: ["slack", "thread", "slack-quality", "dynamic", "ship-call"],
		websiteId: WS,
		expect: {
			...STRICT_SLACK_CONTEXT_REPLY,
			maxResponseWords: 70,
			minQualityScore: 82,
			responseMatches: [
				{
					description: `mentions blocker: ${blocker.label}`,
					pattern: blocker.pattern,
				},
				{
					description: "makes a release call",
					pattern:
						"\\b(ship|hold|release|beta|flag|not yet|not ready|not fully|yes|no|call|blocker|guard|play|move)\\b",
				},
			],
		},
	};
}

function buildDynamicSlackQualityBrevityCase(
	index: number,
	random: () => number
): EvalCase {
	const issue = pick(
		[
			{
				label: "checkout",
				pattern: "checkout|pricing|CTA",
				report:
					"/pricing has fewer visits than /demo, but checkout CTA clicks are followed by a 14.1% error rate.",
			},
			{
				label: "mobile",
				pattern: "mobile|LCP|performance",
				report:
					"Mobile is 63% of traffic, p75 LCP is 5.2s, and mobile signup intent is down 19%.",
			},
			{
				label: "attribution",
				pattern: "attribution|UTM|paid",
				report:
					"Paid social volume is up, but 34% of signups are missing UTM attribution.",
			},
		],
		random
	);

	return {
		id: `slack-quality-dynamic-brevity-${index}`,
		category: "quality",
		judgeMode: "slack-teammate",
		name: `Dynamic Slack one-line priority ${index}`,
		query: pick(
			[
				"one sentence, what's the move?",
				"say less: first poke?",
				"no essay, what matters?",
			],
			random
		),
		slack: thread({
			currentUserId: ISSA,
			messages: [
				human(ISSA, "what's our current dashboard health?"),
				bot(
					`Quick read: ${issue.report} Demo traffic is high, docs clicks are fine, and homepage bounce is stable.`
				),
				human(KAYLEE, "please don't make this a 12 paragraph report"),
			],
		}),
		surfaces: ["slack"],
		tags: ["slack", "thread", "slack-quality", "dynamic", "brevity"],
		websiteId: WS,
		expect: {
			...STRICT_SLACK_CONTEXT_REPLY,
			maxBulletCount: 0,
			maxParagraphs: 1,
			maxResponseLines: 2,
			maxResponseWords: 34,
			minQualityScore: 84,
			responseMatches: [
				{ description: `mentions ${issue.label}`, pattern: issue.pattern },
			],
		},
	};
}

function buildDynamicSlackQualityModelCase(
	index: number,
	random: () => number
): EvalCase {
	const cheap = pick(
		[
			{ name: "mercury-2", latency: "0.8s", quality: "58" },
			{ name: "deepseek flash", latency: "1.5s", quality: "64" },
			{ name: "qwen flash", latency: "1.2s", quality: "55" },
		],
		random
	);
	const premium = pick(
		[
			{ name: "sonnet", latency: "8.7s", quality: "82" },
			{ name: "gpt-5.5", latency: "10.4s", quality: "85" },
			{ name: "opus", latency: "13.0s", quality: "88" },
		],
		random
	);

	return {
		id: `slack-quality-dynamic-model-${index}`,
		category: "quality",
		judgeMode: "slack-teammate",
		name: `Dynamic Slack model split ${index}`,
		query: pick(
			[
				"what's the model split you'd ship?",
				"which model gets the thread gate vs actual answer?",
				"fast take: cheap or premium here?",
			],
			random
		),
		slack: thread({
			currentUserId: KAYLEE,
			messages: [
				human(
					ISSA,
					`${cheap.name}: ${cheap.latency}, quality ${cheap.quality}; ${premium.name}: ${premium.latency}, quality ${premium.quality}`
				),
				human(
					QAIS,
					"thread gate has to be instant, but real analytics answers still need judgment"
				),
				bot(
					"The cost curve suggests using different models for gating and answering."
				),
			],
		}),
		surfaces: ["slack"],
		tags: ["slack", "thread", "slack-quality", "dynamic", "model-choice"],
		websiteId: WS,
		expect: {
			...STRICT_SLACK_CONTEXT_REPLY,
			maxResponseWords: 70,
			minQualityScore: 82,
			responseMatches: [
				{
					description: "mentions the cheap model or cheap gate",
					pattern: `${escapeRegex(cheap.name)}|cheap|fast|gate`,
				},
				{
					description: "mentions premium answer escalation",
					pattern: `${escapeRegex(premium.name)}|premium|answer|escalate|stronger`,
				},
			],
		},
	};
}

function buildDynamicSlackQualityMessageRewriteCase(
	index: number,
	random: () => number
): EvalCase {
	const situation = pick(
		[
			{
				pattern: "connect|workspace|installed|ask",
				text: "blocked message currently says: Databuddy is connected to the other side of this Slack Connect channel, not your workspace yet. Ask someone...",
			},
			{
				pattern: "approved|channel|workspace|data",
				text: "blocked message currently repeats that analytics may leak into external workspaces and tells people to run /bind twice",
			},
			{
				pattern: "permission|access|workspace|connect",
				text: "blocked message is technically accurate but makes the user feel like they did something wrong",
			},
		],
		random
	);

	return {
		id: `slack-quality-dynamic-copy-${index}`,
		category: "quality",
		judgeMode: "slack-teammate",
		name: `Dynamic Slack blocked-message rewrite ${index}`,
		query: pick(
			[
				"rewrite that as one friendly Slack line",
				"make the blocked message less annoying, one line",
				"give me the exact copy, short",
			],
			random
		),
		slack: thread({
			currentUserId: ISSA,
			messages: [
				human(KAYLEE, situation.text),
				human(
					QAIS,
					"it should explain the fix without sounding like a firewall"
				),
				bot("Copy should be friendly, specific, and non-repetitive."),
			],
		}),
		surfaces: ["slack"],
		tags: ["slack", "thread", "slack-quality", "dynamic", "copy"],
		websiteId: WS,
		expect: {
			...STRICT_SLACK_CONTEXT_REPLY,
			maxBulletCount: 0,
			maxHeadingCount: 0,
			maxParagraphs: 1,
			maxResponseLines: 2,
			maxResponseWords: 38,
			minQualityScore: 84,
			responseMatches: [
				{
					description: "writes relevant blocked-message copy",
					pattern: situation.pattern,
				},
			],
			responseNotMatches: [
				{
					description: "does not emit a long explanation before the copy",
					pattern: "\\b(here are|a few options|explanation|because)\\b",
				},
				{
					description: "does not leave template placeholders in user copy",
					pattern: "\\[[^\\]]+\\]",
				},
			],
		},
	};
}

function buildDynamicPriorityCase(
	index: number,
	random: () => number
): EvalCase {
	const issue = pick(
		[
			{
				label: "pricing page errors",
				metric: "pricing",
				report:
					"/pricing has 37 failed sessions, a 12.4% error rate, and the checkout CTA is the last event before most exits.",
			},
			{
				label: "mobile landing performance",
				metric: "mobile",
				report:
					"Mobile visitors are 61% of traffic, but p75 LCP is 4.9s and mobile conversion is down 18%.",
			},
			{
				label: "campaign attribution gaps",
				metric: "utm",
				report:
					"Paid social is driving 41% of new visitors, but 32% of signups have missing UTM attribution.",
			},
		],
		random
	);
	const distractor = pick(
		["homepage copy", "demo traffic", "docs clicks"],
		random
	);
	const query = pick(
		[
			"what should we fix first from that?",
			`is that worse than the ${distractor} thing?`,
			"give me the product-tester read, what matters first?",
		],
		random
	);

	return {
		id: `slack-thread-dynamic-priority-${index}`,
		category: "behavioral",
		name: `Dynamic Slack priority thread ${index}`,
		query,
		slack: thread({
			currentUserId: pick([ISSA, KAYLEE], random),
			messages: [
				human(ISSA, "quick pulse check on the dashboard?"),
				bot(
					`The standout issue is ${issue.report} The ${distractor} numbers are noisy but not obviously broken.`
				),
				human(QAIS, "that sounds spicy"),
			],
		}),
		surfaces: ["slack"],
		tags: ["slack", "thread", "dynamic", "priority"],
		websiteId: WS,
		expect: {
			...THREAD_CONTEXT_ONLY,
			maxLatencyMs: 30_000,
			maxSteps: 2,
			responseMatches: [
				{
					description: `mentions the relevant issue: ${issue.label}`,
					pattern: issue.metric,
				},
				{
					description: "makes a prioritization call",
					pattern:
						"\\b(first|priority|prioritize|start|fix|tackle|focus|lead|go after|highest|biggest|worse|hurting|costing|clear, measurable)\\b",
				},
			],
		},
	};
}

function buildDynamicRecapCase(index: number, random: () => number): EvalCase {
	const ask = pick(
		[
			{
				label: "Slack Connect privacy",
				pattern: "privacy|Slack Connect|external",
				text: "please test whether it blocks external Slack Connect users before showing analytics",
			},
			{
				label: "speaker identity",
				pattern: "identity|speaker|wrong person|name",
				text: "please test if it confuses who is speaking after another person saved a name",
			},
			{
				label: "thread silence",
				pattern: "quiet|silent|side chatter|reply",
				text: "please test whether it stays quiet when we're just joking after the report",
			},
		],
		random
	);

	return {
		id: `slack-thread-dynamic-recap-${index}`,
		category: "behavioral",
		name: `Dynamic Slack human-recap thread ${index}`,
		query: pick(
			[
				"what was kaylee asking me to check?",
				"wait what did kaylee want tested?",
				"summarize kaylee's ask",
			],
			random
		),
		slack: thread({
			currentUserId: ISSA,
			messages: [
				human(QAIS, "i dig the personality so far"),
				human(KAYLEE, ask.text),
				human(ISSA, "cool i'll keep poking at it"),
			],
		}),
		surfaces: ["slack"],
		tags: ["slack", "thread", "dynamic", "recap"],
		websiteId: WS,
		expect: {
			...THREAD_CONTEXT_ONLY,
			maxLatencyMs: 30_000,
			maxSteps: 2,
			responseMatches: [
				{ description: `recaps ${ask.label}`, pattern: ask.pattern },
			],
		},
	};
}

function buildDynamicCorrectionCase(
	index: number,
	random: () => number
): EvalCase {
	const mistake = pick(
		[
			{
				pattern:
					"sorry|right|misread|speaker|person|got it|fair|correct|mixing",
				thread:
					"I called Kaylee Benjamin even though Benjamin was Issa's saved name.",
			},
			{
				pattern:
					"sorry|right|overreached|too far|tools|got it|fair|correct|mixing",
				thread:
					"I ran a dashboard report after a thank-you message, which was too much.",
			},
			{
				pattern:
					"sorry|right|privacy|external|Slack Connect|got it|fair|correct|mixing",
				thread:
					"I almost answered analytics for an external Slack Connect user instead of blocking it.",
			},
		],
		random
	);

	return {
		id: `slack-thread-dynamic-correction-${index}`,
		category: "behavioral",
		name: `Dynamic Slack correction thread ${index}`,
		query: pick(
			[
				"nah that's still wrong",
				"no that's not what happened",
				"you're mixing it up",
			],
			random
		),
		slack: thread({
			currentUserId: ISSA,
			messages: [
				human(ISSA, "this is the stress test summary"),
				bot(mistake.thread),
				human(KAYLEE, "yeah that's the issue"),
			],
		}),
		surfaces: ["slack"],
		tags: ["slack", "thread", "dynamic", "correction"],
		websiteId: WS,
		expect: {
			maxLatencyMs: 30_000,
			maxSteps: 2,
			responseMatches: [
				{ description: "acknowledges correction", pattern: mistake.pattern },
			],
			toolsNotCalled: NO_SIDE_EFFECT_TOOLS,
		},
	};
}

function insightDigestCases(): EvalCase[] {
	return [
		{
			id: "digest-explicit-route-here",
			category: "tool-routing",
			name: "Routes a recurring digest to this channel on explicit request",
			query: "can you drop a weekly rundown in this channel going forward?",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "traffic's been climbing, want to stay on top of it"),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "tool-routing"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: { action: "route" },
					},
				],
			},
		},
		{
			id: "digest-explicit-unroute-here",
			category: "tool-routing",
			name: "Stops a recurring digest when the user asks to turn it off",
			query: "actually kill the weekly digest in here, too noisy",
			slack: thread({
				currentUserId: KAYLEE,
				messages: [
					human(ISSA, "we set up the weekly rundown last month"),
					bot(
						"Insight digests are delivered to this Slack channel on a weekly cadence."
					),
					human(KAYLEE, "it's a bit much tbh"),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "tool-routing"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: { action: "unroute" },
					},
				],
			},
		},
		{
			id: "digest-no-offer-on-banter",
			category: "behavioral",
			name: "Does not pitch a digest on a pure banter turn",
			query: "lol you're the best",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "appreciate you databuddy"),
					human(KAYLEE, "real"),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "guardrail"],
			websiteId: WS,
			expect: {
				maxSteps: 2,
				maxLatencyMs: 30_000,
				toolsNotCalled: ["manage_insight_digest"],
				responseNotMatches: [
					{
						description: "no unsolicited digest pitch on banter",
						pattern: OFFER_PHRASING,
						flags: "i",
					},
				],
			},
		},
		{
			id: "digest-proactive-offer-after-report",
			category: "behavioral",
			name: "Appends a digest offer when delivering a fresh metrics report",
			query: "how's traffic been the last 7 days?",
			slack: {
				currentUserId: ISSA,
				channelId: "C0EVALTHRD",
				teamId: "T_EVAL",
				threadTs: "1778005033.664559",
				trigger: "app_mention",
				threadMessages: [],
			},
			surfaces: ["slack"],
			tags: ["slack", "digest", "proactive-offer"],
			websiteId: WS,
			expect: {
				maxSteps: 10,
				maxLatencyMs: 90_000,
				toolsCalled: ["get_data"],
				toolsNotCalled: ["manage_insight_digest"],
				responseMatches: [
					{
						description: "offers to set up a recurring digest in this channel",
						pattern: OFFER_PHRASING,
						flags: "i",
					},
				],
			},
		},
		{
			id: "digest-reschedule-friday-morning-berlin",
			category: "tool-routing",
			name: "Reschedules the digest to Friday 8 AM Europe/Berlin on natural-language ask",
			query:
				"can you set the digest to fire every Friday morning at 8 AM Berlin time?",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "@databuddy what's the digest"),
					bot(
						"Weekly digest is routed to <#C_DIGEST>, next run at 2026-06-12T06:00:00.000Z."
					),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "reschedule", "tool-routing"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: {
							action: "reschedule",
							timezone: "Europe/Berlin",
							confirmed: false,
						},
					},
				],
				confirmationFlow: true,
			},
		},
		{
			id: "digest-reschedule-cadence-daily",
			category: "tool-routing",
			name: "Reschedules cadence only when user says 'make it daily'",
			query: "actually make the digest daily instead of weekly",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "the weekly cadence isn't enough"),
					bot("Insight digests are delivered weekly to <#C_DIGEST>."),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "reschedule", "tool-routing"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: {
							action: "reschedule",
							frequency: "daily",
							confirmed: false,
						},
					},
				],
				confirmationFlow: true,
			},
		},
		{
			id: "digest-does-not-deny-schedule-config",
			category: "behavioral",
			name: "Never claims the digest time is fixed when asked to change it",
			query: "can you change when the digest runs?",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "the digest hits at a weird hour"),
					bot(
						"Insight digests are delivered to <#C_DIGEST> on a weekly cadence."
					),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "reschedule", "guardrail"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 45_000,
				responseNotMatches: [
					{
						description:
							"agent must not claim the schedule is fixed, hard-coded, or out of its control",
						pattern:
							"\\b(fixed on (databuddy|my|our) (end|side)|not configurable|can'?t (change|configure|adjust) (the )?(time|schedule|when)|isn'?t (something I can|configurable)|out of (my|our) control|don'?t have (a way|the ability) to (change|set))\\b",
						flags: "i",
					},
				],
			},
		},
		{
			id: "digest-test-run-on-explicit-ask",
			category: "tool-routing",
			name: "Triggers a test digest run when the user asks to run one now",
			query: "run a test digest right now so I can see what it looks like",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "we set up the digest last week"),
					bot("Insight digests are routed to <#C_DIGEST> on a weekly cadence."),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "test-run", "tool-routing"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: {
							action: "test",
							confirmed: false,
						},
					},
				],
				confirmationFlow: true,
			},
		},
		{
			id: "digest-test-banter-guard",
			category: "behavioral",
			name: "Does not fire a test digest run on banter or vague enthusiasm",
			query: "yo databuddy how's it going",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "love the digest btw"),
					human(KAYLEE, "fr it slaps"),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "test-run", "guardrail"],
			websiteId: WS,
			expect: {
				maxSteps: 2,
				maxLatencyMs: 30_000,
				toolsNotCalled: ["manage_insight_digest"],
			},
		},
		{
			id: "digest-status-quotes-cron-and-timezone",
			category: "behavioral",
			name: "Quotes cron and timezone verbatim from status, never invents them",
			query: "what's the digest schedule right now",
			slack: thread({
				currentUserId: ISSA,
				messages: [human(ISSA, "I forget when this thing fires")],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "status"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 45_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: { action: "status" },
					},
				],
				responseNotMatches: [
					{
						description:
							"must not invent a cron expression or timezone — only restate canonical values",
						pattern:
							"\\b(probably|might be|i think|usually|by default).*(utc|cron|timezone)\\b",
						flags: "i",
					},
				],
			},
		},
		{
			id: "digest-route-previews-before-confirming",
			category: "tool-routing",
			name: "Route honours preview-then-confirm even on confident phrasing",
			query: "drop a weekly digest in this channel going forward",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "traffic's climbing, want to stay on top of it"),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "confirmation", "tool-routing"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: { action: "route", confirmed: false },
					},
				],
				confirmationFlow: true,
			},
		},
		{
			id: "digest-unroute-previews-before-confirming",
			category: "tool-routing",
			name: "Unroute honours preview-then-confirm even on confident phrasing",
			query: "kill the weekly digest in here, too noisy",
			slack: thread({
				currentUserId: KAYLEE,
				messages: [
					human(ISSA, "we set up the weekly rundown last month"),
					bot(
						"Insight digests are delivered to this Slack channel on a weekly cadence."
					),
					human(KAYLEE, "it's a bit much tbh"),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "confirmation", "tool-routing"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: { action: "unroute", confirmed: false },
					},
				],
				confirmationFlow: true,
			},
		},
	];
}

function realWorldDerivedCases(): EvalCase[] {
	return [
		{
			id: "real-digest-set-time-must-not-deny",
			category: "tool-routing",
			name: "Real thread: 'set it to 8 AM GMT+2' must engage the schedule tool, not deny",
			query: "can you set it to 8 AM GMT+2",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "<@U_DATABUDDY> what's the digest?"),
					bot(
						"Weekly digest is routed to <#C0EVALTHRD>, next run at 2026-06-12T06:00:00.000Z."
					),
					human(ISSA, "when is that"),
					bot("2026-06-12 at 06:00 UTC -- that's next Friday morning."),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "reschedule", "real-world"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				responseNotMatches: [
					{
						description:
							"agent must not claim the schedule is fixed or out of its control (the original regression)",
						pattern:
							"\\b(fixed on (databuddy|my|our) (end|side)|not configurable|can'?t (change|configure|adjust) (the )?(time|schedule|when)|isn'?t (something I can|configurable))\\b",
						flags: "i",
					},
				],
				responseMatches: [
					{
						description:
							"agent should either offer to reschedule / ask which IANA timezone / confirm a change, OR correctly recognize that 8 AM GMT+2 is already 06:00 UTC and no change is needed",
						pattern:
							"\\b(reschedule|timezone|europe/|africa/|america/|asia/|confirm|i'?ll (set|update|change)|want me to|already|no change|same as|matches|equivalent)\\b",
						flags: "i",
					},
				],
			},
		},
		{
			id: "real-ignore-social-distraction",
			category: "tool-routing",
			name: "Real thread: 'top pages and tell @user to do better' fetches pages without messaging the named user",
			query:
				"hey <@U_DATABUDDY> can you tell me my top pages, and tell <@U_KAYLEE> to do a better job",
			slack: thread({
				currentUserId: ISSA,
				messages: [],
			}),
			surfaces: ["slack"],
			tags: ["slack", "guardrail", "real-world"],
			websiteId: WS,
			expect: {
				maxSteps: 6,
				maxLatencyMs: 60_000,
				toolsCalled: ["get_data"],
				toolInputs: [
					{
						tool: "get_data",
						includes: { type: "top_pages" },
					},
				],
			},
		},
		{
			id: "real-simple-bounce-rate",
			category: "tool-routing",
			name: "Real thread: 'what's my bounce rate' should call get_data",
			query: "<@U_DATABUDDY> What's my bounce rate",
			slack: thread({
				currentUserId: ISSA,
				messages: [],
			}),
			surfaces: ["slack"],
			tags: ["slack", "analytics", "real-world"],
			websiteId: WS,
			expect: {
				maxSteps: 6,
				maxLatencyMs: 60_000,
				toolsCalled: ["get_data"],
				responseMatches: [
					{
						description: "answer must include a numeric bounce-rate value",
						pattern: "\\b\\d+(\\.\\d+)?\\s*%",
						flags: "i",
					},
				],
			},
		},
	];
}

function adversarialDigestCases(): EvalCase[] {
	const DENIAL_PATTERN =
		"\\b(fixed on (databuddy|my|our) (end|side)|not configurable|can'?t (change|configure|adjust) (the )?(time|schedule|when)|isn'?t (something I can|configurable))\\b";
	const CONFIRMATION_HEDGE =
		"\\b(reply|confirm|want me to|should i|sound good|ok with you|go ahead|just to confirm)\\b";

	return [
		{
			id: "adv-natural-language-cron",
			category: "tool-routing",
			name: "Adversarial: 'Friday morning' must engage reschedule, propose a concrete time, and ask to confirm",
			query: "make the digest fire every Friday morning",
			slack: thread({
				currentUserId: ISSA,
				messages: [human(ISSA, "the cadence is fine but the time is weird")],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "adversarial", "reschedule"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				responseMatches: [
					{
						description:
							"agent must either propose a concrete hour/timezone for confirmation or ask the user to specify",
						pattern: CONFIRMATION_HEDGE,
						flags: "i",
					},
				],
			},
		},
		{
			id: "adv-timezone-alias-EST",
			category: "tool-routing",
			name: "Adversarial: 'EST' must be resolved to America/New_York (or asked about), never rejected",
			query: "set the digest to 9 AM EST on weekdays",
			slack: thread({
				currentUserId: ISSA,
				messages: [],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "adversarial", "reschedule", "timezone"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				responseNotMatches: [
					{
						description: "must not deny the schedule change",
						pattern: DENIAL_PATTERN,
						flags: "i",
					},
				],
				responseMatches: [
					{
						description:
							"must surface an IANA timezone (America/New_York or America/Toronto) or ask for one",
						pattern:
							"\\b(america/|eastern time|new[ _]york|which timezone|specify (a |the )?(timezone|iana))\\b",
						flags: "i",
					},
				],
			},
		},
		{
			id: "adv-contradictory-then-go",
			category: "tool-routing",
			name: "Adversarial: user contradicts themselves then says 'do it' — must preview, not blindly execute",
			query: "actually do it",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "route the digest here"),
					bot(
						"Route insight digests for this organization to <#C0EVALTHRD> on a weekly cadence. Reply to confirm."
					),
					human(ISSA, "wait no, nevermind"),
					bot(
						"Okay, I haven't changed anything. Let me know if you want to revisit it."
					),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "adversarial", "confirmation"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: { confirmed: false },
					},
				],
			},
		},
		{
			id: "adv-test-without-routing",
			category: "tool-routing",
			name: "Adversarial: 'run a test digest' with no channel routed must still preview action=test",
			query: "run a one-off test of the digest pipeline now",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "i want to see what the digest looks like"),
					bot(
						"No Slack digest delivery is configured for this organization. Investigations still run on a weekly cadence."
					),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "adversarial", "test-run"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: { action: "test", confirmed: false },
					},
				],
				confirmationFlow: true,
			},
		},
		{
			id: "adv-sarcastic-ask-not-confirmation",
			category: "behavioral",
			name: "Adversarial: sarcasm after a pending preview must NOT execute the mutation",
			query: "oh sure, go ahead and break everything",
			slack: thread({
				currentUserId: ISSA,
				messages: [
					human(ISSA, "route the digest here"),
					bot(
						"Route insight digests for this organization to <#C0EVALTHRD> on a weekly cadence. Reply to confirm."
					),
				],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "adversarial", "confirmation", "guardrail"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 45_000,
				responseNotMatches: [
					{
						description:
							"agent must not claim it routed/applied/rescheduled in response to sarcasm",
						pattern:
							"\\b(routed insight digests|rescheduled|applied|done\\. the digest|will now post|configured the digest)\\b",
						flags: "i",
					},
				],
			},
		},
		{
			id: "adv-terse-route-ask",
			category: "tool-routing",
			name: "Adversarial: terse 'digest weekly here' still triggers preview-then-confirm",
			query: "digest weekly here",
			slack: thread({
				currentUserId: ISSA,
				messages: [],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "adversarial", "tool-routing"],
			websiteId: WS,
			expect: {
				maxSteps: 4,
				maxLatencyMs: 60_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: { action: "route", confirmed: false },
					},
				],
				confirmationFlow: true,
			},
		},
		{
			id: "adv-custom-frequency-without-cron",
			category: "behavioral",
			name: "Adversarial: 'set to custom frequency' without a cron should ask for one, never silently break the schedule",
			query: "switch the digest to a custom cadence",
			slack: thread({
				currentUserId: ISSA,
				messages: [],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "adversarial", "reschedule"],
			websiteId: WS,
			expect: {
				maxSteps: 6,
				maxLatencyMs: 60_000,
				responseMatches: [
					{
						description:
							"agent should ask for a cron expression or specific schedule before changing cadence to custom",
						pattern:
							"\\b(cron|schedule|specific (time|day)|what (time|day|hours)|when (exactly|should))\\b",
						flags: "i",
					},
				],
				responseNotMatches: [
					{
						description:
							"must not claim the schedule was changed without a concrete cron",
						pattern:
							"\\b(switched|rescheduled|applied|now (set|firing|on a custom))\\b",
						flags: "i",
					},
				],
			},
		},
		{
			id: "adv-reschedule-then-test-same-turn",
			category: "tool-routing",
			name: "Adversarial: combined 'reschedule + test now' in one message — agent must sequence and confirm each",
			query:
				"set the digest to fire Mondays 7 AM Europe/Berlin, and run a test once it's updated",
			slack: thread({
				currentUserId: ISSA,
				messages: [],
			}),
			surfaces: ["slack"],
			tags: ["slack", "digest", "adversarial", "reschedule", "test-run"],
			websiteId: WS,
			expect: {
				maxSteps: 6,
				maxLatencyMs: 90_000,
				toolsCalled: ["manage_insight_digest"],
				toolInputs: [
					{
						tool: "manage_insight_digest",
						includes: { confirmed: false },
					},
				],
				responseMatches: [
					{
						description:
							"agent should describe sequencing reschedule before test",
						pattern:
							"\\b(first|step (1|one)|then|after that|once (it'?s |that'?s )?(confirmed|updated|applied)|and (i'?ll|then) (apply|run|trigger|kick off)|after .* confirm)\\b",
						flags: "i",
					},
				],
			},
		},
	];
}

function thread(input: {
	currentUserId: string;
	messages: SlackEvalMessage[];
}) {
	return {
		botUserId: BOT,
		channelId: "C0EVALTHRD",
		currentUserId: input.currentUserId,
		teamId: "T_EVAL",
		threadMessages: input.messages,
		threadTs: "1778005033.664559",
		trigger: "thread_follow_up" as const,
	};
}

function human(userId: string, text: string): SlackEvalMessage {
	return {
		text,
		threadTs: "1778005033.664559",
		ts: nextTs(),
		userId,
	};
}

function bot(text: string): SlackEvalMessage {
	return {
		authorName: "Databuddy",
		text,
		threadTs: "1778005033.664559",
		ts: nextTs(),
		userId: BOT,
	};
}

function nextTs(): string {
	tsCounter += 1;
	return `1778005033.${String(664_559 + tsCounter).padStart(6, "0")}`;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pick<T>(items: T[], random: () => number): T {
	return items[Math.floor(random() * items.length) % items.length];
}

function seededRandom(seed: string): () => number {
	let state = 1;
	for (let i = 0; i < seed.length; i++) {
		state = (state * 31 + seed.charCodeAt(i)) % 2_147_483_647;
	}
	return () => {
		state = (state * 48_271) % 2_147_483_647;
		return state / 2_147_483_647;
	};
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
