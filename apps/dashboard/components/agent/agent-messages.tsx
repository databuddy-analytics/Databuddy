"use client";

import type { UIMessage } from "ai";
import { motion } from "motion/react";
import { useEffect, useMemo, type ReactNode } from "react";
import { AIComponent } from "@/components/ai-elements/ai-component";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	DotMatrixLoader,
	useRandomDotMatrixLoader,
} from "@/components/ui/dotmatrix";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
	Tool,
	ToolDetail,
	ToolInput,
	ToolOutput,
	type ToolStatus,
} from "@/components/ai-elements/tool";
import { useChat, useChatLoading } from "@/contexts/chat-context";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { parseContentSegments } from "@/lib/ai-components";
import {
	getAIComponentInputFromPart,
	getAIComponentInputFromToolOutput,
} from "@/lib/ai-components/message-parts";
import { isAbortError } from "@/lib/is-abort-error";
import { formatToolLabel } from "@/lib/tool-display";
import { AgentErrorMessage } from "./agent-error-message";
import { ArrowsClockwiseIcon, CheckIcon, CopyIcon } from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

type MessagePart = UIMessage["parts"][number];

type ToolMessagePart = MessagePart & {
	type: string;
	input?: Record<string, unknown>;
	output?: unknown;
	state?: string;
};

const TOOL_PREFIX_REGEX = /^tool-/;

function isToolPart(part: MessagePart): part is ToolMessagePart {
	return part.type.startsWith("tool-");
}

function getToolName(part: ToolMessagePart): string {
	return part.type.replace(TOOL_PREFIX_REGEX, "");
}

function getMessageText(message: UIMessage): string {
	return message.parts
		.flatMap((p) => (p.type === "text" ? [p.text] : []))
		.join("\n\n")
		.trim();
}

function findActiveToolLabel(message: UIMessage | undefined): string | null {
	if (!message || message.role !== "assistant") {
		return null;
	}
	for (let i = message.parts.length - 1; i >= 0; i--) {
		const part = message.parts[i];
		if (!(part && isToolPart(part))) {
			continue;
		}
		if (part.output != null) {
			return "Thinking";
		}
		return formatToolLabel(getToolName(part), part.input ?? {});
	}
	return null;
}

function ReasoningMessage({
	part,
	isStreaming,
}: {
	part: Extract<MessagePart, { type: "reasoning" }>;
	isStreaming: boolean;
}) {
	return (
		<Reasoning defaultOpen={isStreaming} isStreaming={isStreaming}>
			<ReasoningTrigger />
			<ReasoningContent>{part.text}</ReasoningContent>
		</Reasoning>
	);
}

function mergeConsecutiveToolStepsForDisplay(
	tools: ToolMessagePart[]
): Array<{ repeatCount: number; tool: ToolMessagePart }> {
	const merged: Array<{ repeatCount: number; tool: ToolMessagePart }> = [];
	for (const tool of tools) {
		const label = formatToolLabel(getToolName(tool), tool.input ?? {});
		const last = merged.at(-1);
		const lastLabel =
			last && formatToolLabel(getToolName(last.tool), last.tool.input ?? {});
		if (last && lastLabel === label) {
			last.repeatCount += 1;
			last.tool = tool;
		} else {
			merged.push({ repeatCount: 1, tool });
		}
	}
	return merged;
}

function collectToolGroups(parts: MessagePart[]) {
	const result: Array<MessagePart | ToolMessagePart[]> = [];
	let toolBuffer: ToolMessagePart[] = [];

	for (const part of parts) {
		if (isToolPart(part)) {
			toolBuffer.push(part);
			continue;
		}
		if (toolBuffer.length > 0) {
			result.push(toolBuffer);
			toolBuffer = [];
		}
		result.push(part);
	}

	if (toolBuffer.length > 0) {
		result.push(toolBuffer);
	}

	return result;
}

function getToolStatus(tool: ToolMessagePart, isActive: boolean): ToolStatus {
	if (isActive) {
		return "running";
	}
	if (tool.state === "output-error") {
		return "error";
	}
	return "complete";
}

function InspectableToolStep({
	tool,
	label,
	repeatCount,
	status,
}: {
	tool: ToolMessagePart;
	label: string;
	repeatCount: number;
	status: ToolStatus;
}) {
	const displayLabel = repeatCount > 1 ? `${label} · ${repeatCount}×` : label;
	const hasOutput = tool.output != null;
	const isActive = status === "running";

	return (
		<Tool status={status} title={displayLabel}>
			<ToolDetail>
				<ToolInput input={tool.input ?? {}} />
				{hasOutput || !isActive ? (
					<ToolOutput error={status === "error"} output={tool.output} />
				) : null}
			</ToolDetail>
		</Tool>
	);
}

