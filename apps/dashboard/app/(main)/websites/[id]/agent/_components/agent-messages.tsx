"use client";

import {
	ArrowsClockwiseIcon,
	CaretRightIcon,
	CheckCircleIcon,
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
	UnicodeSpinner,
	useRandomThinkingVariant,
} from "@/components/ai-elements/unicode-spinner";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
const PREVIEW_ROW_LIMIT = 5;
const PREVIEW_VALUE_MAX_LEN = 120;

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

/**
 * Find the most recent tool part that has been started but not yet returned
 * an output. Used to label the streaming "Thinking" indicator with the
 * actual tool currently running.
 */
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

/** Merge consecutive identical tool UI labels (same model re-calling the tool). */
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

function truncateValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "—";
	}
	if (typeof value === "string") {
		return value.length > PREVIEW_VALUE_MAX_LEN
			? `${value.slice(0, PREVIEW_VALUE_MAX_LEN)}…`
			: value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	const json = JSON.stringify(value);
	return json.length > PREVIEW_VALUE_MAX_LEN
		? `${json.slice(0, PREVIEW_VALUE_MAX_LEN)}…`
		: json;
}

function ToolInputBlock({ input }: { input: Record<string, unknown> }) {
	const entries = Object.entries(input);
	if (entries.length === 0) {
		return (
			<p className="text-muted-foreground/70 text-xs italic">No parameters</p>
		);
	}
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
			{entries.map(([key, value]) => (
				<div className="contents" key={key}>
					<dt className="font-mono text-muted-foreground">{key}</dt>
					<dd className="break-words font-mono text-foreground/85">
						{truncateValue(value)}
					</dd>
				</div>
			))}
		</dl>
	);
}

function ToolOutputBlock({ output }: { output: unknown }) {
	if (output === null || output === undefined) {
		return <p className="text-muted-foreground/70 text-xs italic">No result</p>;
	}

	if (Array.isArray(output)) {
		if (output.length === 0) {
			return (
				<p className="text-muted-foreground/70 text-xs italic">Empty array</p>
			);
		}
		const preview = output.slice(0, PREVIEW_ROW_LIMIT);
		const isObjectArray = preview.every(
			(row): row is Record<string, unknown> =>
				typeof row === "object" && row !== null && !Array.isArray(row)
		);

		if (isObjectArray) {
			const columns = Array.from(
				new Set(preview.flatMap((row) => Object.keys(row)))
			).slice(0, 5);
			return (
				<div className="space-y-1.5">
					<div className="overflow-x-auto rounded border border-border/60">
						<table className="w-full font-mono text-xs">
							<thead className="bg-muted/50 text-muted-foreground">
								<tr>
									{columns.map((col) => (
										<th className="px-2 py-1 text-left font-medium" key={col}>
											{col}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{preview.map((row, rowIdx) => (
									<tr
										className="border-border/40 border-t"
										key={`row-${rowIdx}`}
									>
										{columns.map((col) => (
											<td
												className="break-words px-2 py-1 text-foreground/80"
												key={col}
											>
												{truncateValue(row[col])}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="text-muted-foreground/70 text-xs">
						{output.length === 1 ? "1 row" : `${output.length} rows`}
						{output.length > PREVIEW_ROW_LIMIT
							? ` · showing first ${PREVIEW_ROW_LIMIT}`
							: ""}
					</p>
				</div>
			);
		}

		return (
			<pre className="overflow-x-auto rounded border border-border/60 bg-muted/30 p-2 font-mono text-foreground/85 text-xs">
				{preview.map((item) => truncateValue(item)).join("\n")}
			</pre>
		);
	}

	if (typeof output === "object") {
		return <ToolInputBlock input={output as Record<string, unknown>} />;
	}

	return (
		<p className="break-words font-mono text-foreground/85 text-xs">
			{truncateValue(output)}
		</p>
	);
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
	status: "active" | "complete";
}) {
	const [open, setOpen] = useState(false);
	const isActive = status === "active";
	const displayLabel = repeatCount > 1 ? `${label} · ${repeatCount}×` : label;
	const hasOutput = tool.output != null;

	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<CollapsibleTrigger
				className={cn(
					"group flex w-full items-center gap-2 py-0.5 text-left text-muted-foreground text-xs transition-colors hover:text-foreground",
					isActive && "text-foreground"
				)}
			>
				{isActive ? (
					<UnicodeSpinner
						className="text-foreground text-xs"
						label="Running tool"
						variant="dots"
					/>
				) : (
					<CheckCircleIcon
						className="size-3 shrink-0 text-muted-foreground/60"
						weight="fill"
					/>
				)}
				<span className="truncate">{displayLabel}</span>
				<CaretRightIcon
					className={cn(
						"size-3 shrink-0 text-muted-foreground/40 transition-transform",
						open && "rotate-90"
					)}
					weight="bold"
				/>
			</CollapsibleTrigger>
			<CollapsibleContent className="data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:animate-in">
				<div className="mt-1 ml-5 space-y-3 rounded border border-border/60 bg-card/40 p-3">
					<section className="space-y-1.5">
						<p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
							Input
						</p>
						<ToolInputBlock input={tool.input ?? {}} />
					</section>
					{hasOutput || !isActive ? (
						<section className="space-y-1.5">
							<p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
								Result
							</p>
							<ToolOutputBlock output={tool.output} />
						</section>
					) : null}
				</div>
			</CollapsibleContent>
		</Collapsible>
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
		<div className="space-y-0 py-1" key={key}>
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
						status={isActive ? "active" : "complete"}
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
					status={isActive ? "active" : "complete"}
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

/**
 * The tail "Thinking" indicator only fills the gap before the assistant
 * has produced ANY part. Once a reasoning, tool, or text part exists,
 * those parts render their own inline progress, so we suppress the tail
 * to avoid duplicate "Thinking" labels stacking on screen.
 */
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
