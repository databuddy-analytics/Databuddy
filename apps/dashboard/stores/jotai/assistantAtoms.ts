import { atom } from "jotai";
import type { FullTabProps } from "@/app/(main)/websites/[id]/_components/utils/types";

export type AssistantModel = "chat" | "deep-research" | string;

export interface Message {
	content: string;
	createdAt?: Date;
	id: string;
	role: "user" | "assistant" | "system";
	[key: string]: unknown;
}

export const modelAtom = atom<AssistantModel>("chat");
export const websiteIdAtom = atom<string | null>(null);
export const websiteDataAtom = atom<FullTabProps["websiteData"] | null>(null);
export const dateRangeAtom = atom<{
	start_date: string;
	end_date: string;
	granularity: string;
} | null>(null);
export const messagesAtom = atom<Message[]>([]);
export const inputValueAtom = atom<string>("");
export const isLoadingAtom = atom<boolean>(false);
export const isRateLimitedAtom = atom<boolean>(false);
export const isInitializedAtom = atom<boolean>(false);
export const currentMessageAtom = atom<Message | undefined>(undefined);
