"use client";

import {
	ArrowRightIcon,
	BrainIcon,
	ChartBarIcon,
	LightningIcon,
	SparkleIcon,
	TableIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	useBillingContext,
	useUsageFeature,
} from "@/components/providers/billing-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChat, useChatLoading } from "@/contexts/chat-context";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { AgentInput } from "./agent-input";
import { AgentMessages } from "./agent-messages";
import { ChatHistory } from "./chat-history";
import { setLastChatId } from "./hooks/use-chat-db";
import { NewChatButton } from "./new-chat-button";

interface AgentPageContentProps {
	chatId: string;
	websiteId: string;
}

const FALLBACK_ICONS = [
	ChartBarIcon,
	BrainIcon,
	TableIcon,
	LightningIcon,
] as const;

export function AgentPageContent({ chatId, websiteId }: AgentPageContentProps) {
	useEffect(() => {
		setLastChatId(websiteId, chatId);
	}, [websiteId, chatId]);

	const { messages, sendMessage } = useChat();
	const { isRestoring } = useChatLoading();
	const { data: website } = useWebsite(websiteId);
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const autoSentRef = useRef(false);

	useEffect(() => {
		if (autoSentRef.current || isRestoring) {
			return;
		}
		const prompt = searchParams.get("prompt");
		if (!prompt || messages.length > 0) {
			return;
		}

		autoSentRef.current = true;
		sendMessage({ text: prompt });
		// Strip ?prompt= so reloading or sharing the URL doesn't re-send.
		router.replace(pathname);
	}, [
		searchParams,
		messages.length,
		sendMessage,
		router,
		pathname,
		isRestoring,
	]);

	const hasMessages = messages.length > 0;
	const domain = website?.domain ?? null;

	const launchPrompt = (text: string) => {
		sendMessage({ text });
	};

	return (
		<div className="relative flex flex-1 overflow-hidden">
			<div className="flex flex-1 flex-col overflow-hidden">
				<header className="flex h-12 shrink-0 items-center gap-2.5 border-b bg-background px-4">
					<div className="flex min-w-0 flex-1 items-center gap-2.5">
						<Avatar className="size-6 rounded">
							<AvatarImage alt="Databunny avatar" src="/databunny.webp" />
							<AvatarFallback className="rounded bg-primary/10 font-semibold text-[10px] text-primary">
								DB
							</AvatarFallback>
						</Avatar>
						<h1 className="truncate font-semibold text-foreground text-sm">
							Databunny
						</h1>
						<span className="rounded border border-border/60 px-1.5 py-px font-medium text-[10px] text-muted-foreground uppercase">
							Alpha
						</span>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<AgentCreditBalance />
						<span aria-hidden className="mx-1 h-4 w-px bg-border/60" />
						<ChatHistory />
						<NewChatButton />
					</div>
				</header>

				<Conversation className="flex-1 overscroll-none">
					<ConversationContent
						className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-6"
						scrollClassName="overscroll-none"
					>
						{(() => {
							if (isRestoring) {
								return <ConversationLoadingSkeleton />;
							}
							if (hasMessages) {
								return <AgentMessages />;
							}
							return (
								<div className="flex flex-1 items-center justify-center">
									<WelcomeState
										domain={domain}
										onPromptSelect={launchPrompt}
										websiteId={websiteId}
									/>
								</div>
							);
						})()}
						<AgentInput />
					</ConversationContent>
					<ConversationScrollButton />
				</Conversation>
			</div>
		</div>
	);
}

function WelcomeState({
	onPromptSelect,
	websiteId,
	domain,
}: {
	onPromptSelect: (text: string) => void;
	websiteId: string;
	domain: string | null;
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
				<Avatar className="size-10 rounded">
					<AvatarImage alt="Databunny avatar" src="/databunny.webp" />
					<AvatarFallback className="rounded bg-primary/10 font-semibold text-primary text-xs">
						DB
					</AvatarFallback>
				</Avatar>

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
									? SparkleIcon
									: (FALLBACK_ICONS[idx] ?? FALLBACK_ICONS[0]);
							return (
								<button
									className={cn(
										"group flex items-start gap-3 rounded border border-border/60 bg-card p-3 text-left",
										"transition-colors hover:border-border hover:bg-accent/40"
									)}
									key={`${item.source}-${item.label}`}
									onClick={() => onPromptSelect(item.prompt)}
									type="button"
								>
									<div
										className={cn(
											"flex size-7 shrink-0 items-center justify-center rounded",
											item.source === "insight"
												? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
												: "bg-accent/60 text-muted-foreground"
										)}
									>
										<Icon className="size-3.5" weight="duotone" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="line-clamp-2 text-sm leading-tight">
											{item.label}
										</p>
										<p className="mt-0.5 text-muted-foreground text-xs">
											{item.source === "insight"
												? "From your insights"
												: "Suggested"}
										</p>
									</div>
									<ArrowRightIcon className="mt-0.5 size-3.5 shrink-0 text-transparent transition-colors group-hover:text-muted-foreground" />
								</button>
							);
						})}
			</div>
		</div>
	);
}

