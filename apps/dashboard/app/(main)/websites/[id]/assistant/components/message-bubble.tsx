import {
	ChartBarIcon,
	ChartLineIcon,
	ChartPieIcon,
	HashIcon,
	CopyIcon,
	ArrowClockwiseIcon,
} from '@phosphor-icons/react/ssr';

import {
	Message as AIMessage,
	MessageContent,
	MessageAvatar,
} from '@/components/ai-elements/message';
import { Loader } from '@/components/ai-elements/loader';
import {
	Reasoning,
	ReasoningTrigger,
	ReasoningContent,
} from '@/components/ai-elements/reasoning';
import { Response } from '@/components/ai-elements/response';
import { Actions, Action } from '@/components/ai-elements/actions';
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



function ThinkingStepsReasoning({ steps, isStreaming = false }: { steps: string[]; isStreaming?: boolean }) {
	if (steps.length === 0) {
		return null;
	}

	const reasoningContent = steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n');

	return (
		<Reasoning isStreaming={isStreaming} defaultOpen={false}>
			<ReasoningTrigger title={`Thinking Process (${steps.length} steps)`} />
			<ReasoningContent>{reasoningContent}</ReasoningContent>
		</Reasoning>
	);
}

function InProgressMessage({ message }: { message: Message }) {
	const hasThinkingSteps =
		message.thinkingSteps && message.thinkingSteps.length > 0;

	return (
		<AIMessage from="assistant">
			<MessageAvatar 
				src="/databunny-avatar.png" 
				name="Databunny"
			/>
			<MessageContent>
				<div className="flex items-center gap-2">
					<Loader size={16} />
					<span className="text-muted-foreground">
						Databunny is analyzing...
					</span>
				</div>

				{hasThinkingSteps && (
					<div className="mt-3 border-border/30 border-t pt-3">
						<ThinkingStepsReasoning 
							steps={message.thinkingSteps || []} 
							isStreaming={true}
						/>
					</div>
				)}
			</MessageContent>
		</AIMessage>
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
		<AIMessage from={isUser ? 'user' : 'assistant'}>
			<MessageAvatar 
				src={isUser ? "/user-avatar.png" : "/databunny-avatar.png"} 
				name={isUser ? "You" : "Databunny"}
			/>
			<MessageContent>
				<Response>{message.content}</Response>

				{hasThinkingSteps && !isUser && message.content && (
					<div className="mt-3">
						<ThinkingStepsReasoning steps={message.thinkingSteps || []} />
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

				<div className="mt-3 flex items-center justify-between">
					<div className="opacity-60 text-xs">
						{message.timestamp.toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
						})}
					</div>
					{!isUser && (
						<Actions>
							<Action 
								tooltip="Copy message"
								onClick={() => navigator.clipboard.writeText(message.content)}
							>
								<CopyIcon className="h-4 w-4" />
							</Action>
							<Action 
								tooltip="Regenerate response"
								onClick={() => {/* TODO: Implement regenerate */}}
							>
								<ArrowClockwiseIcon className="h-4 w-4" />
							</Action>
						</Actions>
					)}
				</div>
			</MessageContent>
		</AIMessage>
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