function renderToolGroup(
	tools: ToolMessagePart[],
	key: string,
	isLastGroup: boolean,
	isStreaming: boolean
) {
	const merged = mergeConsecutiveToolStepsForDisplay(tools);

	return (
		<div className="space-y-2 py-1" key={key}>
			{merged.map((entry, idx) => {
				const isLast = idx === merged.length - 1;
				const isActive =
					isLastGroup && isStreaming && isLast && !entry.tool.output;
				const baseLabel = formatToolLabel(
					getToolName(entry.tool),
					entry.tool.input ?? {}
				);
				const componentInput = getAIComponentInputFromToolOutput(entry.tool);
				if (componentInput) {
					return (
						<AIComponent
							input={componentInput}
							key={`${key}-${idx}`}
							streaming={false}
						/>
					);
				}
				return (
					<InspectableToolStep
						key={`${key}-${idx}`}
						label={baseLabel}
						repeatCount={entry.repeatCount}
						status={getToolStatus(entry.tool, isActive)}
						tool={entry.tool}
					/>
				);
			})}
		</div>
	);
}

function TextMessagePart({
	baseKey,
	isCurrentlyStreaming,
	mode,
	text,
}: {
	baseKey: string;
	isCurrentlyStreaming: boolean;
	mode: "static" | "streaming";
	text: string;
}) {
	const segments = useMemo(() => parseContentSegments(text).segments, [text]);

	if (!text.trim() || segments.length === 0) {
		return null;
	}

	return (
		<div className="space-y-4">
			{segments.map((segment, idx) => {
				if (segment.type === "text") {
					return (
						<MessageResponse
							isAnimating={isCurrentlyStreaming}
							key={`${baseKey}-text-${idx}`}
							mode={mode}
						>
							{segment.content}
						</MessageResponse>
					);
				}
				return (
					<AIComponent
						input={segment.content}
						key={`${baseKey}-component-${idx}`}
						streaming={segment.type === "streaming-component"}
					/>
				);
			})}
		</div>
	);
}

