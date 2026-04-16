"use client";

import {
	ArrowsClockwiseIcon,
	CheckIcon,
	CopyIcon,
} from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import { useCallback, useState } from "react";
import { AIComponent } from "@/components/ai-elements/ai-component";
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
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useThinkingPhrase } from "@/components/ai-elements/thinking-phrases";
import {
	Tool,
	ToolDetail,
	ToolInput,
	ToolOutput,
	ToolSection,
	type ToolStatus,
} from "@/components/ai-elements/tool";
import {
	UnicodeSpinner,
	useRandomThinkingVariant,
} from "@/components/ai-elements/unicode-spinner";
import { Button } from "@/components/ui/button";
import { useChat } from "@/contexts/chat-context";
import { parseContentSegments } from "@/lib/ai-components";
import { formatToolLabel } from "@/lib/tool-display";
import { cn } from "@/lib/utils";
import { AgentErrorMessage } from "./agent-error-message";

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
			return null;
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
				<ToolSection label="Input">
					<ToolInput input={tool.input ?? {}} />
				</ToolSection>
				{hasOutput || !isActive ? (
					<ToolSection label="Result">
						<ToolOutput error={status === "error"} output={tool.output} />
					</ToolSection>
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
		if (!part.text.trim()) {
			return null;
		}

		const { segments } = parseContentSegments(part.text);
		if (segments.length === 0) {
			return null;
		}

		return (
			<div className="space-y-4" key={key}>
				{segments.map((segment, idx) => {
					if (segment.type === "text") {
						return (
							<MessageResponse
								isAnimating={isCurrentlyStreaming}
								key={`${key}-text-${idx}`}
								mode={mode}
							>
								{segment.content}
							</MessageResponse>
						);
					}
					return (
						<AIComponent
							input={segment.content}
							key={`${key}-component-${idx}`}
							streaming={segment.type === "streaming-component"}
						/>
					);
				})}
			</div>
		);
	}

	if (isToolPart(part)) {
		const isActive = isCurrentlyStreaming && !part.output;
		const baseLabel = formatToolLabel(getToolName(part), part.input ?? {});
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
	const [copied, setCopied] = useState(false);
	const text = getMessageText(message);

	const handleCopy = useCallback(async () => {
		if (!text) {
			return;
		}
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard unavailable — silent failure.
		}
	}, [text]);

	if (!text) {
		return null;
	}

	return (
		<div className="-ml-1.5 flex items-center gap-0.5 pt-1 opacity-60 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100">
			<Button
				aria-label={copied ? "Copied" : "Copy response"}
				className="size-7 text-muted-foreground hover:text-foreground"
				onClick={handleCopy}
				size="icon"
				type="button"
				variant="ghost"
			>
				{copied ? (
					<CheckIcon className="size-3.5" weight="bold" />
				) : (
					<CopyIcon className="size-3.5" weight="duotone" />
				)}
			</Button>
			{isLast && canRegenerate ? (
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
	const hasError = status === "error";
	const isStreaming = status === "streaming" || status === "submitted";
	const lastMessage = messages.at(-1);

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

				return (
					<Message
						className="group/message"
						from={message.role}
						key={messageKey}
					>
						<MessageContent className={cn(isAssistant ? "w-full" : "")}>
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
	return lastMessage.parts.length === 0;
}

function StreamingIndicator({ label }: { label: string | null }) {
	const phrase = useThinkingPhrase();
	const variant = useRandomThinkingVariant();
	return (
		<div
			className="fade-in flex w-full animate-in items-center gap-2 duration-200"
			data-role="assistant"
		>
			<UnicodeSpinner
				className="text-muted-foreground text-sm"
				label="Thinking"
				variant={variant}
			/>
			<Shimmer as="span" className="text-sm" duration={1} spread={4}>
				{label ?? phrase}
			</Shimmer>
		</div>
	);
}
