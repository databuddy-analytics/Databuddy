"use client";

import type { UIMessage } from"ai";
import { useRef } from"react";
import {
	ChainOfThought,
	ChainOfThoughtContent,
	ChainOfThoughtHeader,
	ChainOfThoughtStep,
} from"@/components/ai-elements/chain-of-thought";
import {
	Message,
	MessageContent,
	MessageResponse,
} from"@/components/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from"@/components/ai-elements/reasoning";
import { useChat } from"@/contexts/chat-context";
import { cn } from"@/lib/utils";
import { useChatStatus } from"./hooks/use-chat-status";

type MessagePart = UIMessage["parts"][number];

type ToolMessagePart = MessagePart & {
	output?: unknown;
};

function isToolPart(part: MessagePart): part is ToolMessagePart {
	return part.type?.includes("tool") ?? false;
}

function getToolOutput(part: MessagePart): unknown {
	if (isToolPart(part)) {
		return part.output;
	}
	return undefined;
}

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

function getResultCount(obj: Record<string, unknown>): number | null {
	if ("data" in obj && Array.isArray(obj.data)) {
		return obj.data.length;
	}
	if ("pages" in obj && Array.isArray(obj.pages)) {
		return obj.pages.length;
	}
	return null;
}

function getErrorText(obj: Record<string, unknown>): string | null {
	if ("errorText" in obj && typeof obj.errorText ==="string") {
		return obj.errorText;
	}
	return null;
}

function formatToolOutput(output: unknown) {
	if (output === undefined) {
		return null;
	}

	if (typeof output ==="object" && output !== null) {
		const obj = output as Record<string, unknown>;
		const errorText = getErrorText(obj);
		if (errorText) {
			return <p>Error: {errorText}</p>;
		}
		const count = getResultCount(obj);
		if (count !== null) {
			return <p>Found {count} results.</p>;
		}
	}

	if (typeof output ==="string") {
		try {
			const obj = JSON.parse(output) as Record<string, unknown>;
			const errorText = getErrorText(obj);
			if (errorText) {
				return <p>Error: {errorText}</p>;
			}
			const count = getResultCount(obj);
			if (count !== null) {
				return <p>Found {count} results.</p>;
			}
		} catch {
			return <p>Found 0 results.</p>;
		}
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
	const hasBeenStreamingRef = useRef(isStreaming);
	if (isStreaming) {
		hasBeenStreamingRef.current = true;
	}

	return (
		<Reasoning
			defaultOpen={hasBeenStreamingRef.current}
			isStreaming={isStreaming}
		>
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
	isStreaming: boolean,
	role: UIMessage["role"]
) {
	const key = `${messageId}-${partIndex}`;
	const isCurrentlyStreaming = isLastMessage && isStreaming;
	const mode =
		role ==="user" || !isCurrentlyStreaming ?"static" :"streaming";

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
							{formatToolOutput(getToolOutput(toolPart))}
						</ChainOfThoughtStep>
					))}
				</ChainOfThoughtContent>
			</ChainOfThought>
		);
	}

	if (part.type ==="reasoning") {
		return (
			<ReasoningMessage
				isStreaming={isCurrentlyStreaming}
				key={key}
				part={part}
			/>
		);
	}

	if (part.type ==="text") {
		const textPart = part as { text: string };
		if (!textPart.text?.trim()) {
			return null;
		}

		return (
			<MessageResponse isAnimating={isCurrentlyStreaming} key={key} mode={mode}>
				{textPart.text}
			</MessageResponse>
		);
	}

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
	const { status, messages } = useChat();
	const hasError = status ==="error";
	const chatStatus = useChatStatus(messages, status);
	const isStreaming = status ==="streaming" || status ==="submitted";

	if (messages.length === 0) {
		return null;
	}

	return (
		<>
			{messages.map((message, index) => {
				const isLastMessage = index === messages.length - 1;
				const showError =
					isLastMessage && hasError && message.role ==="assistant";

				const groupedParts = message.parts
					? groupConsecutiveToolCalls(message.parts)
					: [];

				return (
					<Message from={message.role} key={message.id}>
						<MessageContent
							className={cn(message.role ==="assistant" ?"w-full" :"")}
						>
							{groupedParts.map((part, partIndex) =>
								renderMessagePart(
									part,
									partIndex,
									message.id,
									isLastMessage,
									isStreaming,
									message.role
								)
							)}

							{showError ? <ErrorMessage /> : null}
						</MessageContent>
					</Message>
				);
			})}

			{isStreaming ? (
				<StreamingIndicator
					statusText={chatStatus.displayMessage ?? undefined}
				/>
			) : null}
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
			<div className="flex w-full items-center justify-start gap-2">
				<div className="flex w-full flex-col gap-2">
					<div className="flex items-center gap-1 text-muted-foreground text-sm">
						<span className="animate-pulse">{statusText ||"Thinking"}</span>
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
