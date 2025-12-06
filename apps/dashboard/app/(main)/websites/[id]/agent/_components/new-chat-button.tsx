"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { generateId } from "ai";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAgentChat } from "./hooks/use-agent-chat";

export function NewChatButton() {
	const router = useRouter();
	const { id } = useParams();
	const { reset } = useAgentChat();

	const handleNewChat = () => {
		reset();
		const newChatId = generateId();
		router.push(`/websites/${id}/agent/${newChatId}`);
	};

	return (
		<Button
			className="gap-1.5"
			onClick={handleNewChat}
			size="sm"
			variant="outline"
		>
			<PlusIcon className="size-4" />
			<span className="hidden sm:inline">New Chat</span>
		</Button>
	);
}
