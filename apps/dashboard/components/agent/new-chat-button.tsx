"use client";

import { generateId } from "ai";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PlusIcon } from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

interface NewChatButtonProps {
	className?: string;
	onNewChat?: (chatId: string) => void;
	websiteId?: string | null;
}

export function NewChatButton({
	className,
	onNewChat,
	websiteId,
}: NewChatButtonProps) {
	const router = useRouter();
	const { id } = useParams();
	const resolvedWebsiteId = websiteId ?? (typeof id === "string" ? id : null);

	if (!resolvedWebsiteId) {
		return null;
	}

	const handleNewChat = () => {
		const newChatId = generateId();
		if (onNewChat) {
			onNewChat(newChatId);
			return;
		}
		router.push(`/websites/${resolvedWebsiteId}/agent/${newChatId}`);
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
