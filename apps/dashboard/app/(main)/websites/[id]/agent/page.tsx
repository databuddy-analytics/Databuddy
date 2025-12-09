import { generateId } from "ai";
import { redirect } from "next/navigation";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function AgentIndexPage(props: Props) {
	const { id } = await props.params;
	const newChatId = generateId();
	redirect(`/websites/${id}/agent/${newChatId}`);
}
