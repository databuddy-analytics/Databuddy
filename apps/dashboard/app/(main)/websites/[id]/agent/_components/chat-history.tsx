"use client";

import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleDots";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { useAgentChatId } from "./agent-chat-context";
import { clearLastChatId, useChatList } from "./hooks/use-chat-db";

export function ChatHistory() {
	const [open, setOpen] = useState(false);
	const params = useParams();
	const router = useRouter();
	const websiteId = params.id as string;
	const currentChatId = useAgentChatId();
	const { chats, isLoading, removeChat } = useChatList(websiteId);

	const handleSelectChat = (chatId: string) => {
		setOpen(false);
		router.push(`/websites/${websiteId}/agent/${chatId}`);
	};

	const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
		e.stopPropagation();
		removeChat(chatId);

		if (chatId === currentChatId) {
			const remaining = chats.filter((c) => c.id !== chatId);
			const nextChat = remaining.at(0);
			if (nextChat) {
				router.push(`/websites/${websiteId}/agent/${nextChat.id}`);
			} else {
				clearLastChatId(websiteId);
				router.push(`/websites/${websiteId}/agent`);
			}
		}
	};

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button aria-label="Chat history" size="sm" variant="ghost">
					<ClockCounterClockwiseIcon className="size-4" weight="duotone" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 p-0" sideOffset={8}>
				<div className="border-b px-3 py-2">
					<p className="font-medium text-sm">Chat History</p>
				</div>
				<div className="max-h-64 overflow-y-auto">
					{isLoading ? (
						<div className="p-4 text-center text-muted-foreground text-xs">
							Loading...
						</div>
					) : chats.length === 0 ? (
						<div className="flex flex-col items-center gap-2 p-6">
							<ChatCircleDotsIcon
								className="size-8 text-muted-foreground/40"
								weight="duotone"
							/>
							<p className="text-muted-foreground text-xs">
								No conversations yet
							</p>
						</div>
					) : (
						chats.map((chat) => (
							<button
								className={cn(
									"group flex w-full items-center gap-2 px-3 py-2 text-left",
									"transition-colors hover:bg-accent/50",
									currentChatId === chat.id && "bg-accent"
								)}
								key={chat.id}
								onClick={() => handleSelectChat(chat.id)}
								type="button"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm">{chat.title}</p>
									<p className="text-muted-foreground text-xs tabular-nums">
										{dayjs(chat.updatedAt).fromNow()}
									</p>
								</div>
								<button
									aria-label={`Delete conversation: ${chat.title}`}
									className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
									onClick={(e) => handleDeleteChat(e, chat.id)}
									type="button"
								>
									<TrashIcon className="size-3.5" weight="duotone" />
								</button>
							</button>
						))
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
