import { createGateway, generateText } from "ai";
import type { EvalCase, EvalConfig } from "./types";

const JSON_OBJECT_RE = /\{[^}]+\}/;

const JUDGE_PROMPT = `You are a brutally honest evaluator of an analytics AI agent. You have extremely high standards — you are a senior data analyst who has seen hundreds of reports and dashboards. You score like a tough professor: 90+ is exceptional work that would impress a VP, 70 is acceptable but unremarkable, 50 is mediocre, below 40 is bad.

Score the response on 5 criteria (0-100 each). Be harsh. Most responses should score 40-70.

1. **Data Grounding (0-100)**: Every claim must be backed by a specific number from the tool results. Deduct heavily for:
   - Vague statements without numbers ("traffic increased" without saying by how much)
   - Rounded/approximated numbers when exact data was available
   - Claims that don't match the actual data returned
   - Missing key metrics that were available in the data
   Score 90+ only if EVERY statement references a specific number

2. **Analytical Depth (0-100)**: Does the response go beyond surface-level "here's the data"? Deduct for:
   - Just listing numbers without explaining what they MEAN
   - Missing obvious correlations or patterns in the data
   - Not comparing to relevant baselines (prior period, industry standard)
   - No segmentation (treating all traffic as one bucket)
   Score 90+ only if the analysis reveals non-obvious insights

3. **Actionability (0-100)**: Are the recommendations specific and implementable? Deduct for:
   - Generic advice ("improve your SEO", "optimize for mobile")
   - Recommendations not tied to specific data findings
   - No prioritization (everything presented as equally important)
   - No estimated impact or effort level
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

Respond with ONLY a JSON object:
{"data_grounding": N, "analytical_depth": N, "actionability": N, "completeness": N, "communication": N}`;

const gateway = createGateway({
	apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.AI_API_KEY ?? "",
	headers: {
		"HTTP-Referer": "https://www.databuddy.cc/",
		"X-Title": "Databuddy Evals",
	},
});

/**
 * Use an LLM to judge response quality with a harsh, specific rubric.
 * Returns quality score 0-100 (average of 5 sub-scores).
 */
export async function judgeQuality(
	evalCase: EvalCase,
	responseText: string,
	config: EvalConfig
): Promise<number> {
	if (config.skipJudge) {
		return -1;
	}
	if (!responseText.trim()) {
		return -1;
	}

	const model = config.judgeModel ?? "anthropic/claude-sonnet-4.6";

	try {
		const result = await generateText({
			model: gateway.chat(model),
			system: JUDGE_PROMPT,
			prompt: `**User query:** ${evalCase.query}\n\n**Agent response (may be truncated):**\n${responseText.slice(0, 4000)}`,
			maxTokens: 300,
			temperature: 0,
		});

		const jsonMatch = result.text.match(JSON_OBJECT_RE);
		if (!jsonMatch) {
			return -1;
		}

		const parsed = JSON.parse(jsonMatch[0]) as {
			data_grounding: number;
			analytical_depth: number;
			actionability: number;
			completeness: number;
			communication: number;
		};

		return Math.round(
			(parsed.data_grounding +
				parsed.analytical_depth +
				parsed.actionability +
				parsed.completeness +
				parsed.communication) /
				5
		);
	} catch (err) {
		console.error(`  [judge] ${err instanceof Error ? err.message : err}`);
		return -1;
	}
}
