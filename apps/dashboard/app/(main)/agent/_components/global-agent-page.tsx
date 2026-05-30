"use client";

import { useRouter } from "next/navigation";
import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { useGlobalAgent } from "@/components/agent/global-agent-provider";
import { ChatProvider } from "@/contexts/chat-context";
import { Skeleton } from "@databuddy/ui";
import { AgentNoWebsites } from "./agent-no-websites";

export function GlobalAgentPage({ chatId }: { chatId: string }) {
	const router = useRouter();
	const { organizationId, hasWebsites, isLoading } = useGlobalAgent();

	if (organizationId && !(isLoading || hasWebsites)) {
		return <AgentNoWebsites />;
	}

	if (isLoading || !organizationId) {
		return (
			<div className="flex h-full flex-col gap-3 p-4">
				<Skeleton className="h-8 w-48 rounded" />
				<Skeleton className="h-full w-full rounded" />
			</div>
		);
	}

	return (
		<ChatProvider chatId={chatId} organizationId={organizationId}>
			<AgentWorkspace
				chatId={chatId}
				onCurrentChatDeleted={(nextChatId) =>
					router.push(nextChatId ? `/agent/${nextChatId}` : "/agent")
				}
				onNewChat={(newChatId) => router.push(`/agent/${newChatId}`)}
				onSelectChat={(nextChatId) => router.push(`/agent/${nextChatId}`)}
				organizationId={organizationId}
			/>
		</ChatProvider>
	);
}
