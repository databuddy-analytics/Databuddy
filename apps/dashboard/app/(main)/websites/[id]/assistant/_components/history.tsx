'use client';

import {
	ClockCounterClockwiseIcon,
	MagnifyingGlassIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useDebounceCallback } from 'usehooks-ts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc';

type Chat = {
	id: string;
	title: string | null;
	createdAt: Date;
	updatedAt: Date;
};

function ChatHistorySkeleton() {
	return (
		<div className="space-y-4">
			{Array.from({ length: 10 }, (_, i) => (
				<div className="flex flex-col gap-1" key={`chat-skeleton-${i + 1}`}>
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-3 w-1/2" />
				</div>
			))}
		</div>
	);
}

export function ChatHistory({ websiteId }: { websiteId: string }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [searchQuery, setSearchQuery] = useState('');
	const [isOpen, setIsOpen] = useState(false);

	// Debounced search to avoid too many API calls
	const debouncedSearch = useDebounceCallback(setSearchQuery, 300);

	const historyKey = [
		'assistant.getHistory',
		{ websiteId, limit: 20, search: searchQuery || undefined },
	] as const as QueryKey;

	// Fetch chats with search functionality
	const { data: chats, isLoading } = trpc.assistant.getHistory.useQuery(
		{
			websiteId,
			limit: 20,
			search: searchQuery || undefined,
		},
		{
			enabled: isOpen,
		}
	);

	// Delete chat mutation with optimistic updates
	const deleteChatMutation = trpc.assistant.deleteChat.useMutation({
		onMutate: async ({ chatId }) => {
			await queryClient.cancelQueries(historyKey);

			const previousChats = queryClient.getQueryData(historyKey);

			// Optimistically update the cache
			queryClient.setQueryData(historyKey, (old: any) => {
				if (!old?.chats) {
					return old;
				}
				return {
					...old,
					chats: old.chats.filter((chat: Chat) => chat.id !== chatId),
				};
			});

			return { previousChats };
		},
		onError: (_, __, context) => {
			// Restore previous data on error
			if (context?.previousChats) {
				queryClient.setQueryData(historyKey, context.previousChats);
			}
		},
		onSettled: () => {
			// Refetch after error or success
			queryClient.invalidateQueries(historyKey);
		},
	});

	const handleChatSelect = (chatId: string) => {
		router.push(`/websites/${websiteId}/assistant/${chatId}`);
		setIsOpen(false);
	};

	const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
		e.stopPropagation();
		deleteChatMutation.mutate({ chatId });
	};

	return (
		<Popover onOpenChange={setIsOpen} open={isOpen}>
			<PopoverTrigger asChild>
				<Button size="icon" variant="outline">
					<ClockCounterClockwiseIcon size={16} />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[380px] p-0">
				<div className="p-4">
					<div className="relative mb-4">
						<MagnifyingGlassIcon
							className="-translate-y-1/2 absolute top-1/2 left-3 transform text-muted-foreground"
							size={14}
						/>
						<Input
							className="pl-9"
							onChange={(e) => debouncedSearch(e.target.value)}
							placeholder="Search history"
						/>
					</div>

					<div className="max-h-80 overflow-y-auto">
						{isLoading ? (
							<ChatHistorySkeleton />
						) : chats?.chats?.length === 0 ? (
							<div className="flex items-center justify-center py-8">
								<div className="text-muted-foreground text-sm">
									{searchQuery ? 'No chats found' : 'No chat history'}
								</div>
							</div>
						) : (
							<div className="space-y-1">
								{chats?.chats?.map((chat: Chat) => (
									<div
										className="group relative flex items-center justify-between rounded-md p-2 hover:bg-muted/50"
										key={chat.id}
									>
										<button
											className="flex-1 text-left"
											onClick={() => handleChatSelect(chat.id)}
											type="button"
										>
											<div className="flex flex-col gap-1">
												<div className="line-clamp-1 font-medium text-sm">
													{chat.title || 'New chat'}
												</div>
												<div className="text-muted-foreground text-xs">
													{formatDistanceToNow(chat.updatedAt, {
														addSuffix: true,
													})}
												</div>
											</div>
										</button>
										<button
											className="rounded-sm p-1 opacity-0 transition-opacity duration-200 hover:bg-destructive/10 group-hover:opacity-100"
											onClick={(e) => handleDeleteChat(e, chat.id)}
											title="Delete chat"
											type="button"
										>
											<TrashIcon
												className="text-muted-foreground hover:text-destructive"
												size={14}
											/>
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
