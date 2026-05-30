import { GlobalAgentPage } from "../_components/global-agent-page";

interface Props {
	params: Promise<{ chatId: string }>;
}

export default async function AgentChatPage(props: Props) {
	const { chatId } = await props.params;

	return <GlobalAgentPage chatId={chatId} />;
}
