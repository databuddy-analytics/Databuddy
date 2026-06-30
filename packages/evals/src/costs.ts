export type ModelTier = "budget" | "mid" | "premium";

export type ModelTag =
	| ModelTier
	| "anthropic"
	| "openai"
	| "google"
	| "xai"
	| "zai"
	| "alibaba"
	| "nvidia"
	| "inception"
	| "deepseek"
	| "minimax"
	| "moonshotai"
	| "xiaomi"
	| "reasoning"
	| "coding"
	| "open-weight";

interface ModelEntry {
	inputPerMToken: number;
	outputPerMToken: number;
	tags: ModelTag[];
}

const MODELS: Record<string, ModelEntry> = {
	"anthropic/claude-sonnet-4": {
		inputPerMToken: 3.0,
		outputPerMToken: 15.0,
		tags: ["premium", "anthropic"],
	},
	"anthropic/claude-sonnet-4.6": {
		inputPerMToken: 3.0,
		outputPerMToken: 15.0,
		tags: ["premium", "anthropic"],
	},
	"anthropic/claude-opus-4.6": {
		inputPerMToken: 5.0,
		outputPerMToken: 25.0,
		tags: ["premium", "anthropic"],
	},

	"openai/gpt-5.5": {
		inputPerMToken: 5.0,
		outputPerMToken: 30.0,
		tags: ["premium", "openai"],
	},
	"openai/gpt-5.4-mini": {
		inputPerMToken: 0.75,
		outputPerMToken: 4.5,
		tags: ["mid", "openai"],
	},
	"openai/gpt-5.4-nano": {
		inputPerMToken: 0.2,
		outputPerMToken: 1.25,
		tags: ["budget", "openai"],
	},
	"openai/gpt-5.3-codex": {
		inputPerMToken: 1.75,
		outputPerMToken: 14.0,
		tags: ["mid", "openai", "coding"],
	},
	"openai/o4-mini": {
		inputPerMToken: 1.1,
		outputPerMToken: 4.4,
		tags: ["mid", "openai", "reasoning"],
	},
	"openai/gpt-oss-120b": {
		inputPerMToken: 0.1,
		outputPerMToken: 0.5,
		tags: ["budget", "openai", "open-weight"],
	},

	"google/gemini-2.5-flash-lite": {
		inputPerMToken: 0.1,
		outputPerMToken: 0.4,
		tags: ["budget", "google"],
	},
	"google/gemini-3.1-pro-preview": {
		inputPerMToken: 2.0,
		outputPerMToken: 12.0,
		tags: ["mid", "google"],
	},
	"google/gemini-3-flash": {
		inputPerMToken: 0.5,
		outputPerMToken: 3.0,
		tags: ["budget", "google"],
	},

	"xai/grok-4.20-reasoning-beta": {
		inputPerMToken: 1.25,
		outputPerMToken: 2.5,
		tags: ["mid", "xai", "reasoning"],
	},
	"xai/grok-4.20-non-reasoning-beta": {
		inputPerMToken: 1.25,
		outputPerMToken: 2.5,
		tags: ["mid", "xai"],
	},
	"xai/grok-4.3": {
		inputPerMToken: 1.25,
		outputPerMToken: 2.5,
		tags: ["mid", "xai"],
	},

	"zai/glm-5-turbo": {
		inputPerMToken: 1.2,
		outputPerMToken: 4.0,
		tags: ["mid", "zai"],
	},
	"zai/glm-5.1": {
		inputPerMToken: 1.4,
		outputPerMToken: 4.4,
		tags: ["mid", "zai", "open-weight", "coding"],
	},

	"alibaba/qwen3.5-flash": {
		inputPerMToken: 0.065,
		outputPerMToken: 0.26,
		tags: ["budget", "alibaba", "open-weight"],
	},

	"inception/mercury-2": {
		inputPerMToken: 0.25,
		outputPerMToken: 0.75,
		tags: ["budget", "inception", "open-weight"],
	},

	"deepseek/deepseek-v4-flash": {
		inputPerMToken: 0.14,
		outputPerMToken: 0.28,
		tags: ["budget", "deepseek"],
	},
	"deepseek/deepseek-v4-pro": {
		inputPerMToken: 1.74,
		outputPerMToken: 3.48,
		tags: ["mid", "deepseek"],
	},
	"deepseek/deepseek-r1": {
		inputPerMToken: 0.55,
		outputPerMToken: 2.19,
		tags: ["budget", "deepseek", "reasoning"],
	},

	"minimax/minimax-m2.7": {
		inputPerMToken: 0.3,
		outputPerMToken: 1.2,
		tags: ["budget", "minimax", "open-weight", "reasoning"],
	},

	"moonshotai/kimi-k2.5": {
		inputPerMToken: 0.44,
		outputPerMToken: 2.0,
		tags: ["budget", "moonshotai", "open-weight"],
	},
	"moonshotai/kimi-k2.6": {
		inputPerMToken: 0.6,
		outputPerMToken: 2.5,
		tags: ["mid", "moonshotai", "open-weight"],
	},

	"xiaomi/mimo-v2.5-pro": {
		inputPerMToken: 1.0,
		outputPerMToken: 3.0,
		tags: ["mid", "xiaomi", "open-weight"],
	},
};

