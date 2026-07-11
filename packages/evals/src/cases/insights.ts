import type { EvalCase } from "../types";

const WS = "OXmNQsViBT-FOS_wZCTHc";

/**
 * Smart-insights cases — benchmarks for Databuddy's actionable insight style:
 * grounded cards, directionally correct severity/sentiment, cautious causality,
 * and concrete next actions instead of generic analytics commentary.
 */
export const insightsCases: EvalCase[] = [
	{
		id: "insights-direction-and-sentiment-consistency",
		category: "insights",
		name: "Keeps metric direction, sentiment, and wording consistent",
		query:
			"Generate 3 actionable Databuddy finding cards for this week. Be careful: if errors, bounce, drop-off, or latency go down, that is good even though the numeric change is negative. Do not say a metric rose if it fell. Include the metric evidence and one concrete next action per card.",
		websiteId: WS,
		tags: ["insights", "direction", "sentiment"],
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
			minQualityScore: 75,
			responseMatches: [
				{
					description: "uses concrete Databuddy entities, not generic advice",
					pattern:
						"(/pricing|/demo|/docs|Bing|Twitter|Toolfolio|funnel|error|referrer|session)",
				},
			],
			responseNotMatches: [
				{
					description: "does not equate every negative change with bad news",
					pattern:
						"error(s)? (fell|dropped|declined).{0,120}(bad|worse|warning|problem)",
				},
				{
					description: "does not call traffic loss positive",
					pattern:
						"\\b(page-?views? (fell|dropped|declined)[^.]{0,120}\\bpositive\\b|reduction in page-?views? (is|was) (a )?positive\\b)",
				},
				{
					description: "does not punt on available eval data",
					pattern:
						"(can't produce|couldn.?t generate|cannot produce|can.?t reliably generate|no real signal|need working metrics|queries failed|returned no rows|data is unavailable)",
				},
			],
		},
	},
	{
		id: "insights-cautious-causality",
		category: "insights",
		name: "Uses cautious causal language unless segment data proves the cause",
		query:
			"Create actionable findings from the weekly analytics. If a referrer mix changed at the same time as engagement changed, do not claim the new referrer caused engagement to drop unless you have segment-level engagement data. Phrase hypotheses clearly and say what to verify next.",
		websiteId: WS,
		tags: ["insights", "grounding", "causality"],
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
			minQualityScore: 78,
			responseMatches: [
				{
					description: "includes a verification step for inferred causes",
					pattern:
						"\\b(verify|check|compare|segment|break down|validate|confirm|filter|drill into|look at|split by)\\b",
				},
				{
					description: "grounds causality in a concrete source or segment",
					pattern: "(referrer|source|Bing|Twitter|Toolfolio|Google|segment)",
				},
			],
			responseNotMatches: [
				{
					description: "does not overstate causality from correlation",
					pattern:
						"\\b(proves|caused by|because of)\\b.{0,80}\\b(referrer|Toolfolio|Twitter|source)\\b",
				},
			],
		},
	},
	{
		id: "insights-no-unsupported-revenue-or-causality",
		category: "insights",
		name: "Avoids unsupported revenue and causal claims from traffic data",
		query:
			"Generate concise Databuddy finding cards for this week. If pricing or campaign traffic changed, do not call it revenue impact, ROI, CAC, LTV, payback, or causality unless revenue/spend/identity data is actually present. Use proxy language and say what to verify next.",
		websiteId: WS,
		tags: ["insights", "grounding", "revenue", "causality"],
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
			maxResponseWords: 520,
			minQualityScore: 80,
			responseMatches: [
				{
					description: "uses proxy/verification framing",
					pattern:
						"\\b(proxy|verify|check|compare|segment|validate|confirm|drill into|if revenue|without revenue|conversion)\\b",
				},
			],
			responseNotMatches: [
				{
					description: "does not punt on available eval data",
					pattern:
						"(can't produce|couldn.?t generate|cannot produce|can.?t reliably generate|no real signal|need working metrics|queries failed|returned no rows|data is unavailable)",
				},
				{
					description: "does not claim unsupported financial impact",
					pattern:
						"\\b(revenue impact|ROI|ROAS|CAC|LTV|payback|profit)\\b(?![^.]{0,80}\\b(missing|unavailable|requires|without|not available)\\b)",
				},
				{
					description: "does not overstate attribution causality",
					pattern:
						"\\b(caused by|because of|due to|driven by)\\b.{0,100}\\b(referrer|source|UTM|campaign|Twitter|Google|Bing|Toolfolio)\\b",
				},
			],
		},
	},
	{
		id: "insights-plain-language-not-technical-jargon",
		category: "insights",
		name: "Translates technical metrics into useful plain-language finding cards",
		query:
			"Generate the weekly Databuddy finding cards for a founder. If web vitals changed, explain the user-visible problem in plain English. Do not put acronyms like INP, LCP, TTFB, CLS, or p75 in the headline; those can stay in the metric evidence only.",
		websiteId: WS,
		tags: ["insights", "plain-language", "brevity"],
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
			maxResponseWords: 520,
			minQualityScore: 82,
			responseMatches: [
				{
					description: "uses user/product outcome language",
					pattern:
						"\\b(slower|broken|leaking|stuck|drop-off|checkout|setup|onboarding|interaction|click|users|sessions)\\b",
				},
			],
			responseNotMatches: [
				{
					description: "does not use raw web-vitals jargon in headings",
					pattern: "(^|\\n)#{0,3}\\s*[^\\n]*\\b(INP|LCP|FCP|TTFB|CLS|p75)\\b",
				},
				{
					description: "does not render cards as markdown tables",
					pattern:
						"\\|\\s*(Insight|Metric|Card|Observation|Suggested Next Check|Evidence)\\s*\\|",
				},
				{
					description: "avoids report-style verbosity",
					pattern: "[\\s\\S]{3500,}",
				},
			],
		},
	},
	{
		id: "insights-three-concise-distinct-cards",
		category: "insights",
		name: "Produces three concise distinct cards when enough signals exist",
		query:
			"Generate the 3 most useful Databuddy finding cards for this week. Each card should be short, distinct, backed by metrics, and include one concrete next action. Prefer reliability/product risk over vanity traffic wins. Do not repeat the same narrative.",
		websiteId: WS,
		tags: ["insights", "brevity", "distinct", "actionability"],
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
			maxResponseWords: 520,
			minQualityScore: 82,
			responseMatches: [
				{
					description: "contains operational action language",
					pattern:
						"\\b(inspect|review|compare|segment|drill into|fix|audit|trace|verify|diagnose|open)\\b",
				},
				{
					description: "uses concrete Databuddy surfaces or entities",
					pattern:
						"(/pricing|/demo|/docs|funnel|onboarding|errors|referrers|sessions|INP|LCP|goal)",
				},
			],
			responseNotMatches: [
				{
					description: "does not punt on available eval data",
					pattern:
						"(can't produce|couldn.?t generate|cannot produce|can.?t reliably generate|no real signal|need working metrics|queries failed|returned no rows|data is unavailable)",
				},
				{
					description: "avoids generic monitoring advice",
					pattern:
						"\\b(monitor|monitoring|keep an eye|watch this|track closely|add an alert|enable an alert)\\b",
				},
				{
					description: "does not render cards as markdown tables",
					pattern:
						"\\|\\s*(Insight|Metric|Card|Observation|Suggested Next Check|Evidence)\\s*\\|",
				},
				{
					description: "does not produce report-style verbosity",
					pattern: "[\\s\\S]{3500,}",
				},
			],
		},
	},
	{
		id: "insights-plain-voice-no-number-dump",
		category: "insights",
		name: "Tells the story in plain voice instead of dumping deltas",
		query:
			"Generate this week's Databuddy finding cards. Write each description like a short DM to a teammate: what happened and what it means, then one concrete action. Keep at most two numbers in the prose and put the rest in the metric evidence. No arrow deltas, no parenthetical week-over-week spam, no dramatic metaphors.",
		websiteId: WS,
		tags: ["insights", "voice", "brevity"],
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
			maxResponseWords: 520,
			minQualityScore: 82,
			responseMatches: [
				{
					description: "reads as narrative with a concrete action",
					pattern:
						"\\b(inspect|open|compare|review|fix|audit|trace|verify|walk through|drill into)\\b",
				},
			],
			responseNotMatches: [
				{
					description: "does not use arrow deltas between values",
					pattern: "\\d\\s*(→|->)\\s*\\d",
				},
				{
					description: "does not spam parenthetical before/after deltas",
					pattern:
						"\\(\\s*(from|was|up from|down from)\\s+[\\d,.]+%?\\s*\\)[\\s\\S]{0,200}\\(\\s*(from|was|up from|down from)\\s+[\\d,.]+%?\\s*\\)",
				},
				{
					description: "does not attach signed percentages in parens to counts",
					pattern: "\\d\\s*\\([+-]\\d+(\\.\\d+)?%\\)",
				},
				{
					description: "avoids dramatic metaphor verbs",
					pattern:
						"\\b(cratered|collapsed|plummeted|skyrocketed|imploded|nosedived|evaporated)\\b",
				},
				{
					description: "avoids editorializing adverbs and AI filler",
					pattern:
						"\\b(quietly|essentially|notably)\\b|it'?s worth noting|importantly,",
				},
			],
		},
	},
	{
		id: "insights-earned-impact-lines",
		category: "insights",
		name: "Writes impact lines that add information or omits them",
		query:
			"Generate this week's Databuddy finding cards. For each card, only include a why-it-matters line when it says something the description does not already say, and make it specific to this site's data. If an error affects one or two users, say exactly that instead of implying broad impact. Name the suspected cause in the next action when the data shows one.",
		websiteId: WS,
		tags: ["insights", "impact", "grounding"],
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
			maxResponseWords: 520,
			minQualityScore: 80,
			responseMatches: [
				{
					description: "ties impact or action to concrete site entities",
					pattern:
						"(/pricing|/demo|/docs|/onboarding|funnel|goal|referrer|sessions|errors)",
				},
			],
			responseNotMatches: [
				{
					description: "does not use generic distortion/blocking boilerplate",
					pattern:
						"(can distort (error )?reporting|may block affected users|changes which follow-up|worth repeating while the context is fresh)",
				},
				{
					description: "does not imply broad impact for single-user errors",
					pattern:
						"\\b(one|1|single)\\b[^.]{0,80}\\b(user|session|visitor)\\b[^.]{0,120}\\b(all users|many users|widespread|site-?wide|blocking users)\\b",
				},
				{
					description: "does not pad with generic significance claims",
					pattern:
						"\\b(this is (a )?significant|this highlights|underscores the importance|critical to understand)\\b",
				},
			],
		},
	},
	{
		id: "insights-actionable-deep-link-intent",
		category: "insights",
		name: "Turns each insight into a product action, not a memo",
		query:
			"Produce actionable Databuddy findings for the current week. Keep each one short: what changed, why it matters, and the exact next product action. Prefer actions like inspect affected sessions, open the funnel step, compare referrers, review errors for a page, or ask the agent to diagnose. Avoid generic monitoring advice.",
		websiteId: WS,
		tags: ["insights", "actionability", "brevity"],
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
			maxResponseWords: 650,
			minQualityScore: 80,
			responseMatches: [
				{
					description: "contains specific operational next actions",
					pattern:
						"\\b(inspect|open|compare|review|diagnose|audit|profile|fix|investigate|filter|trace|segment|drill into)\\b",
				},
				{
					description: "ties actions to a concrete product surface",
					pattern:
						"(/pricing|/demo|/docs|funnel|sessions|errors|referrers|goal)",
				},
			],
			responseNotMatches: [
				{
					description: "does not punt on available eval data",
					pattern:
						"(can't produce|couldn.?t generate|cannot produce|can.?t reliably generate|no real signal|need working metrics|queries failed|returned no rows|data is unavailable)",
				},
				{
					description: "avoids generic monitoring advice",
					pattern:
						"\\b(monitor|monitoring|keep an eye|watch this|track closely|add an alert|enable an alert)\\b",
				},
			],
		},
	},
];