function renderMessagePart(
	part: MessagePart | ToolMessagePart[],
	partIndex: number,
	messageId: string,
	isLastMessage: boolean,
	isStreaming: boolean,
	role: UIMessage["role"]
) {
	const key = `${messageId}-${partIndex}`;
	const isCurrentlyStreaming = isLastMessage && isStreaming;
	const mode =
		role === "user" || !isCurrentlyStreaming ? "static" : "streaming";

	if (Array.isArray(part)) {
		return renderToolGroup(part, key, isLastMessage, isCurrentlyStreaming);
	}

	const componentInput = getAIComponentInputFromPart(part);
	if (componentInput) {
		return (
			<div className="py-1" key={key}>
				<AIComponent input={componentInput} streaming={isCurrentlyStreaming} />
			</div>
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
		return (
			<TextMessagePart
				baseKey={key}
				isCurrentlyStreaming={isCurrentlyStreaming}
				key={key}
				mode={mode}
				text={part.text}
			/>
		);
	}

	if (isToolPart(part)) {
		const isActive = isCurrentlyStreaming && !part.output;
		const baseLabel = formatToolLabel(getToolName(part), part.input ?? {});
		const toolComponentInput = getAIComponentInputFromToolOutput(part);
		if (toolComponentInput) {
			return (
				<div className="py-1" key={key}>
					<AIComponent input={toolComponentInput} streaming={false} />
				</div>
			);
		}
		return (
			<div className="py-1" key={key}>
				<InspectableToolStep
					label={baseLabel}
					repeatCount={1}
					status={getToolStatus(part, isActive)}
					tool={part}
				/>
			</div>
		);
	}

	return null;
}

function AssistantActions({
	message,
	isLast,
	canRegenerate,
	onRegenerate,
}: {
	message: UIMessage;
	isLast: boolean;
	canRegenerate: boolean;
	onRegenerate: () => void;
}) {
	const text = getMessageText(message);
	const { isCopied, copyToClipboard } = useCopyToClipboard();
	const hasText = text.length > 0;
	const showRegenerate = isLast && canRegenerate;

	if (!(hasText || showRegenerate)) {
		return null;
	}

	return (
		<div className="flex w-max items-center gap-0.5 rounded bg-secondary pt-0 opacity-60 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100">
			{hasText ? (
				<Button
					aria-label={isCopied ? "Copied" : "Copy response"}
					className="size-7 text-muted-foreground hover:text-foreground"
					onClick={() => copyToClipboard(text)}
					size="icon"
					type="button"
					variant="ghost"
				>
					{isCopied ? (
						<CheckIcon className="size-3.5" weight="bold" />
					) : (
						<CopyIcon className="size-3.5" weight="duotone" />
					)}
				</Button>
			) : null}
			{showRegenerate ? (
				<Button
					aria-label="Regenerate response"
					className="size-7 text-muted-foreground hover:text-foreground"
					onClick={onRegenerate}
					size="icon"
					type="button"
					variant="ghost"
				>
					<ArrowsClockwiseIcon className="size-3.5" weight="duotone" />
				</Button>
			) : null}
		</div>
	);
}

export function AgentMessages() {
	const { status, messages, error, regenerate, clearError, sendMessage } =
		useChat();
	const { persistedUserMessageIds } = useChatLoading();

	const isExpectedAbort = isAbortError(error);
	const hasError = status === "error" && !isExpectedAbort;
	const isStreaming = status === "streaming" || status === "submitted";
	const lastMessage = messages.at(-1);

	useEffect(() => {
		if (status === "error" && isExpectedAbort) {
			clearError();
		}
	}, [clearError, isExpectedAbort, status]);

	if (messages.length === 0) {
		return null;
	}

	const retry = async () => {
		const last = messages.at(-1);
		if (last?.role === "user") {
			const text = getMessageText(last);
			if (text) {
				await sendMessage({ messageId: last.id, text });
				return;
			}
		}
		await regenerate();
	};

	return (
		<>
			{messages.map((message, index) => {
				const isLastMessage = index === messages.length - 1;
				const isAssistant = message.role === "assistant";
				const showActions = isAssistant && !(isLastMessage && isStreaming);
				const groupedParts = collectToolGroups(message.parts);
				const messageKey = message.id || `msg-${index}`;
				const shouldAnimateUserBubble =
					message.role === "user" && !persistedUserMessageIds.has(messageKey);
				const content = (
					<MessageContent className={isAssistant ? "w-full" : undefined}>
						{groupedParts.map((part, partIndex) =>
							renderMessagePart(
								part,
								partIndex,
								messageKey,
								isLastMessage,
								isStreaming,
								message.role
							)
						)}

						{showActions ? (
							<AssistantActions
								canRegenerate={!hasError}
								isLast={isLastMessage}
								message={message}
								onRegenerate={() => {
									regenerate().catch(() => undefined);
								}}
							/>
						) : null}
					</MessageContent>
				);

				return (
					<Message
						className="group/message"
						from={message.role}
						key={messageKey}
					>
						{message.role === "user" ? (
							<UserMessageBubble animate={shouldAnimateUserBubble}>
								{content}
							</UserMessageBubble>
						) : (
							content
						)}
					</Message>
				);
			})}

			{hasError ? (
				<Message from="assistant">
					<MessageContent className="w-full">
						<AgentErrorMessage
							error={error}
							onDismissAction={clearError}
							onRetryAction={retry}
						/>
					</MessageContent>
				</Message>
			) : null}

			{showTailIndicator(isStreaming, lastMessage) ? (
				<StreamingIndicator label={findActiveToolLabel(lastMessage)} />
			) : null}
		</>
	);
}

function showTailIndicator(
	isStreaming: boolean,
	lastMessage: UIMessage | undefined
): boolean {
	if (!isStreaming) {
		return false;
	}
	if (!lastMessage || lastMessage.role !== "assistant") {
		return true;
	}
	if (lastMessage.parts.length === 0) {
		return true;
	}
	const lastPart = lastMessage.parts.at(-1);
	if (lastPart && isToolPart(lastPart) && lastPart.output != null) {
		return true;
	}
	return false;
}

function StreamingIndicator({ label }: { label: string | null }) {
	const loader = useRandomDotMatrixLoader();
	const text = label ?? "Working";
	return (
		<div
			className="fade-in flex w-full animate-in items-center gap-2 duration-200"
			data-role="assistant"
		>
			<DotMatrixLoader
				className="text-primary"
				dotSize={2}
				label={text}
				loader={loader}
				size={14}
			/>
			<Shimmer as="span" className="text-sm" duration={1} spread={4}>
				{text}
			</Shimmer>
		</div>
	);
}

function AnimatedUserBubble({ children }: { children: ReactNode }) {
	return (
		<motion.div
			animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
			className="origin-bottom-right"
			initial={{ filter: "blur(6px)", opacity: 0, scale: 0.8, y: 5 }}
			transition={{ type: "spring", stiffness: 450, damping: 35 }}
		>
			{children}
		</motion.div>
	);
}

function UserMessageBubble({
	animate,
	children,
}: {
	animate: boolean;
	children: ReactNode;
}) {
	if (animate) {
		return <AnimatedUserBubble>{children}</AnimatedUserBubble>;
	}

	return <div className="origin-bottom-right">{children}</div>;
}
