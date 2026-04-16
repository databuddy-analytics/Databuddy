import type {
	LanguageModel,
	StopCondition,
	SystemModelMessage,
	ToolLoopAgent,
	ToolSet,
} from "ai";

// The AI SDK's ProviderOptions type isn't re-exported from `ai`, so pull it
// off the ToolLoopAgent constructor signature instead of adding a direct
// @ai-sdk/provider-utils dep.
type ProviderOptions = NonNullable<
	ConstructorParameters<typeof ToolLoopAgent>[0]["providerOptions"]
>;

/**
 * User-selectable extended thinking level. Maps to Anthropic budget tokens.
 * "off" skips thinking entirely; "low"/"medium"/"high" enable it with
 * increasing budgets.
 */
export type AgentThinking = "off" | "low" | "medium" | "high";

export const AGENT_THINKING_LEVELS: readonly AgentThinking[] = [
	"off",
	"low",
	"medium",
	"high",
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

export type AgentType = "analytics";

export interface AgentConfig {
	experimental_context?: unknown;
	model: LanguageModel;
	providerOptions?: ProviderOptions;
	stopWhen: StopCondition<ToolSet>;
	system: SystemModelMessage;
	temperature: number;
	tools: ToolSet;
}
