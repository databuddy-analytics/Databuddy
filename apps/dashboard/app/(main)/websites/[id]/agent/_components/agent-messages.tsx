"use client";

import { authClient } from "@databuddy/auth/client";
import type { UIMessage } from "ai";
import { useEffect, useState } from "react";
import {
	Message,
	MessageAvatar,
	MessageContent,
} from "@/components/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@/components/ai-elements/tool";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AgentMessagesProps = {
	messages: UIMessage[];
	isStreaming?: boolean;
	hasError?: boolean;
	statusText?: string;
};

type MessagePart = UIMessage["parts"][number];

function isReasoningPart(part: MessagePart): boolean {
	return (
		part.type === "reasoning" ||
		part.type === "step-start" ||
		part.type === "data-step-start" ||
		part.type?.includes("reasoning") ||
		part.type?.includes("step")
	);
}

function isTextPart(part: MessagePart): boolean {
	return part.type === "text";
}

function isToolPart(part: MessagePart): boolean {
	return part.type?.startsWith("tool") ?? false;
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

function getToolState(part: MessagePart) {
	const tool = part as { errorText?: string; output?: unknown };
	if (tool.errorText) {
		return "output-error";
	}
	if (tool.output !== undefined) {
		return "output-available";
	}
	return "input-available";
}

function formatToolOutput(output: unknown) {
	if (output === undefined) {
		return null;
	}
	if (typeof output === "string" || typeof output === "object") {
		return output as string | Record<string, unknown>;
	}
	return String(output);
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

function ToolMessage({
	part,
	partIndex,
	isStreaming,
}: {
	part: MessagePart;
	partIndex: number;
	isStreaming: boolean;
}) {
	const toolPart = part as {
		toolCallId?: string;
		toolName?: string;
		input?: unknown;
		output?: unknown;
		errorText?: string;
	};

	const state = getToolState(part);
	const isRunning = state === "input-available";
	const hasCompleted = state === "output-available" || state === "output-error";

	const [hasBeenStreaming, setHasBeenStreaming] = useState(
		isStreaming && isRunning
	);

	useEffect(() => {
		if (isStreaming && isRunning) {
			setHasBeenStreaming(true);
		}
	}, [isStreaming, isRunning]);

	const shouldBeOpen = hasBeenStreaming || hasCompleted;

	const toolKey =
		(toolPart.toolCallId as `tool-${string}`) ?? (`tool-${partIndex}` as const);

	return (
		<Tool defaultOpen={shouldBeOpen} key={toolKey}>
			<ToolHeader
				state={state}
				type={
					(toolPart.toolName as `tool-${string}`) ??
					(`tool-${partIndex}` as const)
				}
			/>
			<ToolContent>
				{toolPart.input !== undefined && <ToolInput input={toolPart.input} />}
				<ToolOutput
					errorText={toolPart.errorText}
					output={formatToolOutput(toolPart.output)}
				/>
			</ToolContent>
		</Tool>
	);
}

function renderMessagePart(
	part: MessagePart,
	partIndex: number,
	messageId: string,
	isLastMessage: boolean,
	isStreaming: boolean
) {
	const key = `${messageId}-${partIndex}`;
	const isCurrentlyStreaming = isLastMessage && isStreaming;

	if (isReasoningPart(part)) {
		return (
			<ReasoningMessage
				isStreaming={isCurrentlyStreaming}
				key={key}
				part={part}
			/>
		);
	}

	if (isTextPart(part)) {
		const textPart = part as { text: string };
		if (!textPart.text?.trim()) {
			return null;
		}

		return (
			<Response isAnimating={isCurrentlyStreaming} key={key}>
				{textPart.text}
			</Response>
		);
	}

	if (isToolPart(part)) {
		return (
			<ToolMessage
				isStreaming={isCurrentlyStreaming}
				key={key}
				part={part}
				partIndex={partIndex}
			/>
		);
	}

	return null;
}

export function AgentMessages({
	messages,
	isStreaming = false,
	hasError = false,
	statusText,
}: AgentMessagesProps) {
	if (messages.length === 0) {
		return null;
	}

	return (
		<>
			{messages.map((message, index) => {
				const isLastMessage = index === messages.length - 1;
				const showError =
					isLastMessage && hasError && message.role === "assistant";

				return (
					<div className="group" key={message.id}>
						<Message from={message.role}>
							<MessageContent className="max-w-[80%]" variant="flat">
								{message.parts?.map((part, partIndex) =>
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

							{message.role === "user" && <UserAvatar />}
							{message.role === "assistant" && (
								<AssistantAvatar hasError={hasError} />
							)}
						</Message>
					</div>
				);
			})}

			{isStreaming && messages.at(-1)?.role !== "assistant" && (
				<StreamingIndicator statusText={statusText} />
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

function UserAvatar() {
	const { data: session, isPending } = authClient.useSession();
	const user = session?.user;

	if (isPending) {
		return <Skeleton className="size-8 shrink-0 rounded-full" />;
	}

	return (
		<MessageAvatar
			name={user?.name || user?.email || "User"}
			src={user?.image || ""}
		/>
	);
}

function AssistantAvatar({ hasError = false }: { hasError?: boolean }) {
	return (
		<Avatar className="size-8 shrink-0 ring-1 ring-border">
			<AvatarImage alt="Databunny" src="/databunny.webp" />
			<AvatarFallback
				className={cn(
					"bg-primary/10 font-semibold text-primary",
					hasError && "bg-destructive/10 text-destructive"
				)}
			>
				DB
			</AvatarFallback>
		</Avatar>
	);
}
