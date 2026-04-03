import type {
	LanguageModel,
	StopCondition,
	SystemModelMessage,
	ToolSet,
} from "ai";

export interface AgentContext {
	chatId: string;
	requestHeaders?: Headers;
	timezone: string;
	userId: string;
	websiteDomain: string;
	websiteId: string;
}

export type AgentType =
	| "triage"
	| "analytics"
	| "reflection"
	| "reflection-max";

export interface AgentConfig {
	experimental_context?: unknown;
	model: LanguageModel;
	providerOptions?: Record<string, Record<string, unknown>>;
	stopWhen: StopCondition<ToolSet>;
	system: SystemModelMessage;
	temperature: number;
	tools: ToolSet;
}
