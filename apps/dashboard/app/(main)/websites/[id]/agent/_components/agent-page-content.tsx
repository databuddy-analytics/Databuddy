"use client";

import {
	ArrowRightIcon,
	BrainIcon,
	ChartBarIcon,
	ClockIcon,
	LightningIcon,
	RobotIcon,
	TableIcon,
} from "@phosphor-icons/react";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { agentInputAtom } from "./agent-atoms";
import { AgentChatProvider } from "./agent-chat-context";
import { AgentInput } from "./agent-input";
import { AgentMessages } from "./agent-messages";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "./conversation";
import { useAgentChat } from "./hooks";
import { NewChatButton } from "./new-chat-button";

type AgentPageContentProps = {
	chatId: string;
	websiteId: string;
};

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

export function AgentPageContent({
	chatId,
	websiteId: _websiteId,
}: AgentPageContentProps) {
	return (
		<AgentChatProvider chatId={chatId}>
			<AgentPageContentInner websiteId={_websiteId} />
		</AgentChatProvider>
	);
}

function AgentPageContentInner({
	websiteId: _websiteId,
}: {
	websiteId: string;
}) {
	const setInputValue = useSetAtom(agentInputAtom);
	const [showSidebar] = useState(false);
	const { messages, isLoading, hasError } = useAgentChat();

	const hasMessages = messages.length > 0;

	return (
		<div className="relative flex flex-1 overflow-hidden">
			<div
				className={cn(
					"flex flex-1 flex-col",
					"transition-all duration-300 ease-in-out",
					false
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
								<span className="rounded border border-border/50 bg-accent px-1.5 py-0.5 text-[10px] text-foreground/60 uppercase tracking-wide">
									Alpha
								</span>
							</div>
							<p className="truncate text-sidebar-accent-foreground/70 text-xs">
								Analytics co-pilot with instant answers and guided insights.
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							<Button
								onClick={() => setShowSidebar(!showSidebar)}
								size="icon"
								title="Chat history"
								variant="ghost"
							>
								<ClockIcon className="size-4" weight="duotone" />
							</Button>
							<NewChatButton />
						</div>
					</div>
				</div>

				<Conversation className="flex-1">
					<ConversationContent className="pb-[150px]">
						<div className="mx-auto w-full max-w-2xl">
							{hasMessages ? (
								<AgentMessages
									hasError={hasError}
									isStreaming={isLoading}
									messages={messages}
								/>
							) : (
								<WelcomeState onPromptSelect={setInputValue} />
							)}
						</div>
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
		<div className="flex min-h-[400px] flex-col items-center justify-center py-8">
			<div className="mb-6 flex size-20 items-center justify-center rounded-full border bg-linear-to-br from-primary/10 to-accent/10">
				<RobotIcon className="size-10 text-primary" weight="duotone" />
			</div>

			<div className="mb-8 max-w-md text-center">
				<h3 className="mb-2 font-semibold text-xl">Meet Databunny</h3>
				<p className="text-balance text-foreground/60 text-sm leading-relaxed">
					Databunny explores your analytics, uncovers patterns, and surfaces
					actionable insights without you babysitting every step.
				</p>
			</div>

			<div className="mb-8 flex flex-wrap justify-center gap-2">
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

			<div className="w-full max-w-lg space-y-3">
				<div className="flex items-center gap-2 text-foreground/50 text-sm">
					<LightningIcon className="size-4" weight="duotone" />
					<span>Try asking:</span>
				</div>
				<div className="grid gap-2 sm:grid-cols-2">
					{SUGGESTED_PROMPTS.map((prompt) => (
						<button
							className={cn(
								"group flex items-start gap-3 rounded border border-dashed p-3 text-left",
								"transition-all hover:border-solid hover:bg-accent/30",
								"disabled:cursor-not-allowed disabled:opacity-50"
							)}
							disabled
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
								<p className="truncate text-sm">{prompt.text}</p>
								<p className="text-foreground/50 text-xs">{prompt.category}</p>
							</div>
							<ArrowRightIcon className="size-4 shrink-0 text-transparent transition-all group-hover:text-foreground/50" />
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