function AgentCreditBalance() {
	const { balance, limit, unlimited } = useUsageFeature("agent_credits");
	const { refetch, isLoading } = useBillingContext();
	const { status } = useChat();
	const router = useRouter();
	const prevStatusRef = useRef(status);

	useEffect(() => {
		const prev = prevStatusRef.current;
		prevStatusRef.current = status;
		const justFinished =
			(prev === "streaming" || prev === "submitted") &&
			(status === "ready" || status === "error");
		if (!justFinished) {
			return;
		}
		const timer = setTimeout(() => refetch(), 1500);
		return () => clearTimeout(timer);
	}, [status, refetch]);

	if (isLoading) {
		return <Skeleton className="h-6 w-20 rounded" />;
	}

	if (unlimited) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						className="flex items-center gap-1 rounded border border-border/60 bg-card px-2 py-0.5 text-muted-foreground text-xs transition-colors hover:border-border hover:text-foreground"
						onClick={() => router.push("/billing")}
						type="button"
					>
						<SparkleIcon className="size-3" weight="duotone" />
						<span className="font-medium tabular-nums">∞ credits</span>
					</button>
				</TooltipTrigger>
				<TooltipContent>Unlimited agent credits on your plan</TooltipContent>
			</Tooltip>
		);
	}

	const isEmpty = balance <= 0;
	const isLow = !isEmpty && limit > 0 && balance / limit < 0.2;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					className={cn(
						"flex items-center gap-1 rounded border px-2 py-0.5 text-xs transition-colors",
						isEmpty &&
							"border-destructive/40 bg-destructive/5 text-destructive hover:border-destructive/60",
						isLow &&
							"border-amber-500/40 bg-amber-500/5 text-amber-600 hover:border-amber-500/60 dark:text-amber-400",
						!(isEmpty || isLow) &&
							"border-border/60 bg-card text-muted-foreground hover:border-border hover:text-foreground"
					)}
					onClick={() => router.push("/billing")}
					type="button"
				>
					<SparkleIcon className="size-3" weight="duotone" />
					<span className="font-medium tabular-nums">
						{balance.toLocaleString()} / {limit.toLocaleString()}
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent>
				{isEmpty
					? "Out of agent credits — click to upgrade"
					: `${balance.toLocaleString()} of ${limit.toLocaleString()} agent credits remaining this month`}
			</TooltipContent>
		</Tooltip>
	);
}

function SuggestionSkeleton({ widthClass }: { widthClass: string }) {
	return (
		<div
			aria-hidden
			className="flex items-start gap-3 rounded border border-border/60 bg-card p-3"
		>
			<Skeleton className="size-7 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-1.5">
				<Skeleton className="h-3.5 w-full rounded-sm" />
				<Skeleton className={cn("h-3.5 rounded-sm", widthClass)} />
				<Skeleton className="mt-1 h-2.5 w-20 rounded-sm" />
			</div>
			<Skeleton className="mt-1 size-3.5 shrink-0 rounded-sm opacity-50" />
		</div>
	);
}

// Pre-baked widths so the skeleton doesn't all line up — feels more natural
// while still being layout-stable.
const SKELETON_WIDTHS = ["w-3/5", "w-4/5", "w-2/3", "w-1/2"] as const;

function ConversationLoadingSkeleton() {
	return (
		<div aria-hidden className="flex w-full flex-col gap-6 py-2">
			<MessageSkeleton align="end" widthClass="w-2/5" />
			<MessageSkeleton align="start" lines={3} widthClass="w-11/12" />
			<MessageSkeleton align="end" widthClass="w-1/3" />
			<MessageSkeleton align="start" lines={2} widthClass="w-10/12" />
		</div>
	);
}

const ASSISTANT_LINE_KEYS = ["a", "b", "c", "d"] as const;

function MessageSkeleton({
	align,
	lines = 1,
	widthClass,
}: {
	align: "start" | "end";
	lines?: number;
	widthClass: string;
}) {
	if (align === "end") {
		return (
			<div className="flex justify-end">
				<Skeleton className={cn("h-9 max-w-[60%] rounded", widthClass)} />
			</div>
		);
	}
	const lineKeys = ASSISTANT_LINE_KEYS.slice(0, lines);
	return (
		<div className="flex w-full flex-col gap-2">
			{lineKeys.map((lineKey, idx) => (
				<Skeleton
					className={cn(
						"h-3.5 rounded-sm",
						idx === lineKeys.length - 1 ? widthClass : "w-full"
					)}
					key={lineKey}
				/>
			))}
		</div>
	);
}