function modelEnvKey(modelId: string, suffix: "INPUT" | "OUTPUT"): string {
	return `EVAL_PRICE_${modelId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}_${suffix}_PER_MTOKEN`;
}

function getModelPricing(modelId: string): ModelEntry | undefined {
	const configured = MODELS[modelId];
	if (configured) {
		return configured;
	}

	const input = Number.parseFloat(
		process.env[modelEnvKey(modelId, "INPUT")] ?? ""
	);
	const output = Number.parseFloat(
		process.env[modelEnvKey(modelId, "OUTPUT")] ?? ""
	);
	if (!(Number.isFinite(input) && Number.isFinite(output))) {
		return;
	}
	return { inputPerMToken: input, outputPerMToken: output, tags: [] };
}

export function getPricingEnvKeys(modelId: string): {
	input: string;
	output: string;
} {
	return {
		input: modelEnvKey(modelId, "INPUT"),
		output: modelEnvKey(modelId, "OUTPUT"),
	};
}

export function hasModelPricing(modelId: string): boolean {
	return !!getModelPricing(modelId);
}

export function computeCaseCost(
	modelId: string,
	inputTokens: number,
	outputTokens: number
): number {
	if (inputTokens === 0 && outputTokens === 0) {
		return 0;
	}
	const entry = getModelPricing(modelId);
	if (!entry) {
		return 0;
	}
	return (
		(inputTokens / 1_000_000) * entry.inputPerMToken +
		(outputTokens / 1_000_000) * entry.outputPerMToken
	);
}

export function allModelIds(): string[] {
	return Object.keys(MODELS);
}

export function filterModels(expr: string): string[] {
	const parts = expr.split(",").map((s) => s.trim().toLowerCase());
	const include: string[] = [];
	const exclude: string[] = [];

	for (const part of parts) {
		if (part.startsWith("!")) {
			exclude.push(part.slice(1));
		} else {
			include.push(part);
		}
	}

	return Object.entries(MODELS)
		.filter(([, entry]) => {
			if (exclude.length > 0 && entry.tags.some((t) => exclude.includes(t))) {
				return false;
			}
			if (include.length > 0) {
				return entry.tags.some((t) => include.includes(t));
			}
			return true;
		})
		.map(([id]) => id);
}

export function getModelTags(modelId: string): ModelTag[] {
	return MODELS[modelId]?.tags ?? [];
}

export function listTags(): string[] {
	const tags = new Set<string>();
	for (const entry of Object.values(MODELS)) {
		for (const t of entry.tags) {
			tags.add(t);
		}
	}
	return [...tags].sort();
}
