"use client";

import {
	BrainIcon,
	ClockCountdownIcon,
	PaperPlaneRightIcon,
	StopIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useAtom } from "jotai";
import {
	UnicodeSpinner,
	useRandomThinkingVariant,
} from "@/components/ai-elements/unicode-spinner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChat, usePendingQueue } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import {
	AGENT_THINKING_LEVELS,
	type AgentThinking,
	agentInputAtom,
	agentThinkingAtom,
} from "./agent-atoms";
import { useEnterSubmit } from "./hooks/use-enter-submit";

export function AgentInput() {
	const { sendMessage, stop, status } = useChat();
	const { messages: pendingMessages, removeAction } = usePendingQueue();
	const isLoading = status === "streaming" || status === "submitted";
	const [input, setInput] = useAtom(agentInputAtom);
	const { formRef, onKeyDown } = useEnterSubmit();

	const handleSubmit = (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!input.trim()) {
			return;
		}
		sendMessage({ text: input.trim() });
		setInput("");
	};

	return (
		<form
			className="sticky z-10 mt-auto"
			onSubmit={handleSubmit}
			ref={formRef}
			style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
		>
			{pendingMessages.length > 0 ? (
				<PendingPill
					messages={pendingMessages}
					onClear={stop}
					onRemove={removeAction}
				/>
			) : null}

			<div
				className={cn(
					"rounded border border-border bg-background shadow-xs transition-colors",
					"focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
				)}
			>
				<Textarea
					className={cn(
						"min-h-0 resize-none border-0 bg-transparent px-3 pt-3 pb-2 text-sm shadow-none",
						"focus-visible:border-0 focus-visible:bg-transparent focus-visible:shadow-none focus-visible:ring-0"
					)}
					maxRows={8}
					minRows={1}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder="Ask Databunny anything about your analytics…"
					showFocusIndicator={false}
					value={input}
				/>

				<div className="flex items-center justify-between gap-3 rounded-b border-border/60 border-t bg-muted/30 px-3 py-1.5">
					<KeyboardHints isLoading={isLoading} />

					<div className="flex shrink-0 items-center gap-1">
						<ThinkingControl />
						{isLoading ? (
							<Button
								aria-label="Stop generation"
								className="size-7"
								onClick={stop}
								size="icon"
								type="button"
								variant="default"
							>
								<StopIcon className="size-3.5" weight="fill" />
							</Button>
						) : (
							<Button
								aria-label="Send message"
								className="size-7"
								disabled={!input.trim()}
								size="icon"
								type="submit"
							>
								<PaperPlaneRightIcon
									className="size-3.5"
									weight={input.trim() ? "fill" : "duotone"}
								/>
							</Button>
						)}
					</div>
				</div>
			</div>
		</form>
	);
}

const THINKING_LABELS: Record<AgentThinking, string> = {
	off: "Off",
	low: "Low",
	medium: "Medium",
	high: "High",
};

const THINKING_DESCRIPTIONS: Record<AgentThinking, string> = {
	off: "Fastest, cheapest",
	low: "Brief reasoning",
	medium: "Deeper analysis",
	high: "Extended reasoning",
};

function ThinkingControl() {
	const [thinking, setThinking] = useAtom(agentThinkingAtom);
	const isOn = thinking !== "off";

	const cycleThinking = () => {
		const currentIndex = AGENT_THINKING_LEVELS.indexOf(thinking);
		const nextIndex = (currentIndex + 1) % AGENT_THINKING_LEVELS.length;
		const next = AGENT_THINKING_LEVELS[nextIndex];
		if (next) {
			setThinking(next);
		}
	};

	return (
		<TooltipProvider delayDuration={250}>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						aria-label={`Thinking effort: ${THINKING_LABELS[thinking]}. Click to cycle.`}
						className={cn(
							"flex h-7 items-center gap-1 rounded border px-2 text-xs transition-colors",
							isOn
								? "border-border bg-accent text-foreground"
								: "border-transparent text-muted-foreground hover:border-border/60 hover:bg-accent/40 hover:text-foreground"
						)}
						onClick={cycleThinking}
						type="button"
					>
						<BrainIcon
							className="size-3.5"
							weight={isOn ? "fill" : "duotone"}
						/>
						<span className="font-medium">{THINKING_LABELS[thinking]}</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={8}>
					<div className="flex flex-col gap-0.5">
						<span className="font-medium">
							Thinking · {THINKING_LABELS[thinking]}
						</span>
						<span className="text-muted-foreground">
							{THINKING_DESCRIPTIONS[thinking]}
						</span>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="rounded border border-border bg-background px-1 font-mono text-[10px] text-muted-foreground">
			{children}
		</kbd>
	);
}

function GeneratingHint() {
	const variant = useRandomThinkingVariant();
	return (
		<div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
			<UnicodeSpinner label="Generating" variant={variant} />
			<span>Generating…</span>
		</div>
	);
}

function KeyboardHints({ isLoading }: { isLoading: boolean }) {
	// Keep this slot mounted in both states so the footer layout doesn't
	// shift when a message is sent. Streaming state shows a subtle status
	// line in the same height instead of the keyboard shortcuts.
	if (isLoading) {
		return <GeneratingHint />;
	}
	return (
		<div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
			<Kbd>Enter</Kbd>
			<span>send</span>
			<span className="hidden text-border sm:inline">·</span>
			<Kbd>⇧Enter</Kbd>
			<span className="hidden sm:inline">newline</span>
		</div>
	);
}

function PendingPill({
	messages,
	onRemove,
	onClear,
}: {
	messages: string[];
	onRemove: (index: number) => void;
	onClear: () => void;
}) {
	const count = messages.length;
	const latestIndex = count - 1;
	const latest = messages[latestIndex] ?? "";
	const preview = latest.length > 60 ? `${latest.slice(0, 60)}…` : latest;

	return (
		<div className="mb-2 flex items-center gap-2 rounded border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs">
			<ClockCountdownIcon
				className="size-3.5 shrink-0 text-muted-foreground"
				weight="duotone"
			/>
			<span className="shrink-0 font-medium text-muted-foreground">
				{count === 1 ? "1 queued" : `${count} queued`}
			</span>
			<span className="min-w-0 flex-1 truncate text-foreground/70">
				{preview}
			</span>
			<button
				aria-label="Remove latest queued message"
				className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
				onClick={() => onRemove(latestIndex)}
				type="button"
			>
				<XIcon className="size-3.5" />
			</button>
			{count > 1 ? (
				<button
					className="shrink-0 text-muted-foreground hover:text-foreground"
					onClick={onClear}
					type="button"
				>
					Clear all
				</button>
			) : null}
		</div>
	);
}
