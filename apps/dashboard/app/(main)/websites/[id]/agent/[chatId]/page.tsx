import type { UIMessage } from "ai";
import { Suspense } from "react";
import { getServerRPCClient } from "@/lib/orpc-server";
import { AgentPageClient } from "../_components/agent-page-client";
import { ChatProviderWrapper } from "../_components/chat-provider-wrapper";

type Props = {
	params: Promise<{ id: string; chatId: string }>;
};

export default async function AgentPage(props: Props) {
	const { id, chatId } = await props.params;

	let initialMessages: UIMessage[] = [];

	try {
		const rpcClient = await getServerRPCClient();
		const chat = await rpcClient.agent.getMessages({ chatId, websiteId: id });
		initialMessages = (chat?.messages ?? []) as UIMessage[];
	} catch {
		initialMessages = [];
	}

	return (
		// <FeatureGate feature={GATED_FEATURES.AI_AGENT}>
		<ChatProviderWrapper chatId={chatId} initialMessages={initialMessages}>
			<Suspense fallback={<AgentPageSkeleton />}>
				<AgentPageClient
					chatId={chatId}
					initialMessages={initialMessages}
					websiteId={id}
				/>
			</Suspense>
		</ChatProviderWrapper>
		// </FeatureGate>
	);
}

function AgentPageSkeleton() {
	return (
		<div className="flex h-full items-center justify-center">
			<div className="animate-pulse text-muted-foreground text-sm">
				Loading agent...
			</div>
		</div>
	);
}
