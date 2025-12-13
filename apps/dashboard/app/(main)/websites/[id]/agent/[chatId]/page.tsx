import type { UIMessage } from "ai";
import { Suspense } from "react";
import { ChatProvider } from "@/contexts/chat-context";
import { getServerRPCClient } from "@/lib/orpc-server";
import { AgentPageClient } from "../_components/agent-page-client";

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
		<ChatProvider chatId={chatId} initialMessages={initialMessages}>
			<Suspense fallback={<AgentPageSkeleton />}>
				<AgentPageClient chatId={chatId} websiteId={id} />
			</Suspense>
		</ChatProvider>
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
