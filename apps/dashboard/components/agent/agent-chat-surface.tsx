"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { useChat, useChatLoading } from "@/contexts/chat-context";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	ArrowRightIcon,
	BrainIcon,
	ChartBarIcon,
	LightbulbIcon,
	LightningIcon,
	TableIcon,
} from "@databuddy/ui/icons";
import { AgentInput } from "./agent-input";
import { AgentMessages } from "./agent-messages";
import { setLastChatId } from "./hooks/use-chat-db";
import { Avatar } from "@databuddy/ui/client";
import { Button, Skeleton } from "@databuddy/ui";

interface AgentChatSurfaceProps {
	autoSendPromptFromUrl?: boolean;
	chatId: string;
	className?: string;
	contentClassName?: string;
	websiteId: string;
}

const FALLBACK_ICONS = [
	ChartBarIcon,
	BrainIcon,
	TableIcon,
	LightningIcon,
] as const;

const LOADING_DELAY_MS = 250;

export function AgentChatSurface({
	autoSendPromptFromUrl = false,
	chatId,
	className,
	contentClassName,
	websiteId,
}: AgentChatSurfaceProps) {
	useEffect(() => {
		setLastChatId(websiteId, chatId);
	}, [websiteId, chatId]);

	const { messages, sendMessage } = useChat();
	const { isRestoring, isEmpty } = useChatLoading();
	const { data: website } = useWebsite(websiteId);
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const autoSentRef = useRef(false);

	useEffect(() => {
		if (!(autoSendPromptFromUrl && !autoSentRef.current) || isRestoring) {
			return;
		}
		const prompt = searchParams.get("prompt");
		if (!prompt || messages.length > 0) {
			return;
		}

		autoSentRef.current = true;
		sendMessage({ text: prompt });
		router.replace(pathname);
	}, [
		autoSendPromptFromUrl,
		searchParams,
		messages.length,
		sendMessage,
		router,
		pathname,
		isRestoring,
	]);

	const hasMessages = messages.length > 0;
	const domain = website?.domain ?? null;
	const showWelcome = !hasMessages && (!isRestoring || isEmpty);
	const showLoading = isRestoring && !isEmpty && !hasMessages;

	const launchPrompt = (text: string) => {
		sendMessage({ text });
	};

	return (
		<div
			className={cn(
				"relative flex min-h-0 flex-1 flex-col overflow-hidden",
				className
			)}
		>
			<Conversation className="flex-1 overscroll-none">
				<ConversationContent
					className={cn(
						"mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6",
						showWelcome && "min-h-full",
						contentClassName
					)}
					scrollClassName="overscroll-none"
				>
					{hasMessages ? <AgentMessages /> : null}
					{showLoading ? <DelayedLoading /> : null}
					{showWelcome ? (
						<div className="flex flex-1 items-center justify-center">
							<WelcomeState
								domain={domain}
								onPromptSelect={launchPrompt}
								websiteId={websiteId}
							/>
						</div>
					) : null}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>
			<div className="mx-auto w-full max-w-3xl px-4 pb-4">
				<AgentInput />
			</div>
		</div>
	);
}

function DelayedLoading() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setVisible(true), LOADING_DELAY_MS);
		return () => clearTimeout(timer);
	}, []);

	if (!visible) {
		return null;
	}

	return (
		<div
			aria-hidden
			className="fade-in flex flex-1 animate-in flex-col gap-3 pt-8 duration-150"
		>
			<Skeleton className="ml-auto h-8 w-2/5 rounded" />
			<div className="flex flex-col gap-2">
				<Skeleton className="h-3.5 w-full rounded" />
				<Skeleton className="h-3.5 w-11/12 rounded" />
				<Skeleton className="h-3.5 w-4/5 rounded" />
			</div>
		</div>
	);
}

function WelcomeState({
	onPromptSelect,
	websiteId,
	domain,
}: {
	domain: string | null;
	onPromptSelect: (text: string) => void;
	websiteId: string;
}) {
	const { data: prompts, isLoading } = useQuery({
		...orpc.agentChats.suggestedPrompts.queryOptions({
			input: { websiteId },
		}),
		staleTime: 5 * 60 * 1000,
	});

	return (
		<div className="w-full space-y-6">
			<div className="flex flex-col items-center gap-3">
				<Avatar
					alt="Databunny avatar"
					className="size-10 rounded"
					fallback="DB"
					src="/databunny.webp"
				/>

				<div className="space-y-1 text-center">
					<h3 className="text-balance font-semibold text-lg">Meet Databunny</h3>
					<p className="text-pretty text-muted-foreground text-sm">
						Ask anything about{" "}
						<span className="font-medium text-foreground">
							{domain ?? "your"}
						</span>
						's analytics.
					</p>
				</div>
			</div>

			<div className="grid gap-2 sm:grid-cols-2">
				{isLoading || !prompts
					? SKELETON_WIDTHS.map((widthClass) => (
							<SuggestionSkeleton key={widthClass} widthClass={widthClass} />
						))
					: prompts.map((item, idx) => {
							const Icon =
								item.source === "insight"
									? LightbulbIcon
									: (FALLBACK_ICONS[idx] ?? FALLBACK_ICONS[0]);
							return (
								<Button
									className={cn(
										"group h-auto items-start justify-start gap-3 whitespace-normal rounded-lg border border-border/40 bg-card p-3 text-left",
										"hover:border-border/60 hover:bg-accent/40"
									)}
									key={`${item.source}-${item.label}`}
									onClick={() => onPromptSelect(item.prompt)}
									variant="secondary"
								>
									<span
										className={cn(
											"flex size-7 shrink-0 items-center justify-center rounded",
											item.source === "insight"
												? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
												: "bg-accent/60 text-muted-foreground"
										)}
									>
										<Icon className="size-3.5" weight="duotone" />
									</span>
									<span className="min-w-0 flex-1">
										<span className="line-clamp-2 text-sm leading-tight">
											{item.label}
										</span>
										<span className="mt-0.5 block text-muted-foreground text-xs">
											{item.source === "insight"
												? "From your insights"
												: "Suggested"}
										</span>
									</span>
									<ArrowRightIcon className="mt-0.5 size-3.5 shrink-0 text-transparent transition-colors group-hover:text-muted-foreground" />
								</Button>
							);
						})}
			</div>
		</div>
	);
}

function SuggestionSkeleton({ widthClass }: { widthClass: string }) {
	return (
		<div
			aria-hidden
			className="flex items-start gap-3 rounded-lg border border-border/40 bg-card p-3"
		>
			<Skeleton className="size-7 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-1.5">
				<Skeleton className="h-3.5 w-full rounded" />
				<Skeleton className={cn("h-3.5 rounded", widthClass)} />
				<Skeleton className="mt-1 h-2.5 w-20 rounded" />
			</div>
			<Skeleton className="mt-1 size-3.5 shrink-0 rounded opacity-50" />
		</div>
	);
}

const SKELETON_WIDTHS = ["w-3/5", "w-4/5", "w-2/3", "w-1/2"] as const;
