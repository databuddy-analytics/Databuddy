import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const agentInputAtom = atom("");

export type AgentThinking = "off" | "low" | "medium" | "high";

export const AGENT_THINKING_LEVELS: readonly AgentThinking[] = [
	"off",
	"low",
	"medium",
	"high",
] as const;

export const agentThinkingAtom = atomWithStorage<AgentThinking>(
	"databuddy-agent-thinking",
	"off"
);
