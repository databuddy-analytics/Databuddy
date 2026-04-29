"use client";

import { useQuery } from "@tanstack/react-query";
import { AgentChatSurface } from "@/components/agent/agent-chat-surface";
import { AgentCreditBalance } from "@/components/agent/agent-credit-balance";
import { ChatHistory } from "@/components/agent/chat-history";
import { NewChatButton } from "@/components/agent/new-chat-button";
import { TopBar } from "@/components/layout/top-bar";
import { orpc } from "@/lib/orpc";
import { Tooltip } from "@databuddy/ui";
import { Avatar } from "@databuddy/ui/client";

interface AgentPageContentProps {
	chatId: string;
	websiteId: string;
}

export function AgentPageContent({ chatId, websiteId }: AgentPageContentProps) {
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
										<span aria-hidden className="mx-1 h-4 w-px bg-border/60" />

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
							<ChatHistory websiteId={websiteId} />
						</div>
					</Tooltip>
					<NewChatButton websiteId={websiteId} />
				</TopBar.Actions>

				<AgentChatSurface
					autoSendPromptFromUrl
					chatId={chatId}
					websiteId={websiteId}
				/>
			</div>
		</div>
	);
}
