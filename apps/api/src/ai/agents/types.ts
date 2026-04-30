import type { LanguageModelV3 } from "@ai-sdk/provider";
import type {
	StopCondition,
	SystemModelMessage,
	ToolLoopAgent,
	ToolSet,
} from "ai";

type ProviderOptions = NonNullable<
	ConstructorParameters<typeof ToolLoopAgent>[0]["providerOptions"]
>;

export type AgentThinking = "off" | "low" | "medium" | "high";

export const AGENT_THINKING_LEVELS: readonly AgentThinking[] = [
	"off",
	"low",
	"medium",
	"high",
] as const;

export type AgentTier = "quick" | "balanced" | "deep";

export const AGENT_TIERS: readonly AgentTier[] = [
	"quick",
	"balanced",
	"deep",
] as const;

export interface AgentContext {
	billingCustomerId?: string | null;
	chatId: string;
	requestHeaders?: Headers;
	thinking?: AgentThinking;
	timezone: string;
	userId: string;
	websiteDomain: string;
	websiteId: string;
}

export interface AgentConfig {
	experimental_context?: unknown;
	model: LanguageModelV3;
	providerOptions?: ProviderOptions;
	stopWhen: StopCondition<ToolSet>;
	system: SystemModelMessage;
	temperature: number;
	tools: ToolSet;
}
