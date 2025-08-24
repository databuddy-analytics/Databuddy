'use client';

import {
	BrainIcon,
	ChartBarIcon,
	ClockCounterClockwiseIcon,
	HashIcon,
	LightningIcon,
	SparkleIcon,
	TrendUpIcon,
} from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import { Action, Actions } from '@/components/ai-elements/actions';
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from '@/components/ai-elements/conversation';

import {
	PromptInput,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputToolbar,
} from '@/components/ai-elements/prompt-input';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Skeleton } from '@/components/ui/skeleton';

import { modelAtom, websiteDataAtom } from '@/stores/jotai/assistantAtoms';
import { useChat } from '../hooks/use-chat';
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
	{ text: 'Show me page views over the last 7 days', icon: TrendUpIcon },
	{ text: 'How many visitors yesterday?', icon: HashIcon },
	{ text: 'Top traffic sources breakdown', icon: ChartBarIcon },
	{ text: "What's my bounce rate?", icon: HashIcon },
];

export default function ChatSection() {
	const [selectedModel] = useAtom(modelAtom);
	const [websiteData] = useAtom(websiteDataAtom);

	const inputRef = useRef<HTMLTextAreaElement>(null);
	const {
		messages,
		inputValue,
		setInputValue,
		isLoading,
		sendMessage,
		scrollToBottom,
		resetChat,
		handleVote,
		handleFeedbackComment,
	} = useChat();

	const hasMessages = messages.length > 1;

	useEffect(() => {
		if (inputRef.current && !isLoading) {
			inputRef.current.focus();
		}
	}, [isLoading]);

	const handleSend = () => {
		if (!isLoading && inputValue.trim()) {
			sendMessage(inputValue.trim());
			scrollToBottom();
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col rounded border bg-background">
			{/* Header */}
			<div className="flex flex-shrink-0 items-center justify-between border-b p-4">
				<div className="flex min-w-0 flex-1 items-center gap-3">
					<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-primary/10">
						<BrainIcon className="h-4 w-4 text-primary" weight="duotone" />
					</div>
					<div className="min-w-0 flex-1">
						<h2 className="truncate font-medium text-sm">Databunny</h2>
						<p className="truncate text-muted-foreground text-xs">
							{isLoading
								? 'Analyzing your data...'
								: `Data analyst for ${websiteData?.name || 'your website'}`}
						</p>
					</div>
				</div>
				<Actions>
					<ModelSelector disabled={isLoading} selectedModel={selectedModel} />
					<Action
						className="hover:bg-destructive/10 hover:text-destructive"
						disabled={isLoading}
						onClick={resetChat}
						tooltip="Reset chat"
					>
						<ClockCounterClockwiseIcon className="h-4 w-4" />
					</Action>
				</Actions>
			</div>

			{/* Messages Area */}
			<Conversation>
				<ConversationContent className="!p-4">
					<ConversationScrollButton />
					{!(hasMessages || isLoading) && (
						<div className="h-full space-y-6">
							<div className="flex h-full flex-col justify-between">
								<div className="space-y-4 py-8 text-center">
									<div className="mx-auto flex h-12 w-12 items-center justify-center rounded bg-primary/10">
										<SparkleIcon
											className="h-4 w-4 text-primary"
											weight="duotone"
										/>
									</div>
									<h3 className="font-medium text-sm">Welcome to Databunny</h3>
									<p className="mx-auto max-w-md text-muted-foreground text-xs">
										Your data analyst. Ask me about your website analytics,
										metrics, and trends.
									</p>
								</div>
								<div className="space-y-3">
									<div className="flex items-center gap-2 text-muted-foreground text-xs">
										<LightningIcon className="h-4 w-4" weight="duotone" />
										<span>Try these examples:</span>
									</div>
									<Suggestions>
										{quickQuestions.map((question) => (
											<Suggestion
												disabled={isLoading}
												key={question.text}
												onClick={(suggestion) => {
													if (!isLoading) {
														sendMessage(suggestion);
														scrollToBottom();
													}
												}}
												suggestion={question.text}
											>
												<question.icon className="mr-2 h-4 w-4 text-primary" />
												{question.text}
											</Suggestion>
										))}
									</Suggestions>
								</div>
							</div>
						</div>
					)}

					{hasMessages && (
						<div className="space-y-4">
							{messages.map((message, index) => (
								<MessageBubble
									handleFeedbackComment={handleFeedbackComment}
									handleVote={handleVote}
									isLastMessage={index === messages.length - 1}
									key={message.id}
									message={message}
								/>
							))}
						</div>
					)}
				</ConversationContent>
			</Conversation>

			{/* Input Area */}
			<div className="border-t p-4">
				<PromptInput
					onSubmit={(e) => {
						e.preventDefault();
						handleSend();
					}}
				>
					<PromptInputTextarea
						disabled={isLoading}
						onChange={(e) => setInputValue(e.target.value)}
						placeholder={
							isLoading ? 'Analyzing...' : 'Ask about your analytics data...'
						}
						ref={inputRef}
						value={inputValue}
					/>
					<PromptInputToolbar>
						<div />
						<PromptInputSubmit
							disabled={!inputValue.trim() || isLoading}
							status={isLoading ? 'submitted' : undefined}
						/>
					</PromptInputToolbar>
				</PromptInput>
			</div>
		</div>
	);
}
