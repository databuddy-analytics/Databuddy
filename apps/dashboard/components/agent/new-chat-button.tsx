"use client";

import { generateId } from "ai";
import { cn } from "@/lib/utils";
import { PlusIcon } from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

interface NewChatButtonProps {
	className?: string;
	onNewChat: (chatId: string) => void;
}

export function NewChatButton({ className, onNewChat }: NewChatButtonProps) {
	const handleNewChat = () => {
		onNewChat(generateId());
	};

	return (
		<Button
			aria-label="New chat"
			className={cn(className)}
			onClick={handleNewChat}
			size="sm"
		>
			<PlusIcon className="size-4 shrink-0" />
			New chat
		</Button>
	);
}
