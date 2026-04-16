"use client";

import {
	ChatCircleDotsIcon,
	CheckIcon,
	ClockCounterClockwiseIcon,
	MagnifyingGlassIcon,
	PencilSimpleIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useChat } from "@/contexts/chat-context";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { clearLastChatId, useChatList } from "./hooks/use-chat-db";

type Chat = ReturnType<typeof useChatList>["chats"][number];

export function ChatHistory() {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<{
		id: string;
		title: string;
	} | null>(null);
	const params = useParams();
	const router = useRouter();
	const websiteId = params.id as string;
	const { id: currentChatId } = useChat();
	const { chats, isLoading, removeChat, renameChat } = useChatList(websiteId);

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
		router.push(`/websites/${websiteId}/agent/${chatId}`);
	};

	const handleConfirmDelete = () => {
		if (!pendingDelete) {
			return;
		}
		const chatId = pendingDelete.id;
		removeChat(chatId);
		setPendingDelete(null);

		if (chatId === currentChatId) {
			const nextChat = chats.find((c) => c.id !== chatId);
			if (nextChat) {
				router.push(`/websites/${websiteId}/agent/${nextChat.id}`);
			} else {
				clearLastChatId(websiteId);
				router.push(`/websites/${websiteId}/agent`);
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
				<PopoverTrigger asChild>
					<Button aria-label="Chat history" size="sm" variant="ghost">
						<ClockCounterClockwiseIcon className="size-4" weight="duotone" />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
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
										<ChatCircleDotsIcon
											className="size-8 text-muted-foreground/40"
											weight="duotone"
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
				</PopoverContent>
			</Popover>

			<AlertDialog
				onOpenChange={(nextOpen) => {
					if (!nextOpen) {
						setPendingDelete(null);
					}
				}}
				open={pendingDelete !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="text-balance">
							Delete this conversation?
						</AlertDialogTitle>
						<AlertDialogDescription className="text-pretty">
							{pendingDelete
								? `"${pendingDelete.title}" will be permanently removed. This can't be undone.`
								: null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel type="button">Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={(e) => {
								e.preventDefault();
								handleConfirmDelete();
							}}
							type="button"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
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
				<button
					aria-label="Save title"
					className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
					onClick={() => onRenameSave(draft)}
					type="button"
				>
					<CheckIcon className="size-3.5" weight="bold" />
				</button>
				<button
					aria-label="Cancel rename"
					className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
					onClick={onRenameCancel}
					type="button"
				>
					<XIcon className="size-3.5" />
				</button>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"group flex w-full items-center gap-1 transition-colors hover:bg-accent/50",
				isActive && "bg-accent"
			)}
		>
			<button
				className="min-w-0 flex-1 px-3 py-2 text-left focus-visible:bg-accent/40 focus-visible:outline-none"
				onClick={onSelect}
				type="button"
			>
				<p className="truncate text-sm">{chat.title}</p>
				<p className="text-muted-foreground text-xs tabular-nums">
					{dayjs(chat.updatedAt).fromNow()}
				</p>
			</button>
			<div className="mr-2 flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
				<button
					aria-label={`Rename conversation: ${chat.title}`}
					className="rounded p-1 hover:bg-accent hover:text-foreground"
					onClick={onRenameStart}
					type="button"
				>
					<PencilSimpleIcon className="size-3.5" weight="duotone" />
				</button>
				<button
					aria-label={`Delete conversation: ${chat.title}`}
					className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"
					onClick={onDelete}
					type="button"
				>
					<TrashIcon className="size-3.5" weight="duotone" />
				</button>
			</div>
		</div>
	);
}
