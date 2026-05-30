"use client";

import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { ChatProvider } from "@/contexts/chat-context";

interface AgentPageClientProps {
	chatId: string;
	websiteId: string;
}

export function AgentPageClient({ chatId, websiteId }: AgentPageClientProps) {
	const { activeOrganizationId } = useOrganizationsContext();

	return (
		<ChatProvider
			chatId={chatId}
			defaultWebsiteId={websiteId}
			organizationId={activeOrganizationId}
		>
			<AgentWorkspace
				chatId={chatId}
				defaultWebsiteId={websiteId}
				organizationId={activeOrganizationId}
			/>
		</ChatProvider>
	);
}
