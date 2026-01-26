export interface AgentContext {
	userId: string;
	websiteId: string;
	websiteDomain: string;
	timezone: string;
	requestHeaders?: Headers;
}

export type AgentType = "triage" | "analytics" | "reflection" | "reflection-max";

export interface StreamConfig {
	maxRounds: number;
	maxSteps: number;
}
