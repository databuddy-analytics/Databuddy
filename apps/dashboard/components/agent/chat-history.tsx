"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChatSafe } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import { clearLastChatId, useChatList } from "./hooks/use-chat-db";
import {
	ChatTextIcon,
	CheckIcon,
	ClockCounterClockwiseIcon,
	MagnifyingGlassIcon,
	PencilSimpleIcon,
	TrashIcon,
	XMarkIcon,
} from "@databuddy/ui/icons";
import { DeleteDialog, Popover } from "@databuddy/ui/client";
import { Button, Input, dayjs } from "@databuddy/ui";

type Chat = ReturnType<typeof useChatList>["chats"][number];

interface ChatHistoryProps {
	onCurrentChatDeleted?: (nextChatId: string | null) => void;
	onSelectChat?: (chatId: string) => void;
	websiteId?: string | null;
}

export function ChatHistory({
	onCurrentChatDeleted,
	onSelectChat,
	websiteId,
}: ChatHistoryProps = {}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<{
		id: string;
		title: string;
	} | null>(null);
	const params = useParams();
	const router = useRouter();
	const routeWebsiteId = typeof params.id === "string" ? params.id : null;
	const resolvedWebsiteId = websiteId ?? routeWebsiteId;
	const currentChatId = useChatSafe()?.id ?? null;
	const { chats, isLoading, removeChat, renameChat } =
		useChatList(resolvedWebsiteId);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) {
			return chats;
		}
		return chats.filter((c) => c.title.toLowerCase().includes(q));
	}, [chats, query]);

	useEffect(() => {
		if (!open) {
			setQuery("");
			setEditingId(null);
		}
	}, [open]);

	const handleSelectChat = (chatId: string) => {
		setOpen(false);
		if (onSelectChat) {
			onSelectChat(chatId);
			return;
		}
		if (resolvedWebsiteId) {
			router.push(`/websites/${resolvedWebsiteId}/agent/${chatId}`);
		}
	};

	const handleConfirmDelete = () => {
		if (!pendingDelete) {
			return;
		}
		if (!resolvedWebsiteId) {
			setPendingDelete(null);
			return;
		}
		const chatId = pendingDelete.id;
		removeChat(chatId);
		setPendingDelete(null);

		if (chatId === currentChatId) {
			const nextChat = chats.find((c) => c.id !== chatId);
			const nextChatId = nextChat?.id ?? null;
			if (nextChatId) {
				if (onCurrentChatDeleted) {
					onCurrentChatDeleted(nextChatId);
				} else {
					router.push(`/websites/${resolvedWebsiteId}/agent/${nextChatId}`);
				}
			} else {
				clearLastChatId(resolvedWebsiteId);
				if (onCurrentChatDeleted) {
					onCurrentChatDeleted(null);
				} else {
					router.push(`/websites/${resolvedWebsiteId}/agent`);
				}
			}
		}
	};

	const handleRename = (id: string, title: string) => {
		const trimmed = title.trim();
		if (trimmed && trimmed.length <= 120) {
			renameChat(id, trimmed);
		}
		setEditingId(null);
	};

	return (
		<>
			<Popover onOpenChange={setOpen} open={open}>
				<Popover.Trigger
					render={
						<Button aria-label="Chat history" size="sm" variant="secondary">
							<ClockCounterClockwiseIcon className="size-4 shrink-0" weight="duotone" />
						</Button>
					}
				/>
				<Popover.Content align="end" className="w-80 p-0" sideOffset={8}>
					<div className="border-b p-2">
						<div className="relative">
							<MagnifyingGlassIcon
								className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
								weight="duotone"
							/>
							<Input
								className="h-8 rounded border-border/60 pl-7 text-xs"
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search chats..."
								value={query}
							/>
						</div>
					</div>
					<div className="max-h-72 overflow-y-auto">
						{(() => {
							if (!resolvedWebsiteId) {
								return (
									<div className="p-4 text-center text-muted-foreground text-xs">
										Open a website to view chats
									</div>
								);
							}
							if (isLoading) {
								return (
									<div className="p-4 text-center text-muted-foreground text-xs">
										Loading...
									</div>
								);
							}
							if (chats.length === 0) {
								return (
									<div className="flex flex-col items-center gap-2 p-6">
										<ChatTextIcon
											className="size-8 text-muted-foreground/40"
										/>
										<p className="text-muted-foreground text-xs">
											No conversations yet
										</p>
									</div>
								);
							}
							if (filtered.length === 0) {
								return (
									<div className="p-4 text-center text-muted-foreground text-xs">
										No matches
									</div>
								);
							}
							return filtered.map((chat) => (
								<ChatRow
									chat={chat}
									isActive={currentChatId === chat.id}
									isEditing={editingId === chat.id}
									key={chat.id}
									onDelete={() =>
										setPendingDelete({ id: chat.id, title: chat.title })
									}
									onRenameCancel={() => setEditingId(null)}
									onRenameSave={(title) => handleRename(chat.id, title)}
									onRenameStart={() => setEditingId(chat.id)}
									onSelect={() => handleSelectChat(chat.id)}
								/>
							));
						})()}
					</div>
				</Popover.Content>
			</Popover>

			<DeleteDialog
				description={
					pendingDelete
						? `"${pendingDelete.title}" will be permanently removed. This can't be undone.`
						: undefined
				}
				isOpen={pendingDelete !== null}
				onClose={() => setPendingDelete(null)}
				onConfirm={handleConfirmDelete}
				title="Delete this conversation?"
			/>
		</>
	);
}

