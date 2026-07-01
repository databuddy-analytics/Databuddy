"use client";

import { useRouter } from "next/navigation";
import { AgentLoadingSkeleton } from "@/components/agent/agent-loading-skeleton";
import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { clearLastChatId } from "@/components/agent/hooks/use-chat-db";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { ChatProvider } from "@/contexts/chat-context";

interface AgentPageClientProps {
	chatId: string;
	websiteId: string;
}

export function AgentPageClient({ chatId, websiteId }: AgentPageClientProps) {
	const router = useRouter();
	const { activeOrganizationId, isLoading } = useOrganizationsContext();
	const basePath = `/websites/${websiteId}/agent`;

	if (isLoading) {
		return <AgentLoadingSkeleton />;
	}

	return (
		<ChatProvider
			chatId={chatId}
			defaultWebsiteId={websiteId}
			organizationId={activeOrganizationId}
		>
			<AgentWorkspace
				chatId={chatId}
				defaultWebsiteId={websiteId}
				onCurrentChatDeleted={(nextChatId) => {
					if (nextChatId) {
						router.push(`${basePath}/${nextChatId}`);
					} else {
						clearLastChatId(websiteId);
						router.push(basePath);
					}
				}}
				onNewChat={(newChatId) => router.push(`${basePath}/${newChatId}`)}
				onSelectChat={(nextChatId) => router.push(`${basePath}/${nextChatId}`)}
				organizationId={activeOrganizationId}
			/>
		</ChatProvider>
	);
}
