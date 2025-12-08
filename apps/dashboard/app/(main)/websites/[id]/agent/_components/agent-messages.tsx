"use client";

import { useChat } from "@ai-sdk-tools/store";
import type { UIMessage } from "ai";
import { useEffect, useState } from "react";
import {
	ChainOfThought,
	ChainOfThoughtContent,
	ChainOfThoughtHeader,
	ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useChatStatus } from "./hooks/use-chat-status";

type MessagePart = UIMessage["parts"][number];

function getReasoningText(part: MessagePart): string {
	const reasoning = part as {
		text?: string;
		content?: string;
	};

	return (
		reasoning.text ||
		reasoning.content ||
		JSON.stringify(part, null, 2) ||
		"Thinking through the request."
	);
}

function formatToolOutput(output: unknown) {
	if (output === undefined) {
		return null;
	}

	console.log(output);

	if (typeof output === "object" && "data" in output) {
		return <p>Found {output.data.length} results.</p>;
	}

	if (typeof output === "object" && "pages" in output) {
		return <p>Found {output.pages.length} results.</p>;
	}

	if (typeof output === "object" && "errorText" in output) {
		return <p>Error: {output.errorText}</p>;
	}

	if (typeof output === "string") {
		const obj = JSON.parse(output);

		if ("data" in obj) {
			return <p>Found {obj.data.length} results.</p>;
		}

		if ("pages" in obj) {
			return <p>Found {obj.pages.length} results.</p>;
		}

		if ("errorText" in obj) {
			return <p>Error: {obj.errorText}</p>;
		}

		return <p>Found 0 results.</p>;
	}

	return <p>Found 0 results.</p>;
}

function ReasoningMessage({
	part,
	isStreaming,
}: {
	part: MessagePart;
	isStreaming: boolean;
}) {
	const [hasBeenStreaming, setHasBeenStreaming] = useState(isStreaming);

	useEffect(() => {
		if (isStreaming) {
			setHasBeenStreaming(true);
		}
	}, [isStreaming]);

	return (
		<Reasoning defaultOpen={hasBeenStreaming} isStreaming={isStreaming}>
			<ReasoningTrigger />
			<ReasoningContent>{getReasoningText(part)}</ReasoningContent>
		</Reasoning>
	);
}

function groupConsecutiveToolCalls(parts: MessagePart[]) {
	const grouped: Array<MessagePart | MessagePart[]> = [];
	let currentToolGroup: MessagePart[] = [];

	for (const part of parts) {
		if (part.type?.includes("tool")) {
			currentToolGroup.push(part);
		} else {
			if (currentToolGroup.length > 0) {
				grouped.push(
					currentToolGroup.length === 1 ? currentToolGroup[0] : currentToolGroup
				);
				currentToolGroup = [];
			}
			grouped.push(part);
		}
	}

	// Don't forget the last group
	if (currentToolGroup.length > 0) {
		grouped.push(
			currentToolGroup.length === 1 ? currentToolGroup[0] : currentToolGroup
		);
	}

	return grouped;
}

function renderMessagePart(
	part: MessagePart | MessagePart[],
	partIndex: number,
	messageId: string,
	isLastMessage: boolean,
	isStreaming: boolean
) {
	const key = `${messageId}-${partIndex}`;
	const isCurrentlyStreaming = isLastMessage && isStreaming;

	// Handle grouped tool calls
	if (Array.isArray(part)) {
		return (
			<ChainOfThought className="my-4" defaultOpen key={key}>
				<ChainOfThoughtHeader>Running {part.length} tools</ChainOfThoughtHeader>
				<ChainOfThoughtContent>
					{part.map((toolPart, idx) => (
						<ChainOfThoughtStep
							key={`${key}-tool-${idx}`}
							label={`Running ${toolPart.type}`}
							status="complete"
						>
							{formatToolOutput(toolPart.output)}
						</ChainOfThoughtStep>
					))}
				</ChainOfThoughtContent>
			</ChainOfThought>
		);
	}

	if (part.type === "reasoning") {
		return (
			<ReasoningMessage
				isStreaming={isCurrentlyStreaming}
				key={key}
				part={part}
			/>
		);
	}

	if (part.type === "text") {
		const textPart = part as { text: string };
		if (!textPart.text?.trim()) {
			return null;
		}

		return (
			<MessageResponse isAnimating={isCurrentlyStreaming} key={key}>
				{textPart.text}
			</MessageResponse>
		);
	}

	console.log(part);

	if (part.type?.includes("tool")) {
		return (
			<ChainOfThought defaultOpen key={key}>
				<ChainOfThoughtHeader />
				<ChainOfThoughtContent>
					<ChainOfThoughtStep
						label={`Running ${part.type}`}
						status="complete"
					/>
				</ChainOfThoughtContent>
			</ChainOfThought>
		);
	}

	return null;
}

export function AgentMessages() {
	const { messages, status } = useChat<UIMessage>();
	const chatStatus = useChatStatus();
	const isLoading = status === "streaming" || status === "submitted";
	const hasError = status === "error";
	const isStreaming = isLoading;

	if (messages.length === 0) {
		return null;
	}

	return (
		<>
			{messages.map((message, index) => {
				const isLastMessage = index === messages.length - 1;
				const showError =
					isLastMessage && hasError && message.role === "assistant";

				const groupedParts = message.parts
					? groupConsecutiveToolCalls(message.parts)
					: [];

				return (
					<Message from={message.role} key={message.id}>
						<MessageContent
							className={cn(message.role === "assistant" ? "w-full" : "")}
						>
							{groupedParts.map((part, partIndex) =>
								renderMessagePart(
									part,
									partIndex,
									message.id,
									isLastMessage,
									isStreaming
								)
							)}

							{showError && <ErrorMessage />}
						</MessageContent>
					</Message>
				);
			})}

			{isStreaming && messages.at(-1)?.role !== "assistant" && (
				<StreamingIndicator
					statusText={chatStatus.displayMessage ?? undefined}
				/>
			)}
		</>
	);
}

function ErrorMessage() {
	return (
		<div className="space-y-2">
			<p className="font-medium text-destructive text-sm">
				Failed to generate response
			</p>
			<p className="text-muted-foreground text-xs">
				There was an error processing your request. Please try again.
			</p>
		</div>
	);
}

function StreamingIndicator({ statusText }: { statusText?: string }) {
	return (
		<div
			className="fade-in group w-full animate-in duration-300"
			data-role="assistant"
		>
			<div className="flex w-full items-start justify-start gap-2">
				<Avatar className="size-8 shrink-0 animate-pulse ring-1 ring-border">
					<AvatarImage alt="Databunny" src="/databunny.webp" />
					<AvatarFallback className="bg-primary/10 font-semibold text-primary">
						DB
					</AvatarFallback>
				</Avatar>

				<div className="flex w-full flex-col gap-2">
					<div className="flex items-center gap-1 text-muted-foreground text-sm">
						<span className="animate-pulse">{statusText || "Thinking"}</span>
						<span className="inline-flex">
							<span className="animate-bounce [animation-delay:0ms]">.</span>
							<span className="animate-bounce [animation-delay:150ms]">.</span>
							<span className="animate-bounce [animation-delay:300ms]">.</span>
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
