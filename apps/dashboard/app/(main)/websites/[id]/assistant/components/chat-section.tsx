'use client';

import {
	ChartBarIcon,
	ChatIcon,
	ClockCounterClockwiseIcon,
	HashIcon,
	LightningIcon,
	PaperPlaneRightIcon,
	SparkleIcon,
	TrendUpIcon,
} from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
	isRateLimitedAtom,
	modelAtom,
	websiteDataAtom,
} from '@/stores/jotai/assistantAtoms';
import { useChat } from '../hooks/use-chat';
import { ChatHistorySheet } from './chat-history-sheet';
import { MessageBubble } from './message-bubble';
import { ModelSelector } from './model-selector';

export function ChatSkeleton() {
	return (
		<div className="flex h-full flex-col overflow-hidden rounded border bg-background">
			{/* Header Skeleton */}
			<div className="flex flex-shrink-0 items-center justify-between border-b p-4">
				<div className="flex items-center gap-3">
					<Skeleton className="h-8 w-8 rounded" />
					<div>
						<Skeleton className="mb-2 h-4 w-24" />
						<Skeleton className="h-3 w-32" />
					</div>
				</div>
				<Skeleton className="h-8 w-8 rounded" />
			</div>
			{/* Messages Area Skeleton */}
			<div className="flex-1 space-y-4 overflow-y-auto p-4">
				<div className="flex gap-3">
					<Skeleton className="h-8 w-8 flex-shrink-0 rounded" />
					<Skeleton className="h-12 w-3/4 rounded" />
				</div>
				<div className="ml-auto flex flex-row-reverse gap-3">
					<Skeleton className="h-8 w-8 flex-shrink-0 rounded" />
					<Skeleton className="h-10 w-1/2 rounded" />
				</div>
				<div className="flex gap-3">
					<Skeleton className="h-8 w-8 flex-shrink-0 rounded" />
					<Skeleton className="h-16 w-4/5 rounded" />
				</div>
			</div>
			{/* Input Area Skeleton */}
			<div className="flex-shrink-0 border-t p-4">
				<div className="flex gap-3">
					<Skeleton className="h-10 flex-1 rounded" />
					<Skeleton className="h-10 w-10 rounded" />
				</div>
			</div>
		</div>
	);
}

const quickQuestions = [
	{
		text: 'Show me page views over the last 7 days',
		icon: TrendUpIcon,
		type: 'chart',
	},
	{ text: 'How many visitors yesterday?', icon: HashIcon, type: 'metric' },
	{
		text: 'Top traffic sources breakdown',
		icon: ChartBarIcon,
		type: 'chart',
	},
	{ text: "What's my bounce rate?", icon: HashIcon, type: 'metric' },
];

