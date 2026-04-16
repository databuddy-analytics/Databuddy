import { ChatProvider } from "@/contexts/chat-context";
import { AgentPageClient } from "../_components/agent-page-client";

interface Props {
	params: Promise<{ id: string; chatId: string }>;
}

export default async function AgentPage(props: Props) {
	const { id, chatId } = await props.params;

	return (
		<ChatProvider chatId={chatId} websiteId={id}>
			<AgentPageClient chatId={chatId} websiteId={id} />
		</ChatProvider>
	);
}
