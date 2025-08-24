import {
	CaretDownIcon,
	ChartBarIcon,
	ChartLineIcon,
	ChartPieIcon,
	ClockIcon,
	CopyIcon,
	HashIcon,
	PaperPlaneRightIcon,
	ThumbsDownIcon,
	ThumbsUpIcon,
	XIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Action, Actions } from '@/components/ai-elements/actions';
import { Loader } from '@/components/ai-elements/loader';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { useChat, Vote } from '../hooks/use-chat';
import type { Message } from '../types/message';

interface MessageBubbleProps {
	message: Message;
	handleVote: ReturnType<typeof useChat>['handleVote'];
	handleFeedbackComment: ReturnType<typeof useChat>['handleFeedbackComment'];
	isLastMessage: boolean;
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
		<Accordion collapsible type="single">
			<AccordionItem className="border-border/30" value="thinking-steps">
				<AccordionTrigger className="flex items-center justify-start gap-1 pt-2 pb-0 text-gray-500/50 text-xs hover:no-underline">
					<span className="text-gray-500/70">Show reasoning</span>
				</AccordionTrigger>
				<AccordionContent className="pt-1 pb-0">
					<ul className="max-h-48 list-disc overflow-y-auto px-4 text-muted-foreground">
						{steps.map((step, index) => {
							return (
								<li
									className="text-xs leading-relaxed"
									key={`step-${index}-${step.slice(0, 20)}`}
								>
									{step}
								</li>
							);
						})}
					</ul>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

function InProgressMessage({ message }: { message: Message }) {
	const hasThinkingSteps =
		message.thinkingSteps && message.thinkingSteps.length > 0;

	return (
		<div className="flex w-full max-w-3/4 gap-3">
			<div className="min-w-0 flex-1 rounded-lg border bg-muted px-4 py-3 shadow-sm">
				<div className="flex items-center gap-2 text-sm">
					<Loader size={16} />
					<span className="text-muted-foreground">
						Databunny is analyzing...
					</span>
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

function FeedbackInput({
	onSubmit,
	onCancel,
}: {
	onSubmit: (feedbackText: string) => void;
	onCancel: () => void;
}) {
	const [feedbackText, setFeedbackText] = useState('');
	const [showInput, setShowInput] = useState(false);

	const predefinedFeedback = [
		'Inaccurate or incorrect',
		'Not helpful',
		'Too long or verbose',
		'Unclear or confusing',
		"Didn't answer my question",
		'Inappropriate content',
	];

	const handleSubmit = () => {
		if (!feedbackText.trim()) {
			return;
		}

		onSubmit(feedbackText.trim());
		onCancel();
	};

	const handleCancel = () => {
		setFeedbackText('');
		setShowInput(false);
		onCancel();
	};

	const handlePredefinedClick = (feedback: string) => {
		setFeedbackText(feedback);
		setShowInput(false);
	};

	const handleCustomTextChange = (
		e: React.ChangeEvent<HTMLTextAreaElement>
	) => {
		setFeedbackText(e.target.value);
	};

	const handleMoreClick = () => {
		setShowInput(true);
		setFeedbackText('');
	};

	return (
		<div className="slide-in-from-top-2 fade-in-0 mt-3 animate-in space-y-3 rounded border border-border/50 bg-muted/30 p-3 duration-200">
			<div className="text-muted-foreground text-xs">
				Help us improve by sharing what went wrong:
			</div>

			<div className="flex flex-wrap gap-2">
				{predefinedFeedback.map((feedback) => (
					<Button
						className="h-6 rounded-lg text-xs"
						key={feedback}
						onClick={() => handlePredefinedClick(feedback)}
						size="sm"
						variant={feedbackText === feedback ? 'default' : 'outline'}
					>
						{feedback}
					</Button>
				))}
				<Button
					className="h-6 rounded-lg text-xs"
					onClick={handleMoreClick}
					size="sm"
					variant="outline"
				>
					More...
				</Button>
			</div>

			{showInput && (
				<Textarea
					className="resize-none"
					onChange={handleCustomTextChange}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							handleSubmit();
						}
					}}
					placeholder="Tell us what went wrong..."
					rows={2}
					value={feedbackText}
				/>
			)}

			<div className="flex justify-end gap-2">
				<Button onClick={handleCancel} size="sm" variant="ghost">
					<XIcon />
					Cancel
				</Button>
				<Button
					disabled={!feedbackText.trim()}
					onClick={handleSubmit}
					size="sm"
				>
					<PaperPlaneRightIcon />
					Submit
				</Button>
			</div>
		</div>
	);
}

interface CompletedMessageProps {
	message: Message;
	isUser: boolean;
	handleVote: ReturnType<typeof useChat>['handleVote'];
	handleFeedbackComment: ReturnType<typeof useChat>['handleFeedbackComment'];
	isLastMessage: boolean;
}

interface AIMessageProps {
	message: Message;
	handleVote: ReturnType<typeof useChat>['handleVote'];
	handleFeedbackComment: ReturnType<typeof useChat>['handleFeedbackComment'];
	isLastMessage: boolean;
}

interface UserMessageProps {
	message: Message;
}

