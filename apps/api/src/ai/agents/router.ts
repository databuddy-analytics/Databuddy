import { generateText } from "ai";
import type { AgentModelKey } from "../config/models";
import { models } from "../config/models";

export type AgentTier = "greeter" | "quick" | "balanced" | "deep";

const EXPLICIT_SIMPLE =
	/^(?:hi|hey|hello|yo|sup|wassup|what's up|thanks?|thx|ty|ok(?:ay)?|cool|nice|great|awesome|got it|huh|what\??|what the (?:heck|hell|fuck)|wtf|lol|lmao|bye|cheers|nvm|never ?mind|no problem|np|alright|sure|yep|yeah|yup|nope|nah|no)[\s.!?]*$/i;

const CLASSIFIER_SYSTEM = `Classify this analytics question into exactly one tier. Respond with a single word only.

quick - Simple data lookup. One metric, one filter, yes/no answer. Examples: "how many visitors today", "what's the bounce rate", "top 5 pages"
balanced - Multi-step analysis. Comparisons, trends, breakdowns across dimensions. Examples: "compare mobile vs desktop engagement", "show traffic trends by source over 30 days"
deep - Complex synthesis requiring multiple data sources, cross-referencing, quantified recommendations, or board-ready output. Examples: "build an international expansion priority matrix scored 1-10", "trace the funnel from organic Google to pricing and quantify the opportunity cost of each leak"`;

const VALID_TIERS = new Set<AgentTier>(["quick", "balanced", "deep"]);

export async function classifyMessage(
	text: string,
	hasToolHistory: boolean
): Promise<AgentTier> {
	const trimmed = text.trim();

	if (!trimmed) {
		return "balanced";
	}

	if (hasToolHistory) {
		return "balanced";
	}

	if (trimmed.length <= 40 && EXPLICIT_SIMPLE.test(trimmed)) {
		return "greeter";
	}

	try {
		const result = await generateText({
			model: models.tiny,
			system: CLASSIFIER_SYSTEM,
			prompt: trimmed.slice(0, 500),
			maxOutputTokens: 4,
			temperature: 0,
		});

		const tier = result.text.trim().toLowerCase() as AgentTier;
		return VALID_TIERS.has(tier) ? tier : "balanced";
	} catch {
		return "balanced";
	}
}

export function tierToModelKey(tier: AgentTier): AgentModelKey {
	return tier as AgentModelKey;
}

export interface RouteMessage {
	parts?: Array<{ type?: string }>;
}

export function hasToolHistory(messages: RouteMessage[]): boolean {
	return messages.some((message) =>
		message.parts?.some((part) => part.type?.startsWith("tool-"))
	);
}
