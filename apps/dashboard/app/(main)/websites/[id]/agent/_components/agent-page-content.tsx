"use client";

import {
	ArrowRightIcon,
	BrainIcon,
	ChartBarIcon,
	LightningIcon,
	TableIcon,
} from "@phosphor-icons/react";
import { useSetAtom } from "jotai";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useChat } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import { agentInputAtom } from "./agent-atoms";
import { AgentChatProvider } from "./agent-chat-context";
import { AgentInput } from "./agent-input";
import { AgentMessages } from "./agent-messages";
import { NewChatButton } from "./new-chat-button";

interface AgentPageContentProps {
	chatId: string;
	websiteId: string;
}

const SUGGESTED_PROMPTS = [
	{
		text: "Analyze my traffic trends and find anomalies",
		icon: ChartBarIcon,
		category: "Analysis",
	},
	{
		text: "What's causing my bounce rate to increase?",
		icon: BrainIcon,
		category: "Insights",
	},
	{
		text: "Generate a weekly performance report",
		icon: TableIcon,
		category: "Reports",
	},
	{
		text: "Find my best converting traffic sources",
		icon: LightningIcon,
		category: "Discovery",
	},
];

export function AgentPageContent({ chatId, websiteId }: AgentPageContentProps) {
	return (
		<AgentChatProvider chatId={chatId}>
			<AgentPageContentInner websiteId={websiteId} />
		</AgentChatProvider>
	);
}

function AgentPageContentInner({
	websiteId: _websiteId,
}: {
	websiteId: string;
}) {
	const setInputValue = useSetAtom(agentInputAtom);
	const { messages } = useChat();

	const hasMessages = messages.length > 0;

	return (
		<div className="relative flex flex-1 overflow-hidden">
			<div
				className={cn(
					"flex flex-1 flex-col overflow-hidden",
					"transition-all duration-300 ease-in-out"
				)}
			>
				<div className="relative z-10 bg-sidebar-accent">
					<div className="flex h-12 items-center gap-3 border-b px-3 sm:h-12 sm:px-3">
						<div className="rounded-lg bg-sidebar/80 p-1.5 shadow-sm ring-1 ring-sidebar-border/50">
							<Avatar className="size-8">
								<AvatarImage alt="Databunny avatar" src="/databunny.webp" />
								<AvatarFallback className="bg-primary/10 font-semibold text-primary">
									DB
								</AvatarFallback>
							</Avatar>
						</div>
						<div className="min-w-0 flex-1 space-y-0.5">
							<div className="flex items-center gap-2">
								<h1 className="truncate font-semibold text-sidebar-accent-foreground text-sm">
									Databunny
								</h1>
								<span className="rounded border border-border/50 bg-accent px-1.5 py-0.5 text-[10px] text-foreground/60 uppercase">
									Alpha
								</span>
							</div>
							<p className="truncate text-sidebar-accent-foreground/70 text-xs">
								Analytics co-pilot with instant answers and guided insights.
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							<NewChatButton />
						</div>
					</div>
				</div>

				<Conversation className="flex-1">
					<ConversationContent className="mx-auto w-full max-w-4xl">
						{hasMessages ? (
							<AgentMessages />
						) : (
							<ConversationEmptyState>
								<WelcomeState onPromptSelect={setInputValue} />
							</ConversationEmptyState>
						)}
					</ConversationContent>
					<ConversationScrollButton />
				</Conversation>

				<AgentInput />
			</div>
		</div>
	);
}

function WelcomeState({
	onPromptSelect,
}: {
	onPromptSelect: (text: string) => void;
}) {
	return (
		<div className="min-h-[400px] space-y-6 py-8">
			<div className="flex flex-col items-center justify-center">
				<Avatar className="size-10">
					<AvatarImage alt="Databunny avatar" src="/databunny.webp" />
					<AvatarFallback className="bg-primary/10 font-semibold text-primary">
						DB
					</AvatarFallback>
				</Avatar>

				<div className="max-w-md space-y-2 text-center">
					<h3 className="font-semibold text-xl">Meet Databunny</h3>
					<p className="text-balance text-foreground/60 text-sm leading-relaxed">
						Databunny explores your analytics, uncovers patterns, and surfaces
						actionable insights without you babysitting every step.
					</p>
				</div>
			</div>

			<div className="flex flex-wrap justify-center gap-2">
				{[
					"Deep Analysis",
					"Pattern Detection",
					"Anomaly Alerts",
					"Auto Reports",
				].map((capability) => (
					<span
						className="rounded border border-border/50 bg-accent px-3 py-1 text-foreground/70 text-xs"
						key={capability}
					>
						{capability}
					</span>
				))}
			</div>

			<div className="grid max-w-4xl gap-2 sm:grid-cols-2">
				{SUGGESTED_PROMPTS.map((prompt) => (
					<button
						className={cn(
							"group flex items-start gap-3 rounded border border-dashed p-3 text-left",
							"transition-all hover:border-solid hover:bg-accent/30",
							"disabled:cursor-not-allowed disabled:opacity-50"
						)}
						key={prompt.text}
						onClick={() => onPromptSelect(prompt.text)}
						type="button"
					>
						<div className="flex size-8 shrink-0 items-center justify-center rounded bg-accent/50">
							<prompt.icon
								className="size-4 text-foreground/60"
								weight="duotone"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-sm">{prompt.text}</p>
							<p className="text-foreground/50 text-xs">{prompt.category}</p>
						</div>
						<ArrowRightIcon className="size-4 shrink-0 text-transparent transition-all group-hover:text-foreground/50" />
					</button>
				))}
			</div>
		</div>
	);
}
