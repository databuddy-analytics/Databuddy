'use client';

import {
	BrainIcon,
	CaretDownIcon,
	ChartBarIcon,
	ChartLineIcon,
	ChartPieIcon,
	ClockIcon,
	HashIcon,
	RobotIcon,
	UserIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import type { Message } from '../types/message';

interface MessageBubbleProps {
	message: Message;
}

const getChartIcon = (chartType: string) => {
	switch (chartType) {
		case 'bar':
			return <ChartBarIcon className="h-4 w-4" />;
		case 'line':
			return <ChartLineIcon className="h-4 w-4" />;
		case 'pie':
			return <ChartPieIcon className="h-4 w-4" />;
		default:
			return <ChartBarIcon className="h-4 w-4" />;
	}
};

function ThinkingStepsPreview({ steps }: { steps: string[] }) {
	const [visibleSteps, setVisibleSteps] = useState<string[]>([]);
	const [animatedSteps, setAnimatedSteps] = useState<Set<number>>(new Set());
	const maxPreviewSteps = 3;

	useEffect(() => {
		if (steps.length === 0) {
			return;
		}

		// Show the latest steps in the preview (sliding window)
		const latestSteps = steps.slice(-maxPreviewSteps);
		setVisibleSteps(latestSteps);

		// Animate new steps
		const newStepIndex = latestSteps.length - 1;
		if (newStepIndex >= 0) {
			setTimeout(() => {
				setAnimatedSteps((prev) => new Set([...prev, newStepIndex]));
			}, 50);
		}
	}, [steps]);

	if (visibleSteps.length === 0) {
		return null;
	}

	return (
		<div className="mt-2 max-h-20 space-y-1 overflow-hidden">
			{visibleSteps.map((step, index) => {
				const isAnimated = animatedSteps.has(index);

				return (
					<div
						className={cn(
							'flex items-start gap-2 py-1 pl-1 text-muted-foreground text-xs transition-all duration-300 ease-in-out',
							isAnimated
								? 'translate-y-0 opacity-100'
								: 'translate-y-2 opacity-0'
						)}
						key={`preview-${index}-${step.slice(0, 20)}`}
					>
						<ClockIcon className="mt-0.5 h-3 w-3 flex-shrink-0" />
						<span className="break-words leading-relaxed">{step}</span>
					</div>
				);
			})}
			{steps.length > maxPreviewSteps && (
				<div className="flex items-center gap-2 py-1 pl-1 text-muted-foreground text-xs opacity-60">
					<CaretDownIcon className="h-3 w-3" />
					<span>+{steps.length - maxPreviewSteps} more steps...</span>
				</div>
			)}
		</div>
	);
}

function ThinkingStepsAccordion({ steps }: { steps: string[] }) {
	if (steps.length === 0) {
		return null;
	}

	return (
		<Accordion className="w-full" collapsible type="single">
			<AccordionItem className="border-border/30" value="thinking-steps">
				<AccordionTrigger className="py-2 text-xs hover:no-underline">
					<div className="flex items-center gap-2">
						<BrainIcon className="h-3 w-3" />
						<span>Thinking Process ({steps.length} steps)</span>
					</div>
				</AccordionTrigger>
				<AccordionContent className="pt-2">
					<div className="max-h-48 space-y-2 overflow-y-auto">
						{steps.map((step, index) => {
							return (
								<div
									className="flex items-start gap-2 py-1 pl-1 text-muted-foreground text-xs"
									key={`step-${index}-${step.slice(0, 20)}`}
								>
									<div className="mt-0.5 flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full bg-muted-foreground/20">
										<span className="font-mono text-[10px]">{index + 1}</span>
									</div>
									<span className="leading-relaxed">{step}</span>
								</div>
							);
						})}
					</div>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

function InProgressMessage({ message }: { message: Message }) {
	const hasThinkingSteps =
		message.thinkingSteps && message.thinkingSteps.length > 0;

	return (
		<div className="flex w-full max-w-[85%] gap-3">
			<div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border bg-muted shadow-sm">
				<RobotIcon className="h-4 w-4" />
			</div>
			<div className="min-w-0 flex-1 rounded-lg border bg-muted px-4 py-3 shadow-sm">
				<div className="flex items-center gap-2 text-sm">
					<div className="flex space-x-1">
						<div className="h-2 w-2 animate-bounce rounded-full bg-foreground [animation-delay:-0.3s]" />
						<div className="h-2 w-2 animate-bounce rounded-full bg-foreground [animation-delay:-0.15s]" />
						<div className="h-2 w-2 animate-bounce rounded-full bg-foreground" />
					</div>
					<span className="text-muted-foreground">Nova is analyzing...</span>
				</div>

				{hasThinkingSteps && (
					<div className="mt-3 border-border/30 border-t pt-3">
						<ThinkingStepsPreview steps={message.thinkingSteps || []} />
					</div>
				)}
			</div>
		</div>
	);
}

function CompletedMessage({
	message,
	isUser,
}: {
	message: Message;
	isUser: boolean;
}) {
	const hasThinkingSteps =
		message.thinkingSteps && message.thinkingSteps.length > 0;

	return (
		<div
			className={cn(
				'group flex w-full gap-3',
				isUser ? 'justify-end' : 'justify-start'
			)}
		>
			<div
				className={cn(
					'mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full shadow-sm',
					isUser
						? 'order-2 bg-primary text-primary-foreground'
						: 'order-1 border bg-muted'
				)}
			>
				{isUser ? (
					<UserIcon className="h-4 w-4" />
				) : (
					<RobotIcon className="h-4 w-4" />
				)}
			</div>

			<div
				className={cn(
					'relative min-w-0 max-w-[85%] rounded-lg px-4 py-3 shadow-sm',
					isUser
						? 'order-1 bg-primary text-primary-foreground'
						: 'order-2 border bg-muted'
				)}
			>
				<div className="overflow-wrap-anywhere whitespace-pre-wrap break-words text-sm leading-relaxed">
					{message.content}
				</div>

				{hasThinkingSteps && !isUser && message.content && (
					<div className="mt-3">
						<ThinkingStepsAccordion steps={message.thinkingSteps || []} />
					</div>
				)}

				{message.responseType === 'metric' &&
					message.metricValue !== undefined &&
					!isUser && (
						<div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
							<div className="flex min-w-0 items-center gap-3">
								<div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
									<HashIcon className="h-5 w-5 text-primary" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate font-medium text-muted-foreground text-xs uppercase tracking-wide">
										{message.metricLabel || 'Result'}
									</div>
									<div className="mt-1 break-words font-bold text-2xl text-foreground">
										{typeof message.metricValue === 'number'
											? message.metricValue.toLocaleString()
											: message.metricValue}
									</div>
								</div>
							</div>
						</div>
					)}

				{message.hasVisualization && !isUser && (
					<div className="mt-3 border-border/30 border-t pt-3">
						<div className="flex items-center gap-2 text-muted-foreground text-xs">
							{getChartIcon(message.chartType || 'bar')}
							<span>Visualization generated in the data panel.</span>
						</div>
					</div>
				)}

				<div className="-bottom-5 absolute right-0 opacity-0 transition-opacity group-hover:opacity-60">
					<div className="mt-1 font-mono text-xs">
						{message.timestamp.toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
						})}
					</div>
				</div>
			</div>
		</div>
	);
}

export function MessageBubble({ message }: MessageBubbleProps) {
	const isUser = message.type === 'user';
	const isInProgress = message.type === 'assistant' && !message.content;

	if (isInProgress) {
		return <InProgressMessage message={message} />;
	}

	return <CompletedMessage isUser={isUser} message={message} />;
}
