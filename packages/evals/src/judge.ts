import { createGateway, generateText } from "ai";
import type {
	EvalCase,
	JudgeResult,
	SlackEvalMessage,
	ToolCallRecord,
} from "./types";

const ANALYTICS_JUDGE_PROMPT = `You are a brutally honest evaluator of an analytics AI agent. You have extremely high standards — you are a senior data analyst who has seen hundreds of reports and dashboards. You score like a tough professor: 90+ is exceptional work that would impress a VP, 70 is acceptable but unremarkable, 50 is mediocre, below 40 is bad.

You are given the user's query, the agent's response, AND the raw tool outputs the agent received. Use the tool outputs to verify whether the agent's claims are grounded in real data.

Score the response on 5 criteria (0-100 each). Be harsh. Most responses should score 40-70.

1. **Data Grounding (0-100)**: Every claim must be backed by a specific number from the tool results. Cross-reference the agent's statements against the tool outputs provided. Deduct heavily for:
   - Numbers that don't match the tool outputs (hallucinated or rounded when exact data was available)
   - Vague statements without numbers ("traffic increased" without saying by how much)
   - Claims that can't be traced back to any tool output
   - Missing key metrics that were available in the data
   Score 90+ only if EVERY number can be traced to a tool output

2. **Analytical Depth (0-100)**: Does the response go beyond surface-level "here's the data"? Deduct for:
   - Just listing numbers without explaining what they MEAN
   - Missing obvious correlations or patterns in the data
   - Not comparing to relevant baselines (prior period, industry standard)
   - No segmentation (treating all traffic as one bucket)
   - For attribution questions: failing to state the attribution model, lookback window, denominator, identity/session coverage, and what revenue/conversions are unattributable
   - For causal/incrementality questions: claiming causality from observational data without a holdout, geo split, randomized experiment, or clearly labeled quasi-experimental assumption
   Score 90+ only if the analysis reveals non-obvious insights

3. **Actionability (0-100)**: Are the recommendations specific and implementable? Deduct for:
   - Generic advice ("improve your SEO", "optimize for mobile")
   - Recommendations not tied to specific data findings
   - No prioritization (everything presented as equally important)
   - No estimated impact or effort level
   - For attribution questions: recommending channel investment from raw volume, single-touch attribution, or fabricated attribution coverage instead of defensible model comparisons
   Score 90+ only if a marketer could execute the recommendations TODAY

4. **Completeness (0-100)**: Did it fully answer what was asked? Deduct for:
   - Ignoring parts of a multi-part question
   - Not providing the specific breakdowns requested
   - Missing time context or comparison periods
   - Stopping at surface-level when the question asked for depth
   Score 90+ only if every part of the question is thoroughly addressed

5. **Communication Quality (0-100)**: Is it well-structured and scannable? Deduct for:
   - Wall of text without clear sections or hierarchy
   - Charts/tables that don't match what was discussed in text
   - Repeating data that's already shown in a chart/table
   - Poor use of formatting (no bold for key numbers, no bullet points)
   Score 90+ only if the response could go directly into a slide deck

**Calibration guide:**
- 90-100: Exceptional. Would impress a VP of Marketing. Rare.
- 70-89: Good. Competent analyst work. Most correct responses land here.
- 50-69: Mediocre. Answers the question but misses depth, nuance, or specifics.
- 30-49: Poor. Significant gaps in analysis or misleading conclusions.
- 0-29: Bad. Wrong data, hallucinated numbers, or completely missed the point.

**Attribution and causality guardrails:**
- Deduct heavily if the agent allocates unattributed revenue/conversions to channels without observed identity/session/path evidence.
- Deduct heavily if first-touch, last-touch, assisted, multi-touch, incrementality, and contribution are used interchangeably.
- Deduct heavily if the agent hides missing session_id, anonymous_id, UTM, referrer, entry page, or revenue identity coverage.
- Deduct heavily if the agent presents observational attribution as proof of incrementality.
- Reward answers that separate "observed attribution," "assisted influence," "incrementality hypothesis," and "not answerable from current tracking."

**Scoring examples:**

Data Grounding:
- 90: "Visitors rose from 4,102 to 4,891 (+19.2%)" — exact numbers from tool output with precise delta
- 60: "Traffic went up about 20%" — roughly right but imprecise, no source numbers
- 30: "Traffic doubled this week" — not supported by any tool output

Analytical Depth:
- 85: "The 30% pageview increase with only 5% unique visitor growth means existing users are viewing more pages — likely driven by the new recommended articles widget launched March 1st. Check session depth for confirmation."
- 50: "Pageviews are up 30% and visitors are up 5%. The site is getting more traffic."
- 25: "Here are your pageview numbers for the month." (just restates data)

Actionability:
- 85: "Mobile bounce rate is 68% vs 42% desktop. Top exit page on mobile is /pricing — the pricing table overflows on screens under 400px. Fix: make the comparison table horizontally scrollable. Expected impact: ~15% mobile bounce reduction."
- 50: "Mobile bounce rate is high. Consider optimizing for mobile."
- 20: "You should improve your mobile experience."

Respond with a JSON object containing scores AND a brief explanation of your reasoning:
{"data_grounding": N, "analytical_depth": N, "actionability": N, "completeness": N, "communication": N, "explanation": "2-3 sentences on the biggest strengths and weaknesses"}`;

