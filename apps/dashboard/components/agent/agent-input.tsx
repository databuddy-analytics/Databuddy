"use client";

import { useAtom, useSetAtom } from "jotai";
import {
	useCallback,
	useEffect,
	memo,
	useMemo,
	useRef,
	useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleNotchIcon } from "@databuddy/ui/icons";
import { useChat, usePendingQueue } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import {
	useBillingContext,
	useUsageFeature,
} from "@/components/providers/billing-provider";
import {
	AGENT_TIERS,
	AGENT_THINKING_LEVELS,
	type AgentTier,
	type AgentThinking,
	agentCreditShakeNonceAtom,
	agentInputAtom,
	agentTierAtom,
	agentThinkingAtom,
} from "./agent-atoms";
import { AgentCommandMenu } from "./agent-command-menu";
import { type AgentCommand, filterCommands } from "./agent-commands";
import {
	AgentTextSwitch,
	AGENT_INPUT_PLACEHOLDER_PHRASES,
} from "./agent-text-switch";
import { useEnterSubmit } from "./hooks/use-enter-submit";
import {
	BrainIcon,
	GaugeIcon,
	LightningIcon,
	PaperPlaneRightIcon,
	PaperclipIcon,
	StopIcon,
	XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { CaretDownIcon, ClockCountdownIcon } from "@databuddy/ui/icons";
import { DropdownMenu } from "@databuddy/ui/client";
import { Button, Skeleton, Textarea, Tooltip } from "@databuddy/ui";

export function AgentInput() {
	const { sendMessage, stop, status } = useChat();
	const { messages: pendingMessages, removeAction } = usePendingQueue();
	const isLoading = status === "streaming" || status === "submitted";
	const [input, setInput] = useAtom(agentInputAtom);
	const bumpCreditShake = useSetAtom(agentCreditShakeNonceAtom);
	const { balance, unlimited } = useUsageFeature("agent_credits");
	const { customer, isLoading: billingLoading } = useBillingContext();
	const agentCreditsRow = customer?.balances?.agent_credits;
	const creditsResolvedForUi = agentCreditsRow != null;

	const { formRef, onKeyDown } = useEnterSubmit();
	const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
	const [commandsDismissed, setCommandsDismissed] = useState(false);
	const [placeholderReplayKey, setPlaceholderReplayKey] = useState(0);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const replayFrameRef = useRef<number | null>(null);
	const inputSyncRef = useRef(input);
	inputSyncRef.current = input;

	const cancelPlaceholderReplay = useCallback(() => {
		if (replayFrameRef.current === null) {
			return;
		}
		cancelAnimationFrame(replayFrameRef.current);
		replayFrameRef.current = null;
	}, []);

	const schedulePlaceholderReplayIfIdle = useCallback(
		(assumeEmptyAfterSend: boolean) => {
			cancelPlaceholderReplay();
			replayFrameRef.current = requestAnimationFrame(() => {
				replayFrameRef.current = null;
				const ta = textareaRef.current;
				if (ta && document.activeElement === ta) {
					return;
				}
				if (isLoading) {
					return;
				}
				if (!assumeEmptyAfterSend && inputSyncRef.current.length > 0) {
					return;
				}
				setPlaceholderReplayKey((k) => k + 1);
			});
		},
		[cancelPlaceholderReplay, isLoading]
	);

	useEffect(() => cancelPlaceholderReplay, [cancelPlaceholderReplay]);

	const filteredCommands = useMemo(() => {
		if (!input.startsWith("/")) {
			return [];
		}
		const query = input.slice(1);
		return filterCommands(query);
	}, [input]);

	const showCommands =
		!(commandsDismissed || isLoading) && filteredCommands.length > 0;
	const safeCommandIndex =
		filteredCommands.length === 0
			? 0
			: Math.min(selectedCommandIndex, filteredCommands.length - 1);

	const handleSubmit = (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!input.trim()) {
			return;
		}
		if (
			!(billingLoading || unlimited) &&
			creditsResolvedForUi &&
			balance <= 0
		) {
			bumpCreditShake((n) => n + 1);
			return;
		}
		sendMessage({ text: input.trim() });
		setInput("");
		setCommandsDismissed(false);
		schedulePlaceholderReplayIfIdle(true);
	};

	const selectCommand = (command: AgentCommand) => {
		setInput(command.prompt);
		setSelectedCommandIndex(0);
		setCommandsDismissed(true);
	};

	const handleMessageKeyDown = (
		event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
	) => {
		if (showCommands) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSelectedCommandIndex((prev) => (prev + 1) % filteredCommands.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setSelectedCommandIndex(
					(prev) =>
						(prev - 1 + filteredCommands.length) % filteredCommands.length
				);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setCommandsDismissed(true);
				return;
			}
			if (
				event.key === "Enter" &&
				!event.shiftKey &&
				!event.nativeEvent.isComposing
			) {
				event.preventDefault();
				const target = filteredCommands[safeCommandIndex];
				if (target) {
					selectCommand(target);
				}
				return;
			}
			if (event.key === "Tab") {
				event.preventDefault();
				const target = filteredCommands[safeCommandIndex];
				if (target) {
					selectCommand(target);
				}
				return;
			}
		}
		onKeyDown(event);
	};

	const handleInputChange = (value: string) => {
		setInput(value);
		if (!value.startsWith("/")) {
			setCommandsDismissed(false);
		}
		setSelectedCommandIndex(0);
	};

	return (
		<form
			className="z-10 mt-auto"
			onSubmit={handleSubmit}
			ref={formRef}
		>
			{pendingMessages.length > 0 ? (
				<PendingPill
					messages={pendingMessages}
					onClear={stop}
					onRemove={removeAction}
				/>
			) : null}

			<AgentCommandMenu
				anchor={
					<div
						className={cn(
							"rounded-lg border border-border/60 bg-muted p-1 shadow-sm transition-colors space-y-1.5",
							"focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
						)}
					>
						<section className="relative">
							<div className="pointer-events-none absolute inset-x-3 top-3 max-w-full">
								<AgentTextSwitch
									active={input.length === 0 && !isLoading}
									className="text-muted-foreground/80 text-sm"
									key={placeholderReplayKey}
									phrases={AGENT_INPUT_PLACEHOLDER_PHRASES}
									nostagger
								/>
							</div>
							<Textarea
								aria-label="Ask Databunny about your analytics, or type slash for commands"
								className={cn(
									"relative min-h-0! resize-none border-0 bg-transparent text-sm shadow-none",
									"focus-visible:border-0 focus-visible:bg-transparent focus-visible:shadow-none focus-visible:ring-0",
									"px-3 pt-3 pb-2"
								)}
								maxRows={8}
								minRows={1}
								rows={1}
								onBlur={() => schedulePlaceholderReplayIfIdle(false)}
								onChange={(e) => handleInputChange(e.target.value)}
								onKeyDown={handleMessageKeyDown}
								ref={textareaRef}
								showFocusIndicator={false}
								value={input}
							/>
						</section>

						<div className="flex items-center justify-between gap-3  border-border/60 bg-background px-1.5 py-1.5 rounded">
							<div className="flex gap-1">
									<Button
										variant="secondary"
										aria-label="Add"
										className="size-7"
										size="icon"
										type="button"
									>
										<PaperclipIcon className="size-3.5" />
									</Button>
									<ThinkingControl />
									<TierControl />
							</div>

							<div className="flex shrink-0 items-center gap-3 ml-auto">
							<KeyboardHints isLoading={isLoading} />
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
				}
				commands={filteredCommands}
				onHover={setSelectedCommandIndex}
				onSelect={selectCommand}
				open={showCommands}
				selectedIndex={safeCommandIndex}
			/>
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

const TIER_LABELS: Record<AgentTier, string> = {
	quick: "Quick",
	balanced: "Balanced",
	deep: "Deep",
};

const TIER_DESCRIPTIONS: Record<AgentTier, string> = {
	quick: "Faster responses",
	balanced: "Best default",
	deep: "Most thorough",
};

function TierIcon({
	tier,
	className,
}: {
	tier: AgentTier;
	className?: string;
}) {
	if (tier === "quick") {
		return <LightningIcon className={className} weight="fill" />;
	}
	if (tier === "deep") {
		return <BrainIcon className={className} weight="duotone" />;
	}
	return <GaugeIcon className={className} weight="duotone" />;
}

const THINKING_LABEL_TRANSITION = {
	duration: 0.15,
	ease: [0.25, 0.46, 0.45, 0.94] as const,
};

const ThinkingControl = memo(function ThinkingControl({
	compact = false,
	iconOnly = false,
}: {
	compact?: boolean;
	iconOnly?: boolean;
}) {
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
		<Tooltip
			content={
				<div className="flex flex-col gap-0.5">
					<span className="font-medium">
						Thinking · {THINKING_LABELS[thinking]}
					</span>
					<span className="text-muted-foreground">
						{THINKING_DESCRIPTIONS[thinking]}
					</span>
				</div>
			}
			delay={250}
			side="top"
		>
			<Button
				aria-label={`Thinking effort: ${THINKING_LABELS[thinking]}. Click to cycle.`}
				className={cn(
					iconOnly ? "border-transparent" : "h-7 gap-1 border px-2 text-xs",
					!iconOnly && compact && "h-7 px-1.5 text-[11px]",
					isOn
						? "border-0"
						: "",
					!(isOn || iconOnly) && "border-transparent hover:border-border/60"
				)}
				onClick={cycleThinking}
				size={iconOnly ? "icon-sm" : "sm"}
				variant="secondary"
			>
				<BrainIcon className="size-3.5" weight={isOn ? "fill" : "duotone"} />
				{iconOnly ? null : (
					<AnimatePresence initial={false} mode="popLayout">
						<motion.span
							key={thinking}
							animate={{ filter: "blur(0px)", opacity: 1 }}
							className="font-medium"
							exit={{ filter: "blur(4px)", opacity: 0 }}
							initial={{ filter: "blur(4px)", opacity: 0 }}
							transition={THINKING_LABEL_TRANSITION}
						>
							{THINKING_LABELS[thinking]}
						</motion.span>
					</AnimatePresence>
				)}
			</Button>
		</Tooltip>
	);
});

