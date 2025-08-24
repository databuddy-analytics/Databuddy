import {
	ChartBarIcon,
	ChartLineIcon,
	ChartPieIcon,
	CopyIcon,
	HashIcon,
	PaperPlaneRightIcon,
	ThumbsDownIcon,
	ThumbsUpIcon,
	XIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Action, Actions } from '@/components/ai-elements/actions';
import { Loader } from '@/components/ai-elements/loader';
import {
	Message as AIMessage,
	MessageAvatar,
	MessageContent,
} from '@/components/ai-elements/message';
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Response } from '@/components/ai-elements/response';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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

function ThinkingStepsReasoning({
	steps,
	isStreaming = false,
}: {
	steps: string[];
	isStreaming?: boolean;
}) {
	if (steps.length === 0) {
		return null;
	}

	const reasoningContent = steps.map((step) => `• ${step}`).join('\n');

	return (
		<Reasoning defaultOpen={false} isStreaming={isStreaming}>
			<ReasoningTrigger>
				<span className="cursor-pointer text-muted-foreground/60 text-xs hover:text-muted-foreground">
					{isStreaming ? 'Thinking...' : 'Show reasoning'}
				</span>
			</ReasoningTrigger>
			<ReasoningContent>{reasoningContent}</ReasoningContent>
		</Reasoning>
	);
}

function InProgressMessage({ message }: { message: Message }) {
	const hasThinkingSteps =
		message.thinkingSteps && message.thinkingSteps.length > 0;

	return (
		<AIMessage from="assistant">
			<MessageAvatar name="Databunny" src="/databunny.webp" />
			<MessageContent>
				<div className="flex items-center gap-2">
					<Loader size={16} />
					<span className="text-muted-foreground">
						Databunny is analyzing...
					</span>
				</div>

				{hasThinkingSteps && (
					<div className="mt-2 border-border/30 border-t pt-2">
						<ThinkingStepsReasoning
							isStreaming={true}
							steps={message.thinkingSteps || []}
						/>
					</div>
				)}
			</MessageContent>
		</AIMessage>
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

	const handleSubmit = () => {
		if (!feedbackText.trim()) {
			return;
		}

		onSubmit(feedbackText.trim());
		onCancel();
	};

	const handleCancel = () => {
		setFeedbackText('');
		onCancel();
	};

	return (
		<div className="slide-in-from-top-2 fade-in-0 mt-3 animate-in space-y-3 rounded-md border border-border/50 bg-muted/30 p-3 duration-200">
			<div className="text-muted-foreground text-xs">
				Help us improve by sharing what went wrong:
			</div>
			<Textarea
				className="resize-none"
				onChange={(e) => setFeedbackText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						handleSubmit();
					}
				}}
				placeholder="Please describe what went wrong..."
				rows={4}
				value={feedbackText}
			/>
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
					Submit Feedback
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

function CompletedMessage({
	message,
	isUser,
	handleVote,
	handleFeedbackComment,
	isLastMessage,
}: CompletedMessageProps) {
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
		<AIMessage from={isUser ? 'user' : 'assistant'}>
			<div className="space-y-2">
				<MessageContent>
					<Response>{message.content}</Response>

					{hasThinkingSteps && !isUser && message.content && (
						<div className="mt-2">
							<ThinkingStepsReasoning steps={message.thinkingSteps || []} />
						</div>
					)}

					{message.responseType === 'metric' &&
						message.metricValue !== undefined &&
						!isUser && (
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

					{message.hasVisualization && !isUser && (
						<div className="mt-3 border-border/30 border-t pt-3">
							<div className="flex items-center gap-2 text-muted-foreground text-xs">
								{getChartIcon(message.chartType || 'bar')}
								<span>Visualization generated in the data panel.</span>
							</div>
						</div>
					)}
				</MessageContent>
				{!isUser && isLastMessage && (
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
		</AIMessage>
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