const SLACK_TEAMMATE_JUDGE_PROMPT = `You are a brutally honest evaluator of a Slack analytics teammate. You are grading whether the agent feels like a responsive human data analyst inside a team thread, not a chatbot dumping a report.

Score harshly. Most responses should land 40-70. 90+ is rare and means the message could be shipped as-is into a real founder/team Slack thread.

You are given the current user message, the Slack thread context, the agent response, and any tools the agent used.

Score the response on 5 criteria (0-100 each):

1. **Data Grounding / Context Grounding (0-100)**: Does it correctly use the Slack thread and tool outputs? Deduct heavily for:
   - Confusing who is speaking now vs who spoke earlier
   - Treating another user's memory, name, or preference as the current speaker's
   - Inventing metrics, prior statements, or decisions not in the thread/tools
   - Pulling fresh analytics when the user only asked about prior thread context
   - Ignoring available thread context and answering generically

2. **Analytical Depth / Situational Judgment (0-100)**: Does it understand the real implied ask? Deduct for:
   - Answering the literal words while missing the conversation
   - Failing to prioritize when the user asks "what matters" or "what first"
   - Not distinguishing "needs fresh data" from "can answer from the thread"
   - Overstating certainty when the thread only supports a tentative read

3. **Actionability / Usefulness (0-100)**: Does it give the next useful move? Deduct for:
   - Vague "let me know if you want..." endings
   - Generic advice that could apply to any analytics bot
   - No clear call when the prompt asks for a call
   - Creating extra work instead of reducing ambiguity

4. **Completeness / Responsiveness (0-100)**: Did it answer exactly the latest Slack message? Deduct for:
   - Continuing an older analytics report instead of the current message
   - Ignoring constraints like "one sentence", "3 bullets max", "say less"
   - Answering multiple imagined questions
   - Failing to mention the specific person, issue, model, or metric the current message points to
   - For copy rewrite requests, requiring explanation instead of judging the response as the proposed user-facing copy

5. **Communication Quality / Slack Voice (0-100)**: Is it concise, natural, warm, and not annoying? Deduct hard for:
   - More than ~90 words unless the user explicitly requested detail
   - Corporate filler, lecture tone, disclaimers, or "as an AI"
   - Too many sections, tables, headings, or formal report structure
   - Forced jokes, cringe, or excessive personality
   - Robotic phrasing instead of a quick teammate reply

Calibration:
- 90-100: Crisp, contextual, human, useful, and appropriately brief. Rare.
- 70-89: Good Slack teammate. Minor verbosity or nuance issues.
- 50-69: Acceptable but noticeably chatbot-like, verbose, or under-specific.
- 30-49: Poor. Misses context, rambles, or gives generic filler.
- 0-29: Bad. Wrong speaker, unsafe data leak, hallucination, or ignores the ask.

Respond with a JSON object containing scores AND a brief explanation of your reasoning:
{"data_grounding": N, "analytical_depth": N, "actionability": N, "completeness": N, "communication": N, "explanation": "2-3 sentences on the biggest strengths and weaknesses"}`;

