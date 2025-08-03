'use client';

import {
	ChatIcon,
	ClockIcon,
	DotsThreeOutlineVerticalIcon,
	DownloadIcon,
	MagnifyingGlassIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { websiteDataAtom, websiteIdAtom } from '@/stores/jotai/assistantAtoms';
import { getChatDB } from '../lib/chat-db';

interface ChatHistoryItem {
	websiteId: string;
	websiteName?: string;
	lastUpdated: number;
	messageCount: number;
	lastMessage?: string;
}

interface ChatHistorySheetProps {
	isOpen: boolean;
	onClose: () => void;
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / (1000 * 60));
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (minutes < 1) {
		return 'Just now';
	}
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	if (hours < 24) {
		return `${hours}h ago`;
	}
	if (days < 7) {
		return `${days}d ago`;
	}
	return new Date(timestamp).toLocaleDateString();
}

export function ChatHistorySheet({ isOpen, onClose }: ChatHistorySheetProps) {
	const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState('');
	const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
	const chatDB = getChatDB();
	const [websiteId] = useAtom(websiteIdAtom);
	const [, setWebsiteId] = useAtom(websiteIdAtom);
	const [, setWebsiteData] = useAtom(websiteDataAtom);

	useEffect(() => {
		const loadChatHistory = async () => {
			try {
				setIsLoading(true);
				const chats = await chatDB.getAllChats();

				const chatsWithPreview = await Promise.all(
					chats.map(async (chat) => {
						try {
							const messages = await chatDB.getMessages(chat.websiteId);
							const lastUserMessage = messages
								.filter((m) => m.type === 'user')
								.pop();

							return {
								...chat,
								lastMessage: lastUserMessage?.content || 'No messages yet',
							};
						} catch (error) {
							console.error(
								`Failed to load messages for ${chat.websiteId}:`,
								error
							);
							return {
								...chat,
								lastMessage: 'Error loading messages',
							};
						}
					})
				);

				setChatHistory(chatsWithPreview);
			} catch (error) {
				console.error('Failed to load chat history:', error);
			} finally {
				setIsLoading(false);
			}
		};

		if (isOpen) {
			loadChatHistory();
		}
	}, [isOpen, chatDB]);

	const handleDeleteChat = async (websiteId: string) => {
		try {
			await chatDB.deleteChat(websiteId);
			setChatHistory((prev) =>
				prev.filter((chat) => chat.websiteId !== websiteId)
			);
			setDeleteConfirm(null);
		} catch (error) {
			console.error('Failed to delete chat:', error);
		}
	};

	const handleExportChat = async (websiteId: string, websiteName?: string) => {
		try {
			const exportData = await chatDB.exportChat(websiteId);
			const blob = new Blob([JSON.stringify(exportData, null, 2)], {
				type: 'application/json',
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `chat-${websiteName || websiteId}-${new Date().toISOString().split('T')[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Failed to export chat:', error);
		}
	};

	const handleSelectChat = (websiteId: string, websiteName?: string) => {
		setWebsiteId(websiteId);
		setWebsiteData((prev: any) =>
			prev ? { ...prev, name: websiteName } : prev
		);
		onClose();
	};

	const filteredChats = chatHistory.filter(
		(chat: ChatHistoryItem) =>
			chat.websiteName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			chat.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			chat.websiteId.toLowerCase().includes(searchQuery.toLowerCase())
	);

	return (
		<>
			<Sheet onOpenChange={onClose} open={isOpen}>
				<SheetContent
					className="w-[90vw] overflow-y-auto sm:w-[80vw] md:w-[60vw] lg:w-[40vw] xl:w-[500px]"
					side="right"
					style={{ width: '90vw', padding: '1rem', maxWidth: '600px' }}
				>
					<SheetHeader className="space-y-3 border-border/50 border-b pb-6">
						<div className="flex items-center gap-3">
							<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
								<ChatIcon className="h-6 w-6 text-primary" />
							</div>
							<div>
								<SheetTitle className="font-semibold text-foreground text-xl">
									Chat History
								</SheetTitle>
								<SheetDescription className="mt-1 text-muted-foreground">
									{chatHistory.length}{' '}
									{chatHistory.length === 1 ? 'chat' : 'chats'}
								</SheetDescription>
							</div>
						</div>
					</SheetHeader>

					<div className="space-y-6 pt-6">
						<div className="space-y-2">
							<div className="relative">
								<MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-muted-foreground" />
								<Input
									className="rounded border-border/50 pl-9 focus:border-primary/50 focus:ring-primary/20"
									onChange={(e) => setSearchQuery(e.target.value)}
									placeholder="Search chats..."
									value={searchQuery}
								/>
							</div>
						</div>

						<div className="space-y-2">
							{isLoading ? (
								<div className="space-y-3">
									{Array.from({ length: 5 }).map((_, i) => (
										<div
											className="rounded border p-3"
											key={`skeleton-${i + 1}`}
										>
											<div className="flex items-start gap-3">
												<Skeleton className="h-8 w-8 rounded" />
												<div className="flex-1 space-y-2">
													<Skeleton className="h-4 w-24" />
													<Skeleton className="h-3 w-full" />
													<Skeleton className="h-3 w-16" />
												</div>
											</div>
										</div>
									))}
								</div>
							) : filteredChats.length === 0 ? (
								<div className="py-8 text-center">
									<ChatIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
									<p className="text-muted-foreground text-sm">
										{searchQuery
											? 'No chats match your search'
											: 'No chat history yet'}
									</p>
								</div>
							) : (
								<div className="space-y-4">
									{filteredChats.map((chat) => (
										<button
											className={cn(
												'group w-full text-left transition-all duration-200',
												'flex items-start gap-4 rounded-xl border border-border/50 bg-background p-4 shadow-sm',
												'hover:border-primary/30 hover:bg-primary/5',
												chat.websiteId === websiteId &&
													'border-primary/40 bg-primary/10'
											)}
											key={chat.websiteId}
											onClick={(e: React.MouseEvent) => {
												e.preventDefault();
												e.stopPropagation();
												handleSelectChat(chat.websiteId, chat.websiteName);
											}}
											onKeyDown={(e: React.KeyboardEvent) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													e.stopPropagation();
													handleSelectChat(chat.websiteId, chat.websiteName);
												}
											}}
											type="button"
										>
											<div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
												<ChatIcon className="h-5 w-5 text-primary" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="mb-1 flex items-center justify-between">
													<h3 className="truncate font-semibold text-base text-foreground">
														{chat.websiteName ||
															`Website ${chat.websiteId.slice(0, 8)}`}
													</h3>
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																className="h-7 w-7 opacity-0 group-hover:opacity-100"
																onClick={(e: React.MouseEvent) =>
																	e.stopPropagation()
																}
																size="icon"
																variant="ghost"
															>
																<DotsThreeOutlineVerticalIcon className="h-4 w-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem
																onClick={(e: React.MouseEvent) => {
																	e.stopPropagation();
																	handleExportChat(
																		chat.websiteId,
																		chat.websiteName
																	);
																}}
															>
																<DownloadIcon className="mr-2 h-4 w-4" />
																Export Chat
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																className="text-destructive focus:bg-destructive/10 focus:text-destructive"
																onClick={(e: React.MouseEvent) => {
																	e.stopPropagation();
																	setDeleteConfirm(chat.websiteId);
																}}
															>
																<TrashIcon className="mr-2 h-4 w-4" />
																Delete
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</div>
												<p className="mb-1 truncate text-muted-foreground text-sm">
													{chat.lastMessage}
												</p>
												<div className="mt-1 flex items-center gap-3 text-muted-foreground/80 text-xs">
													<ClockIcon className="h-3 w-3" />
													<span>{formatRelativeTime(chat.lastUpdated)}</span>
													<Badge className="px-1.5 py-0" variant="outline">
														{chat.messageCount} msg
													</Badge>
												</div>
											</div>
										</button>
									))}
								</div>
							)}
						</div>
					</div>
				</SheetContent>
			</Sheet>
			<AlertDialog
				onOpenChange={() => setDeleteConfirm(null)}
				open={!!deleteConfirm}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete this chat history. This action cannot
							be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => deleteConfirm && handleDeleteChat(deleteConfirm)}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
