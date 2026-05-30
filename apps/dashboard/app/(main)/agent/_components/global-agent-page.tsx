"use client";

import { useRouter } from "next/navigation";
import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { clearLastChatId } from "@/components/agent/hooks/use-chat-db";
import { ChatProvider } from "@/contexts/chat-context";
import { AgentGatePlaceholder, useAgentGate } from "./agent-gate";

export function GlobalAgentPage({ chatId }: { chatId: string }) {
	const router = useRouter();
	const gate = useAgentGate();

	if (gate.status !== "ready") {
		return <AgentGatePlaceholder status={gate.status} />;
	}

	const { organizationId } = gate;

	return (
		<ChatProvider chatId={chatId} organizationId={organizationId}>
			<AgentWorkspace
				chatId={chatId}
				onCurrentChatDeleted={(nextChatId) => {
					if (nextChatId) {
						router.push(`/agent/${nextChatId}`);
					} else {
						clearLastChatId(organizationId);
						router.push("/agent");
					}
				}}
				onNewChat={(newChatId) => router.push(`/agent/${newChatId}`)}
				onSelectChat={(nextChatId) => router.push(`/agent/${nextChatId}`)}
				organizationId={organizationId}
			/>
		</ChatProvider>
	);
}
