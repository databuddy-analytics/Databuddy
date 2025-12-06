"use client";

import { useParams, useRouter } from "next/navigation";
import { createContext, useContext } from "react";

type AgentChatContextValue = {
	chatId: string;
	setChatId: (id: string) => void;
};

const AgentChatContext = createContext<AgentChatContextValue | null>(null);

type AgentChatProviderProps = {
	chatId: string;
	children: React.ReactNode;
};

export function AgentChatProvider({
	chatId,
	children,
}: AgentChatProviderProps) {
	const params = useParams();
	const router = useRouter();
	const websiteId = params.id as string;

	const setChatId = (id: string) => {
		router.push(`/websites/${websiteId}/agent/${id}`);
	};

	return (
		<AgentChatContext.Provider value={{ chatId, setChatId }}>
			{children}
		</AgentChatContext.Provider>
	);
}

export function useAgentChatId(): string {
	const context = useContext(AgentChatContext);
	if (!context) {
		throw new Error("useAgentChatId must be used within AgentChatProvider");
	}
	return context.chatId;
}

export function useSetAgentChatId(): (id: string) => void {
	const context = useContext(AgentChatContext);
	if (!context) {
		throw new Error("useSetAgentChatId must be used within AgentChatProvider");
	}
	return context.setChatId;
}
