"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { useChat, useChatLoading } from "@/contexts/chat-context";
import { useWebsite } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import {
	ArrowRightIcon,
	BrainIcon,
	ChartBarIcon,
	LightningIcon,
	TableIcon,
} from "@databuddy/ui/icons";
import { useSetAtom } from "jotai";
import { agentMentionsAtom } from "./agent-atoms";
import { AgentInput } from "./agent-input";
import { AgentMessages } from "./agent-messages";
import { AGENT_COMMANDS } from "./agent-commands";
import { setLastChatId } from "./hooks/use-chat-db";
import { Avatar } from "@databuddy/ui/client";
import { Button, Skeleton } from "@databuddy/ui";

interface AgentChatSurfaceProps {
	autoSendPromptFromUrl?: boolean;
	chatId: string;
	className?: string;
	contentClassName?: string;
	defaultWebsiteId?: string;
	organizationId: string | null;
}

const FALLBACK_ICONS = [
	ChartBarIcon,
	BrainIcon,
	TableIcon,
	LightningIcon,
] as const;

const LOADING_DELAY_MS = 250;

const DEFAULT_PROMPTS = AGENT_COMMANDS.filter(
	(command) => command.action !== "clear"
)
	.slice(0, 4)
	.map((command) => ({
		label: command.title,
		prompt: command.prompt,
	}));

export function AgentChatSurface({
	autoSendPromptFromUrl = false,
	chatId,
	className,
	contentClassName,
	defaultWebsiteId,
	organizationId,
}: AgentChatSurfaceProps) {
	const lastChatScope = defaultWebsiteId ?? organizationId;
	const setMentions = useSetAtom(agentMentionsAtom);

	useEffect(() => {
		if (lastChatScope) {
			setLastChatId(lastChatScope, chatId);
		}
	}, [lastChatScope, chatId]);

	useEffect(() => {
		setMentions([]);
	}, [chatId, setMentions]);

	const { messages, sendMessage } = useChat();
	const { isRestoring, isEmpty } = useChatLoading();
	const { data: website } = useWebsite(defaultWebsiteId ?? "");
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
							<WelcomeState domain={domain} onPromptSelect={launchPrompt} />
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
	domain,
}: {
	domain: string | null;
	onPromptSelect: (text: string) => void;
}) {
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
						{domain ? (
							<>
								Ask anything about{" "}
								<span className="font-medium text-foreground">{domain}</span>'s
								analytics.
							</>
						) : (
							"Ask anything about your analytics. Mention a site with @."
						)}
					</p>
				</div>
			</div>

			<div className="grid gap-2 sm:grid-cols-2">
				{DEFAULT_PROMPTS.map((item, idx) => {
					const Icon = FALLBACK_ICONS[idx] ?? FALLBACK_ICONS[0];
					return (
						<Button
							className={cn(
								"group h-auto items-start justify-start gap-3 whitespace-normal rounded-lg border border-border/40 bg-card p-3 text-left",
								"hover:border-border/60 hover:bg-accent/40"
							)}
							key={item.label}
							onClick={() => onPromptSelect(item.prompt)}
							variant="secondary"
						>
							<span className="flex size-7 shrink-0 items-center justify-center rounded bg-accent/60 text-muted-foreground">
								<Icon className="size-3.5" weight="duotone" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="line-clamp-2 text-sm leading-tight">
									{item.label}
								</span>
								<span className="mt-0.5 block text-muted-foreground text-xs">
									Suggested
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
