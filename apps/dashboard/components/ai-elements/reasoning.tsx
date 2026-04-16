"use client";

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useControllableState } from "@radix-ui/react-use-controllable-state";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { Shimmer } from "./shimmer";
import { useThinkingPhrase } from "./thinking-phrases";
import { UnicodeSpinner, useRandomThinkingVariant } from "./unicode-spinner";

interface ReasoningContextValue {
	duration: number | undefined;
	isOpen: boolean;
	isStreaming: boolean;
	setIsOpen: (open: boolean) => void;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
	const context = useContext(ReasoningContext);
	if (!context) {
		throw new Error("Reasoning components must be used within Reasoning");
	}
	return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
	isStreaming?: boolean;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

export const Reasoning = memo(
	({
		className,
		isStreaming = false,
		open,
		defaultOpen = true,
		onOpenChange,
		duration: durationProp,
		children,
		...props
	}: ReasoningProps) => {
		const [isOpen, setIsOpen] = useControllableState({
			prop: open,
			defaultProp: defaultOpen,
			onChange: onOpenChange,
		});
		const [duration, setDuration] = useControllableState({
			prop: durationProp,
			defaultProp: undefined,
		});

		const [hasAutoClosed, setHasAutoClosed] = useState(false);
		const [startTime, setStartTime] = useState<number | null>(null);

		// Track duration when streaming starts and ends
		useEffect(() => {
			if (isStreaming) {
				if (startTime === null) {
					setStartTime(Date.now());
				}
			} else if (startTime !== null) {
				setDuration(Math.ceil((Date.now() - startTime) / MS_IN_S));
				setStartTime(null);
			}
		}, [isStreaming, startTime, setDuration]);

		// Auto-open when streaming starts, auto-close when streaming ends (once only)
		useEffect(() => {
			if (defaultOpen && !isStreaming && isOpen && !hasAutoClosed) {
				// Add a small delay before closing to allow user to see the content
				const timer = setTimeout(() => {
					setIsOpen(false);
					setHasAutoClosed(true);
				}, AUTO_CLOSE_DELAY);

				return () => clearTimeout(timer);
			}
		}, [isStreaming, isOpen, defaultOpen, setIsOpen, hasAutoClosed]);

		const handleOpenChange = (newOpen: boolean) => {
			setIsOpen(newOpen);
		};

		return (
			<ReasoningContext.Provider
				value={{ isStreaming, isOpen, setIsOpen, duration }}
			>
				<Collapsible
					className={cn("not-prose mb-4 space-y-1", className)}
					onOpenChange={handleOpenChange}
					open={isOpen}
					{...props}
				>
					{children}
				</Collapsible>
			</ReasoningContext.Provider>
		);
	}
);

export type ReasoningTriggerProps = ComponentProps<
	typeof CollapsibleTrigger
> & {
	getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

interface ThinkingMessageProps {
	duration?: number;
	isStreaming: boolean;
}

const DefaultThinkingMessage = ({
	isStreaming,
	duration,
}: ThinkingMessageProps) => {
	const phrase = useThinkingPhrase();
	if (isStreaming || duration === 0) {
		return <Shimmer duration={1}>{phrase}</Shimmer>;
	}
	if (duration === undefined) {
		return <span>Thought</span>;
	}
	return <span>Thought for {duration}s</span>;
};

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => (
	<DefaultThinkingMessage duration={duration} isStreaming={isStreaming} />
);

export const ReasoningTrigger = memo(
	({
		className,
		children,
		getThinkingMessage = defaultGetThinkingMessage,
		...props
	}: ReasoningTriggerProps) => {
		const { isStreaming, isOpen, duration } = useReasoning();
		const variant = useRandomThinkingVariant();

		return (
			<CollapsibleTrigger
				className={cn(
					"flex w-full items-center justify-between gap-2 py-1 text-left text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
					className
				)}
				{...props}
			>
				{children ?? (
					<>
						<span className="flex items-center gap-2">
							{isStreaming ? (
								<UnicodeSpinner
									className="text-[13px] opacity-80"
									label="Thinking"
									variant={variant}
								/>
							) : null}
							<span>{getThinkingMessage(isStreaming, duration)}</span>
						</span>
						<CaretDownIcon
							className={cn(
								"size-3.5 shrink-0 opacity-60 transition-transform",
								isOpen ? "rotate-180" : "rotate-0"
							)}
							weight="fill"
						/>
					</>
				)}
			</CollapsibleTrigger>
		);
	}
);

export type ReasoningContentProps = ComponentProps<
	typeof CollapsibleContent
> & {
	children: string;
};

export const ReasoningContent = memo(
	({ className, children, ...props }: ReasoningContentProps) => (
		<CollapsibleContent
			className={cn(
				"data-[state=closed]:hidden",
				"data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 text-foreground/80 outline-none data-[state=open]:animate-in",
				className
			)}
			{...props}
		>
			<div className="py-1.5 pl-5 text-xs">
				<Streamdown>{children}</Streamdown>
			</div>
		</CollapsibleContent>
	)
);

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
