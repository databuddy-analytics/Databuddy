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

export const REFLECTION_MODEL_ID = "google/gemini-2.5-flash-lite";
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
	rewrite: z
		.object({
			title: z.string(),
			description: z.string(),
			suggestion: z.string(),
			impactSummary: z
				.string()
				.nullable()
				.describe("Empty string or null when it adds nothing new."),
		})
		.nullable()
		.describe(
			"null unless the kept card fails the voice rules. When set, same facts in plain DM voice; use only numbers already present in the card, never invent or recompute."
		),
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
	"Every kept card also gets a voice check. It reads like a DM to a teammate or it fails.",
	"A kept card MUST get a rewrite (this is not optional) if its title or description contains any of: an arrow ('→' or '->'), a parenthetical delta like '(up from 10)' or '(-40%)', a bare percentage change in the prose like '380%' or 'increased by 40%', a raw event name like signup_started, a drama word (cratered, collapsed, plummeted), or an editorializing adverb (quietly, essentially, notably). These are the common failures and they are frequent.",
	"In a rewrite, never state a percentage change in the sentence; use the actual before/after counts in plain words or leave the percentage to the metrics.",
	"A rewrite keeps the same facts in plain voice: what happened, what it means, one concrete action. Move the raw numbers out of the prose into at most two that carry the point; use only numbers already on the card, never invent or recompute. Set rewrite to null only when the card is already clean.",
].join(" ");

function formatCards(insights: ParsedInsight[]): string {
	return insights
		.map((insight, index) => {
			const lines = [
				`#${index} [${insight.severity}/${insight.type}] ${insight.title}`,
				`  change: ${insight.changePercent ?? "n/a"}% | priority: ${insight.priority} | confidence: ${insight.confidence}`,
				`  so what: ${insight.description}`,
				`  action: ${insight.suggestion}`,
			];
			if (insight.impactSummary) {
				lines.push(`  impact: ${insight.impactSummary}`);
			}
			if (insight.metrics?.length) {
				lines.push(
					`  metrics: ${insight.metrics
						.map(
							(m) =>
								`${m.label}=${m.current}${m.previous === undefined ? "" : ` (prev ${m.previous})`}`
						)
						.join(", ")}`
				);
			}
			return lines.join("\n");
		})
		.join("\n\n");
}

export function applyReviewRewrites(
	insights: ParsedInsight[],
	reviews: InsightReview[]
): ParsedInsight[] {
	const rewritten = [...insights];
	for (const review of reviews) {
		const rewrite = review.rewrite;
		if (!(rewrite && review.keep)) {
			continue;
		}
		if (!Number.isInteger(review.index)) {
			continue;
		}
		if (review.index < 0 || review.index >= insights.length) {
			continue;
		}
		if (!(rewrite.title.trim() && rewrite.description.trim())) {
			continue;
		}
		const original = insights[review.index];
		rewritten[review.index] = {
			...original,
			title: rewrite.title,
			description: rewrite.description,
			suggestion: rewrite.suggestion.trim()
				? rewrite.suggestion
				: original.suggestion,
			impactSummary: rewrite.impactSummary?.trim()
				? rewrite.impactSummary
				: undefined,
		};
	}
	return rewritten;
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
		return [];
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
	context: ReflectionContext,
	modelId: string = REFLECTION_MODEL_ID
): Promise<ParsedInsight[]> {
	if (insights.length === 0) {
		return [];
	}

	try {
		const ai = getAILogger();
		const model =
			modelId === REFLECTION_MODEL_ID
				? REFLECTION_MODEL
				: createModelFromId(modelId);
		const result = await generateObject({
			model: ai.wrap(model),
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
			modelId,
			source: "insights",
			organizationId: context.organizationId,
			userId: context.userId ?? null,
			chatId: context.chatId,
			billingCustomerId: context.billingCustomerId,
			websiteId: context.websiteId,
		});

		const rewritten = applyReviewRewrites(insights, result.object.reviews);
		const selected = selectReflectedInsights(
			rewritten,
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