export default function ChatSection() {
	const [selectedModel] = useAtom(modelAtom);
	const [websiteData] = useAtom(websiteDataAtom);
	const [isRateLimited] = useAtom(isRateLimitedAtom);

	const bottomRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const {
		messages,
		inputValue,
		setInputValue,
		isLoading,
		sendMessage,
		handleKeyPress,
		resetChat,
		handleVote,
		handleFeedbackComment,
	} = useChat();

	const [showChatHistory, setShowChatHistory] = useState(false);

	const messageStats = {
		total: messages.length,
		charts: messages.filter((m) => m.responseType === 'chart').length,
		metrics: messages.filter((m) => m.responseType === 'metric').length,
		text: messages.filter((m) => m.responseType === 'text').length,
	};

	const hasMessages = messages.length > 1;

	useEffect(() => {
		if (inputRef.current && !isLoading) {
			inputRef.current.focus();
		}
	}, [isLoading]);

	const handleSend = () => {
		if (!isLoading && inputValue.trim()) {
			sendMessage(inputValue.trim());
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	};

	return (
		<div className="flex h-full flex-col overflow-hidden rounded border bg-gradient-to-br from-background to-muted/10 shadow-lg backdrop-blur-sm">
			{/* Enhanced Header */}
			<div className="flex flex-shrink-0 items-center justify-between border-b bg-gradient-to-r from-primary/5 to-accent/5 p-4">
				<div className="flex flex-1 items-center gap-3">
					<Avatar>
						<AvatarImage src="/databunny.webp" />
						<AvatarFallback>DB</AvatarFallback>
					</Avatar>
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<h2 className="truncate font-semibold text-lg">Databunny</h2>
							{hasMessages && (
								<span className="px-2 py-0.5 text-muted-foreground text-xs">
									{messageStats.total}{' '}
									{messageStats.total === 1 ? 'query' : 'queries'}
								</span>
							)}
						</div>
						<p className="truncate text-muted-foreground text-sm">
							{isLoading
								? 'Databunny is analyzing your data...'
								: `Your data analyst for ${websiteData?.name || 'your website'}`}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<ModelSelector disabled={isLoading} selectedModel={selectedModel} />
					<Button
						onClick={() => setShowChatHistory(true)}
						title="Open chat history"
						variant="ghost"
					>
						<ChatIcon className="h-5 w-5" weight="duotone" />
					</Button>
					<Button
						className="flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
						disabled={isLoading}
						onClick={resetChat}
						size="icon"
						title="Reset chat"
						variant="ghost"
					>
						<ClockCounterClockwiseIcon className="h-4 w-4" />
					</Button>
				</div>
			</div>

			{/* Messages Area */}
			<Conversation>
				<ConversationContent>
					{/* Welcome State */}
					{!(hasMessages || isLoading) && (
						<div className="fade-in-0 slide-in-from-bottom-4 h-full animate-in space-y-6 duration-500">
							<div className="flex h-full flex-col justify-between">
								<div className="space-y-2 py-4 text-center">
									<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-accent/10">
										<SparkleIcon
											className="h-8 w-8 text-primary"
											weight="duotone"
										/>
									</div>
									<h3 className="font-semibold text-lg">
										Welcome to Databunny
									</h3>
									<p className="mx-auto max-w-md text-muted-foreground text-sm">
										I'm Databunny, your data analyst. I can help you understand
										your website data through charts, metrics, and insights.
										Just ask me anything!
									</p>
								</div>

								<div className="space-y-3">
									<div className="flex items-center gap-2 text-muted-foreground text-sm">
										<LightningIcon className="h-4 w-4" weight="duotone" />
										<span>Try these examples:</span>
									</div>
									<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
										{quickQuestions.map((question, index) => (
											<Button
												className={cn(
													'h-auto px-4 py-3 text-left font-normal text-sm',
													'hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5',
													'border-dashed transition-all duration-300 hover:border-solid',
													'fade-in-0 slide-in-from-left-2 animate-in'
												)}
												disabled={isLoading || isRateLimited}
												key={question.text}
												onClick={() => {
													if (!(isLoading || isRateLimited)) {
														sendMessage(question.text);
													}
												}}
												size="sm"
												style={{ animationDelay: `${index * 100}ms` }}
												variant="outline"
											>
												<question.icon className="mr-3 h-4 w-4 flex-shrink-0 text-primary/70" />
												<div className="flex-1">
													<div className="font-medium">{question.text}</div>
													<div className="text-muted-foreground text-xs capitalize">
														{question.type} response
													</div>
												</div>
											</Button>
										))}
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Messages */}
					{hasMessages && (
						<div className="space-y-3">
							{messages.map((message, index) => (
								<MessageBubble
									handleFeedbackComment={handleFeedbackComment}
									handleVote={handleVote}
									isLastMessage={index === messages.length - 1}
									key={message.id}
									message={message}
								/>
							))}
							<div ref={bottomRef} />
						</div>
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			{/* Enhanced Input Area */}
			<div className="flex-shrink-0 border-t bg-gradient-to-r from-muted/10 to-muted/5 p-4">
				<div className="flex gap-3">
					<Input
						className={cn(
							'h-11 flex-1 rounded-xl border-2 bg-background/50 backdrop-blur-sm',
							'placeholder:text-muted-foreground/60',
							'focus:border-primary/30 focus:bg-background/80',
							'transition-all duration-200'
						)}
						disabled={isLoading || isRateLimited}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								handleSend();
							} else {
								handleKeyPress(e);
							}
						}}
						placeholder={
							isLoading
								? 'Databunny is thinking...'
								: isRateLimited
									? 'Rate limited - please wait...'
									: 'Ask Databunny about your analytics data...'
						}
						ref={inputRef}
						value={inputValue}
					/>
					<Button
						className={cn(
							'h-11 w-11 flex-shrink-0 rounded-xl',
							'bg-gradient-to-r from-primary to-primary/80',
							'hover:from-primary/90 hover:to-primary/70',
							'shadow-lg transition-all duration-200',
							(!inputValue.trim() || isRateLimited) &&
								!isLoading &&
								'opacity-50'
						)}
						disabled={!inputValue.trim() || isLoading || isRateLimited}
						onClick={handleSend}
						size="icon"
						title="Send message"
					>
						<PaperPlaneRightIcon
							className={cn(
								'h-4 w-4',
								inputValue.trim() && !isLoading && !isRateLimited && 'scale-110'
							)}
							weight="duotone"
						/>
					</Button>
				</div>

				{/* Helper text */}
				<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
					<div className="flex items-center gap-2 text-muted-foreground">
						<SparkleIcon className="h-3 w-3 flex-shrink-0" weight="duotone" />
						<span>Ask about trends, comparisons, or specific metrics</span>
					</div>
					{hasMessages && (
						<div className="flex items-center gap-3 text-muted-foreground">
							{messageStats.charts > 0 && (
								<span className="flex items-center gap-1">
									<ChartBarIcon className="h-3 w-3" weight="duotone" />
									{messageStats.charts}
								</span>
							)}
							{messageStats.metrics > 0 && (
								<span className="flex items-center gap-1">
									<HashIcon className="h-3 w-3" weight="duotone" />
									{messageStats.metrics}
								</span>
							)}
						</div>
					)}
				</div>
			</div>

			<ChatHistorySheet
				isOpen={showChatHistory}
				onClose={() => setShowChatHistory(false)}
			/>
		</div>
	);
}