function ChatRow({
	chat,
	isActive,
	isEditing,
	onSelect,
	onRenameStart,
	onRenameSave,
	onRenameCancel,
	onDelete,
}: {
	chat: Chat;
	isActive: boolean;
	isEditing: boolean;
	onSelect: () => void;
	onRenameStart: () => void;
	onRenameSave: (title: string) => void;
	onRenameCancel: () => void;
	onDelete: () => void;
}) {
	const [draft, setDraft] = useState(chat.title);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isEditing) {
			setDraft(chat.title);
			requestAnimationFrame(() => {
				inputRef.current?.focus();
				inputRef.current?.select();
			});
		}
	}, [isEditing, chat.title]);

	if (isEditing) {
		return (
			<div className="flex items-center gap-1 px-2 py-1.5">
				<Input
					className="h-7 rounded border-border/60 text-xs"
					maxLength={120}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							onRenameSave(draft);
						}
						if (e.key === "Escape") {
							e.preventDefault();
							onRenameCancel();
						}
					}}
					ref={inputRef}
					value={draft}
				/>
				<Button
					aria-label="Save title"
					className="size-7 shrink-0"
					onClick={() => onRenameSave(draft)}
					size="icon-sm"
					variant="ghost"
				>
					<CheckIcon className="size-3.5" weight="bold" />
				</Button>
				<Button
					aria-label="Cancel rename"
					className="size-7 shrink-0"
					onClick={onRenameCancel}
					size="icon-sm"
					variant="ghost"
				>
					<XMarkIcon className="size-3.5" />
				</Button>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"group relative w-full transition-colors hover:bg-accent/50",
				isActive && "bg-accent"
			)}
		>
			<Button
				className="h-auto w-full min-w-0 justify-start whitespace-normal rounded-none px-3 py-2 text-left focus-visible:bg-accent/40"
				onClick={onSelect}
				variant="ghost"
			>
				<span className="min-w-0">
					<span className="block truncate text-sm">{chat.title}</span>
					<span className="block text-muted-foreground text-xs tabular-nums">
						{dayjs(chat.updatedAt).fromNow()}
					</span>
				</span>
			</Button>
			<div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center rounded bg-popover/90 opacity-0 backdrop-blur-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
				<Button
					aria-label={`Rename conversation: ${chat.title}`}
					className="size-7"
					onClick={onRenameStart}
					size="icon-sm"
					variant="ghost"
				>
					<PencilSimpleIcon className="size-3.5" weight="duotone" />
				</Button>
				<Button
					aria-label={`Delete conversation: ${chat.title}`}
					onClick={onDelete}
					size="icon-sm"
					tone="destructive"
					variant="ghost"
				>
					<TrashIcon className="size-3.5" weight="duotone" />
				</Button>
			</div>
		</div>
	);
}
