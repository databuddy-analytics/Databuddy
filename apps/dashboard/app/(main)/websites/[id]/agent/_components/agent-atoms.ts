import type { UIMessage } from "ai";
import { atom } from "jotai";

export type AgentStatus =
    | "idle"
    | "routing"
    | "thinking"
    | "analyzing"
    | "searching"
    | "generating"
    | "visualizing"
    | "complete"
    | "error";

export type AgentCommand = {
    id: string;
    command: string;
    title: string;
    description: string;
    toolName: string;
    toolParams?: Record<string, unknown>;
    keywords: string[];
};

export const agentMessagesAtom = atom<UIMessage[]>([]);
export const agentStatusAtom = atom<
    "idle" | "streaming" | "submitted" | "error"
>("idle");

export const agentTitleAtom = atom<string | null>(null);
export const agentInputAtom = atom("");
export const agentSuggestionsAtom = atom<string[]>([]);

export const showCommandsAtom = atom(false);
export const commandQueryAtom = atom("");
export const selectedCommandIndexAtom = atom(0);

export const resetAgentUIAtom = atom(null, (_get, set) => {
    set(agentTitleAtom, null);
    set(agentInputAtom, "");
    set(agentSuggestionsAtom, []);
    set(showCommandsAtom, false);
    set(commandQueryAtom, "");
    set(selectedCommandIndexAtom, 0);
});

export const resetAgentMessagesAtom = atom(null, (_get, set) => {
    set(agentMessagesAtom, []);
    set(agentStatusAtom, "idle");
});
