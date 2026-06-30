"use client";

import { generateId } from "ai";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { type Website, useWebsitesLight } from "@/hooks/use-websites";
import { getLastChatId, setLastChatId } from "./hooks/use-chat-db";

interface GlobalAgentContextValue {
	chatId: string | null;
	hasWebsites: boolean;
	isLoading: boolean;
	loadChat: (chatId: string) => void;
	newChat: () => void;
	organizationId: string | null;
	websites: Website[];
}

const GlobalAgentContext = createContext<GlobalAgentContextValue | null>(null);

export function GlobalAgentProvider({ children }: { children: ReactNode }) {
	const { activeOrganizationId, isLoading: isLoadingOrg } =
		useOrganizationsContext();
	const { websites, isLoading: isLoadingWebsites } = useWebsitesLight();
	const [chatId, setChatId] = useState<string | null>(null);

	useEffect(() => {
		if (!activeOrganizationId) {
			setChatId(null);
			return;
		}
		const nextChatId = getLastChatId(activeOrganizationId) ?? generateId();
		setLastChatId(activeOrganizationId, nextChatId);
		setChatId(nextChatId);
	}, [activeOrganizationId]);

	const loadChat = useCallback(
		(nextChatId: string) => {
			if (!activeOrganizationId) {
				return;
			}
			setLastChatId(activeOrganizationId, nextChatId);
			setChatId(nextChatId);
		},
		[activeOrganizationId]
	);

	const newChat = useCallback(() => {
		loadChat(generateId());
	}, [loadChat]);

	const value = useMemo(
		(): GlobalAgentContextValue => ({
			chatId,
			hasWebsites: websites.length > 0,
			isLoading: isLoadingOrg || isLoadingWebsites,
			loadChat,
			newChat,
			organizationId: activeOrganizationId,
			websites,
		}),
		[
			chatId,
			websites,
			isLoadingOrg,
			isLoadingWebsites,
			loadChat,
			newChat,
			activeOrganizationId,
		]
	);

	return (
		<GlobalAgentContext.Provider value={value}>
			{children}
		</GlobalAgentContext.Provider>
	);
}

export function useGlobalAgent() {
	const context = useContext(GlobalAgentContext);
	if (!context) {
		throw new Error("useGlobalAgent must be used within GlobalAgentProvider");
	}
	return context;
}