function AIMessage({
	message,
	handleVote,
	handleFeedbackComment,
	isLastMessage,
}: AIMessageProps) {
	const [voteType, setVoteType] = useState<Vote | null>(null);
	const [showFeedbackInput, setShowFeedbackInput] = useState(false);
	const hasThinkingSteps = Boolean(message.thinkingSteps?.length);

	const resetFeedback = () => {
		setShowFeedbackInput(false);
	};

	const handleSubmitFeedback = (feedbackText: string) => {
		handleFeedbackComment(message.id, feedbackText);
		setShowFeedbackInput(false);
	};

	const handleFeedbackButtonClick = (type: Vote) => {
		if (type === 'downvote') {
			setShowFeedbackInput(true);
		}

		setVoteType(type);
		handleVote(message.id, type);
	};

	const showUpVoteButton = voteType !== 'downvote';
	const showDownVoteButton = voteType !== 'upvote';
	const isVoteButtonClicked = voteType !== null;

	return (
		<div className="max-w-3/4 space-y-2">
			<div className="rounded-lg border bg-muted px-4 py-3 shadow-sm">
				<div className="wrap-break-word whitespace-pre-wrap text-sm leading-relaxed">
					{message.content}
				</div>

				{hasThinkingSteps && message.content && (
					<ThinkingStepsAccordion steps={message.thinkingSteps || []} />
				)}

				{message.responseType === 'metric' &&
					message.metricValue !== undefined && (
						<div className="mt-4 rounded border border-primary/20 bg-primary/5 p-4">
							<div className="flex min-w-0 items-center gap-3">
								<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-primary/10">
									<HashIcon className="h-4 w-4 text-primary" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate font-medium text-muted-foreground text-xs uppercase tracking-wide">
										{message.metricLabel || 'Result'}
									</div>
									<div className="mt-2 break-words font-bold text-foreground text-lg">
										{typeof message.metricValue === 'number'
											? message.metricValue.toLocaleString()
											: message.metricValue}
									</div>
								</div>
							</div>
						</div>
					)}

				{message.hasVisualization && (
					<div className="mt-3 border-border/30 border-t pt-3">
						<div className="flex items-center gap-2 text-muted-foreground text-xs">
							{getChartIcon(message.chartType || 'bar')}
							<span>Visualization generated in the data panel.</span>
						</div>
					</div>
				)}
			</div>

			{isLastMessage && (
				<>
					<Actions>
						<Action
							className="cursor-pointer transition-colors hover:bg-blue-50 hover:text-blue-500 active:bg-blue-100"
							onClick={() => navigator.clipboard.writeText(message.content)}
							tooltip="Copy message"
						>
							<CopyIcon className="h-4 w-4" />
						</Action>
						{showUpVoteButton && (
							<Action
								className={`cursor-pointer transition-colors ${
									isVoteButtonClicked
										? 'bg-green-100 text-green-600'
										: 'hover:bg-green-50 hover:text-green-500 active:bg-green-100'
								}`}
								disabled={isVoteButtonClicked}
								onClick={() => handleFeedbackButtonClick('upvote')}
								tooltip="Upvote"
							>
								<ThumbsUpIcon className="h-4 w-4" />
							</Action>
						)}
						{showDownVoteButton && (
							<Action
								className={`cursor-pointer transition-colors ${
									isVoteButtonClicked
										? 'bg-red-100 text-red-600'
										: 'hover:bg-red-50 hover:text-red-500 active:bg-red-100'
								}`}
								disabled={isVoteButtonClicked}
								onClick={() => handleFeedbackButtonClick('downvote')}
								tooltip="Downvote"
							>
								<ThumbsDownIcon className="h-4 w-4" />
							</Action>
						)}
					</Actions>

					{showFeedbackInput && (
						<FeedbackInput
							onCancel={resetFeedback}
							onSubmit={handleSubmitFeedback}
						/>
					)}
				</>
			)}
		</div>
	);
}

function UserMessage({ message }: UserMessageProps) {
	return (
		<div className="flex w-full justify-end">
			<div className="max-w-3/4 rounded-lg bg-primary px-4 py-3 text-primary-foreground">
				<div className="wrap-break-word whitespace-pre-wrap text-sm leading-relaxed">
					{message.content}
				</div>
			</div>
		</div>
	);
}

function CompletedMessage({
	message,
	isUser,
	handleVote,
	handleFeedbackComment,
	isLastMessage,
}: CompletedMessageProps) {
	if (isUser) {
		return <UserMessage message={message} />;
	}

	return (
		<AIMessage
			handleFeedbackComment={handleFeedbackComment}
			handleVote={handleVote}
			isLastMessage={isLastMessage}
			message={message}
		/>
	);
}

export function MessageBubble({
	message,
	handleVote,
	handleFeedbackComment,
	isLastMessage,
}: MessageBubbleProps) {
	const isUser = message.type === 'user';
	const isInProgress = message.type === 'assistant' && !message.content;

	if (isInProgress) {
		return <InProgressMessage message={message} />;
	}

	return (
		<CompletedMessage
			handleFeedbackComment={handleFeedbackComment}
			handleVote={handleVote}
			isLastMessage={isLastMessage}
			isUser={isUser}
			message={message}
		/>
	);
}
