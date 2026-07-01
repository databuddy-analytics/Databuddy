"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { orpc } from "@/lib/orpc";
import { Tooltip } from "@databuddy/ui";
import { Avatar } from "@databuddy/ui/client";
import { AgentChatSurface } from "./agent-chat-surface";
import { AgentCreditBalance } from "./agent-credit-balance";
import { ChatHistory } from "./chat-history";
import { NewChatButton } from "./new-chat-button";

interface AgentWorkspaceProps {
	chatId: string;
	defaultWebsiteId?: string;
	onCurrentChatDeleted: (nextChatId: string | null) => void;
	onNewChat: (chatId: string) => void;
	onSelectChat: (chatId: string) => void;
	organizationId: string | null;
	titleSlot?: ReactNode;
}

export function AgentWorkspace({
	chatId,
	organizationId,
	defaultWebsiteId,
	titleSlot,
	onSelectChat,
	onNewChat,
	onCurrentChatDeleted,
}: AgentWorkspaceProps) {
	const { data: chatMeta, isPending: isChatMetaPending } = useQuery({
		...orpc.agentChats.get.queryOptions({ input: { id: chatId } }),
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const chatTitle = chatMeta?.title?.trim() ?? "";
	const showChatTitle = chatTitle.length > 0;
	const chatTitleDisplayed =
		chatTitle === ""
			? chatTitle
			: `${chatTitle.slice(0, 1).toLocaleUpperCase()}${chatTitle.slice(1)}`;

	return (
		<div className="relative flex h-full flex-col">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<TopBar.Title>
						<div className="flex min-w-0 items-center gap-2.5">
							<Avatar
								alt="Databunny avatar"
								className="size-6 shrink-0 rounded"
								fallback="DB"
								src="/databunny.webp"
							/>
							<div className="flex min-w-0 flex-1 items-center gap-2">
								<h1 className="shrink-0 truncate font-semibold text-foreground text-sm">
									Databunny
								</h1>
								{titleSlot}
								{!showChatTitle && (
									<span className="shrink-0 rounded border border-border/60 px-1.5 py-px font-medium text-[10px] text-muted-foreground uppercase">
										Alpha
									</span>
								)}
								{isChatMetaPending ? (
									<>
										<span aria-hidden className="mx-1 h-4 w-px bg-border/60" />
										<span
											aria-hidden
											className="h-3.5 min-w-[5rem] max-w-[min(40vw,12rem)] animate-pulse rounded bg-muted"
										/>
									</>
								) : (
									showChatTitle && (
										<>
											<span
												aria-hidden
												className="mx-1 h-4 w-px bg-border/60"
											/>
											<p
												className="min-w-0 truncate font-medium text-sm"
												title={chatTitleDisplayed}
											>
												{chatTitleDisplayed}
											</p>
										</>
									)
								)}
							</div>
						</div>
					</TopBar.Title>
					<TopBar.Actions>
						<AgentCreditBalance />
						<span aria-hidden className="mx-1 h-4 w-px bg-border/60" />
						<Tooltip content="Chat History">
							<div className="inline-flex max-w-full">
								<ChatHistory
									onCurrentChatDeleted={onCurrentChatDeleted}
									onSelectChat={onSelectChat}
									organizationId={organizationId}
								/>
							</div>
						</Tooltip>
						<NewChatButton onNewChat={onNewChat} />
					</TopBar.Actions>

					<AgentChatSurface
						autoSendPromptFromUrl
						chatId={chatId}
						defaultWebsiteId={defaultWebsiteId}
						organizationId={organizationId}
					/>
				</div>
			</div>
		</div>
	);
}