const TierControl = memo(function TierControl() {
	const [tier, setTier] = useAtom(agentTierAtom);
	const [isTierHydrated, setIsTierHydrated] = useState(false);
	const [tierMenuOpen, setTierMenuOpen] = useState(false);

	useEffect(() => {
		setIsTierHydrated(true);
	}, []);

	if (!isTierHydrated) {
		return <Skeleton className="h-7 w-24 rounded" />;
	}

	return (
		<DropdownMenu onOpenChange={setTierMenuOpen} open={tierMenuOpen}>
			<Tooltip
				content={
					<div className="flex flex-col gap-0.5">
						<span className="font-medium">
							Model tier · {TIER_LABELS[tier]}
						</span>
						<span className="text-muted-foreground">
							{TIER_DESCRIPTIONS[tier]}
						</span>
					</div>
				}
				delay={250}
				disabled={tierMenuOpen}
				side="top"
			>
				<DropdownMenu.Trigger
					aria-label={`Model tier: ${TIER_LABELS[tier]}`}
					className="inline-flex h-7 items-center gap-1 rounded border border-transparent bg-secondary px-2 font-medium text-xs text-foreground transition-all hover:border-border/60 hover:bg-interactive-hover"
				>
					<TierIcon className="size-3.5" tier={tier} />
					{TIER_LABELS[tier]}
					<CaretDownIcon
						className={cn(
							"size-3 -mt-px transition-transform duration-150 ease-out motion-reduce:transition-none",
							tierMenuOpen && "rotate-180"
						)}
						weight="fill"
					/>
				</DropdownMenu.Trigger>
			</Tooltip>
			<DropdownMenu.Content align="start" className="w-52">
				{AGENT_TIERS.map((optionTier) => (
					<DropdownMenu.Item
						key={optionTier}
						onClick={() => setTier(optionTier)}
						className="h-10"
					>
						<div className="flex min-w-0 items-start  gap-2">
							<TierIcon className="mt-0.5 size-3.5 shrink-0" tier={optionTier} />
							<div className="flex min-w-0 flex-col">
							<span className="font-medium text-xs">
								{TIER_LABELS[optionTier]}
								{tier === optionTier ? " (Current)" : ""}
							</span>
							<span className="text-muted-foreground text-[11px]">
								{TIER_DESCRIPTIONS[optionTier]}
							</span>
							</div>
						</div>
					</DropdownMenu.Item>
				))}
			</DropdownMenu.Content>
		</DropdownMenu>
	);
});

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="rounded border border-border bg-background px-1 py-px font-mono text-[10px] text-muted-foreground">
			{children}
		</kbd>
	);
}

function GeneratingHint() {
	return (
		<div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
			<CircleNotchIcon className="size-3.5 animate-spin text-primary" />
			<span>Generating...</span>
		</div>
	);
}

const KeyboardHints = memo(function KeyboardHints({
	isLoading,
}: {
	isLoading: boolean;
}) {
	if (isLoading) {
		return <GeneratingHint />;
	}
	return (
		<div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs h-full">
			<Kbd>Enter</Kbd>
			<span>send</span>
			<span className="h-4 w-px bg-accent"></span>
			<Kbd>⇧Enter</Kbd>
			<span className="hidden sm:inline">newline</span>
		</div>
	);
});

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
			<Button
				aria-label="Remove latest queued message"
				className="size-6 shrink-0"
				onClick={() => onRemove(latestIndex)}
				size="icon-sm"
				variant="ghost"
			>
				<XIcon className="size-3.5" />
			</Button>
			{count > 1 ? (
				<Button
					className="h-6 shrink-0 px-1.5 text-xs"
					onClick={onClear}
					size="sm"
					variant="ghost"
				>
					Clear all
				</Button>
			) : null}
		</div>
	);
}
