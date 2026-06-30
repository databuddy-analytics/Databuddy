import { AgentPageClient } from "../_components/agent-page-client";

interface Props {
	params: Promise<{ id: string; chatId: string }>;
}

export default async function AgentPage(props: Props) {
	const { id, chatId } = await props.params;

	return <AgentPageClient chatId={chatId} websiteId={id} />;
}