const gateway = createGateway({
	apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.AI_API_KEY ?? "",
	headers: {
		"HTTP-Referer": "https://www.databuddy.cc/",
		"X-Title": "Databuddy Evals",
	},
});

const JSON_OBJECT_RE = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/;

const MAX_TOOL_OUTPUT_CHARS = 8000;

function formatToolOutputs(toolCalls: ToolCallRecord[]): string {
	if (toolCalls.length === 0) {
		return "No tool calls recorded.";
	}

	return toolCalls
		.map((tc) => {
			const raw =
				typeof tc.output === "string"
					? tc.output
					: (JSON.stringify(tc.output, null, 1) ?? "null");
			const truncated = raw.length > MAX_TOOL_OUTPUT_CHARS;
			const output = truncated
				? `${raw.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n... [truncated ${raw.length - MAX_TOOL_OUTPUT_CHARS} chars]`
				: raw;
			return `[${tc.index}] ${tc.name}:\n${output}`;
		})
		.join("\n\n");
}

export async function judgeQuality(
	evalCase: EvalCase,
	responseText: string,
	toolCalls: ToolCallRecord[],
	judgeModel?: string
): Promise<JudgeResult | null> {
	if (!responseText.trim()) {
		return null;
	}

	const model = judgeModel ?? "zai/glm-5-turbo";
	const toolSection = formatToolOutputs(toolCalls);
	const judgePrompt = getJudgePrompt(evalCase);
	const caseContext = formatCaseContext(evalCase);

	try {
		const result = await generateText({
			model: gateway.chat(model),
			system: judgePrompt,
			prompt: `**User query:** ${evalCase.query}\n\n${caseContext}\n\n**Tool outputs the agent received:**\n${toolSection}\n\n**Agent response:**\n${responseText}`,
			maxOutputTokens: 4096,
			temperature: 0,
		});

		const jsonMatch = result.text.match(JSON_OBJECT_RE);
		if (!jsonMatch) {
			return null;
		}

		const parsed = JSON.parse(jsonMatch[0]) as {
			data_grounding: number;
			analytical_depth: number;
			actionability: number;
			completeness: number;
			communication: number;
			explanation?: string;
		};

		const average = Math.round(
			(parsed.data_grounding +
				parsed.analytical_depth +
				parsed.actionability +
				parsed.completeness +
				parsed.communication) /
				5
		);

		return {
			scores: {
				dataGrounding: parsed.data_grounding,
				analyticalDepth: parsed.analytical_depth,
				actionability: parsed.actionability,
				completeness: parsed.completeness,
				communication: parsed.communication,
				average,
				explanation: parsed.explanation,
			},
			usage: {
				inputTokens: result.usage?.inputTokens ?? 0,
				outputTokens: result.usage?.outputTokens ?? 0,
			},
		};
	} catch (err) {
		console.error(`  [judge] ${err instanceof Error ? err.message : err}`);
		return null;
	}
}

function getJudgePrompt(evalCase: EvalCase): string {
	return evalCase.judgeMode === "slack-teammate"
		? SLACK_TEAMMATE_JUDGE_PROMPT
		: ANALYTICS_JUDGE_PROMPT;
}

function formatCaseContext(evalCase: EvalCase): string {
	if (!evalCase.slack) {
		return "**Conversation context:** No additional conversation context.";
	}

	const threadLines = (evalCase.slack.threadMessages ?? [])
		.map(formatSlackMessage)
		.join("\n");
	const followUpLines = (evalCase.slack.followUpMessages ?? [])
		.map(
			(message) =>
				`- ${message.userId ?? evalCase.slack?.currentUserId ?? "unknown"}: ${message.text}`
		)
		.join("\n");

	return [
		"**Slack context:**",
		`Current user id: ${evalCase.slack.currentUserId}`,
		`Bot user id: ${evalCase.slack.botUserId ?? "unknown"}`,
		`Trigger: ${evalCase.slack.trigger ?? "thread_follow_up"}`,
		"",
		"Thread messages before/current turn:",
		threadLines || "(none)",
		followUpLines ? `\nQueued follow-up messages:\n${followUpLines}` : "",
	].join("\n");
}

function formatSlackMessage(message: SlackEvalMessage): string {
	const author = message.authorName ?? message.userId ?? "unknown";
	return `- ${author}: ${message.text}`;
}
