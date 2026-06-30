import type { AgentModelKey } from "../config/models";

export type AgentTier = "quick" | "balanced" | "deep";

export const AGENT_TIERS: readonly AgentTier[] = [
	"quick",
	"balanced",
	"deep",
] as const;

export function tierToModelKey(tier: AgentTier): AgentModelKey {
	return tier;
}
