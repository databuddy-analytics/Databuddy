import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const agentInputAtom = atom("");

export type AgentThinking = "off" | "low" | "medium" | "high";
export type AgentTier = "quick" | "balanced" | "deep";

export const AGENT_THINKING_LEVELS: readonly AgentThinking[] = [
	"off",
	"low",
	"medium",
	"high",
] as const;

export const AGENT_TIERS: readonly AgentTier[] = [
	"quick",
	"balanced",
	"deep",
] as const;

export const agentThinkingAtom = atomWithStorage<AgentThinking>(
	"databuddy-agent-thinking",
	"off"
);

export const agentTierAtom = atomWithStorage<AgentTier>(
	"databuddy-agent-tier",
	"balanced"
);

export const agentCreditShakeNonceAtom = atom(0);
