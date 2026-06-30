import { trackAgentUsageAndBill } from "@databuddy/ai/agents/execution";
import { createModelFromId } from "@databuddy/ai/config/models";
import { getAILogger } from "@databuddy/ai/lib/ai-logger";
import type { ParsedInsight } from "@databuddy/ai/schemas/smart-insights-output";
import { generateObject } from "ai";
import { z } from "zod";
import {
	captureInsightsError,
	emitInsightsEvent,
	setInsightsLog,
} from "./lib/evlog-insights";

const REFLECTION_MODEL_ID = "openai/gpt-5.4-mini";
const REFLECTION_MODEL = createModelFromId(REFLECTION_MODEL_ID);
const KEEP_SCORE_THRESHOLD = 5;
const REFLECTION_TIMEOUT_MS = 30_000;

const reviewSchema = z.object({
	index: z.number().int().describe("Index of the card being reviewed."),
	keep: z.boolean(),
	score: z
		.number()
		.min(0)
		.max(10)
		.describe("Worth-surfacing-today score: actionability x novelty x impact."),
	reason: z.string().describe("One line explaining the score."),
});

const reflectionSchema = z.object({
	reviews: z.array(reviewSchema),
});

export type InsightReview = z.infer<typeof reviewSchema>;

const REFLECTION_SYSTEM = [
	"You are a ruthless editor for an operator-facing analytics feed.",
	"Keep only findings that change what an operator does this week. Drop vanity metrics, restated numbers, vague 'monitor this' advice, and anything a busy founder would scroll past.",
	"Score each card 0-10 on actionability x novelty x business impact. A reliability or conversion issue outranks a traffic vanity spike.",
	"Return exactly one review per card, referencing its index. Set keep=true only when the card earns a slot in a short, high-signal feed.",
].join(" ");

function formatCards(insights: ParsedInsight[]): string {
	return insights
		.map((insight, index) =>
			[
				`#${index} [${insight.severity}/${insight.type}] ${insight.title}`,
				`  change: ${insight.changePercent ?? "n/a"}% | priority: ${insight.priority} | confidence: ${insight.confidence}`,
				`  so what: ${insight.description}`,
				`  action: ${insight.suggestion}`,
			].join("\n")
		)
		.join("\n\n");
}

export function selectReflectedInsights<T>(
	insights: T[],
	reviews: InsightReview[],
	maxKeep: number
): T[] {
	const scoreByIndex = new Map<number, number>();
	const kept: number[] = [];
	for (const review of reviews) {
		if (
			!Number.isInteger(review.index) ||
			review.index < 0 ||
			review.index >= insights.length
		) {
			continue;
		}
		scoreByIndex.set(review.index, review.score);
		if (review.keep && review.score >= KEEP_SCORE_THRESHOLD) {
			kept.push(review.index);
		}
	}

	if (scoreByIndex.size === 0) {
		return insights.slice(0, maxKeep);
	}

	if (kept.length === 0) {
		const [bestIndex] = [...scoreByIndex.entries()].sort(
			(a, b) => b[1] - a[1]
		)[0];
		return [insights[bestIndex]];
	}

	return kept
		.sort((a, b) => (scoreByIndex.get(b) ?? 0) - (scoreByIndex.get(a) ?? 0))
		.slice(0, maxKeep)
		.map((index) => insights[index]);
}

export interface ReflectionContext {
	billingCustomerId: string | null;
	chatId: string;
	organizationId: string;
	userId?: string;
	websiteId: string;
}

export async function reflectAndRank(
	insights: ParsedInsight[],
	maxKeep: number,
	context: ReflectionContext
): Promise<ParsedInsight[]> {
	if (insights.length <= 1) {
		return insights.slice(0, maxKeep);
	}

	try {
		const ai = getAILogger();
		const result = await generateObject({
			model: ai.wrap(REFLECTION_MODEL),
			schema: reflectionSchema,
			system: REFLECTION_SYSTEM,
			prompt: `Review these ${insights.length} insight cards and decide which to keep.\n\n${formatCards(insights)}`,
			temperature: 0,
			maxRetries: 1,
			abortSignal: AbortSignal.timeout(REFLECTION_TIMEOUT_MS),
			experimental_telemetry: {
				isEnabled: true,
				functionId: "databuddy.insights.worker.reflection",
				metadata: {
					source: "insights_worker",
					feature: "smart_insights",
					organizationId: context.organizationId,
					websiteId: context.websiteId,
				},
			},
		});

		await trackAgentUsageAndBill({
			usage: result.usage,
			modelId: REFLECTION_MODEL_ID,
			source: "insights",
			organizationId: context.organizationId,
			userId: context.userId ?? null,
			chatId: context.chatId,
			billingCustomerId: context.billingCustomerId,
			websiteId: context.websiteId,
		});

		const selected = selectReflectedInsights(
			insights,
			result.object.reviews,
			maxKeep
		);
		emitInsightsEvent("info", "generation.reflection.completed", {
			organization_id: context.organizationId,
			website_id: context.websiteId,
			input_count: insights.length,
			kept_count: selected.length,
		});
		setInsightsLog({
			reflection_input_count: insights.length,
			reflection_kept_count: selected.length,
		});
		return selected;
	} catch (error) {
		captureInsightsError(error, "generation.reflection.failed", {
			organization_id: context.organizationId,
			website_id: context.websiteId,
		});
		return insights.slice(0, maxKeep);
	}
}
