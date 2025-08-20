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
import { Loader } from '@/components/ai-elements/loader';
import {
	PromptInput,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputToolbar,
} from '@/components/ai-elements/prompt-input';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { modelAtom, websiteDataAtom } from '@/stores/jotai/assistantAtoms';
import { useChat } from '../hooks/use-chat';
import { MessageBubble } from './message-bubble';
import { ModelSelector } from './model-selector';

export function ChatSkeleton() {
	return (
		<div className="flex h-full flex-col overflow-hidden rounded border bg-background">
			{/* Header Skeleton */}
			<div className="flex flex-shrink-0 items-center justify-between border-b p-2">
				<div className="flex items-center gap-2">
					<Skeleton className="h-8 w-8 rounded-full" />
					<div>
						<Skeleton className="mb-1 h-4 w-24" />
						<Skeleton className="h-3 w-32" />
					</div>
				</div>
				<Skeleton className="h-8 w-8 rounded" />
			</div>
			{/* Messages Area Skeleton */}
			<div className="flex-1 space-y-2 overflow-y-auto p-2">
				<div className="flex animate-pulse gap-2">
					<Skeleton className="h-8 w-8 flex-shrink-0 rounded-full" />
					<Skeleton className="h-12 w-3/4 rounded" />
				</div>
				<div className="ml-auto flex animate-pulse flex-row-reverse gap-2 delay-75">
					<Skeleton className="h-8 w-8 flex-shrink-0 rounded-full" />
					<Skeleton className="h-10 w-1/2 rounded" />
				</div>
				<div className="flex animate-pulse gap-2 delay-150">
					<Skeleton className="h-8 w-8 flex-shrink-0 rounded-full" />
					<Skeleton className="h-16 w-4/5 rounded" />
				</div>
			</div>
			{/* Input Area Skeleton */}
			<div className="flex-shrink-0 border-t p-2">
				<div className="flex gap-2">
					<Skeleton className="h-9 flex-1 rounded" />
					<Skeleton className="h-9 w-9 rounded" />
				</div>
				<Skeleton className="mt-2 h-3 w-2/3" />
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
		isRateLimited,
		sendMessage,
		scrollToBottom,
		resetChat,
		handleUpVote,
		handleDownVote,
	} = useChat();

	const hasMessages = messages.length > 1;

	useEffect(() => {
		if (inputRef.current && !isLoading) {
			inputRef.current.focus();
		}
	}, [isLoading]);

	const handleSend = () => {
		if (!(isLoading || isRateLimited) && inputValue.trim()) {
			sendMessage(inputValue.trim());
			scrollToBottom();
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col rounded border bg-background">
			{/* Header */}
			<div className="flex flex-shrink-0 items-center justify-between border-b p-2">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<div className="relative">
						<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-primary/10">
							<BrainIcon className="h-4 w-4 text-primary" weight="duotone" />
						</div>
						{isLoading && (
							<div className="-bottom-0.5 -right-0.5 absolute flex h-3 w-3 items-center justify-center rounded-full bg-green-500">
								<Loader className="text-white" size={8} />
							</div>
						)}
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
						<ClockCounterClockwiseIcon
							className={cn('h-3 w-3', isLoading && 'animate-spin')}
						/>
					</Action>
				</Actions>
			</div>

			{/* Messages Area */}
			<Conversation>
				<ConversationContent className="!p-2">
					<ConversationScrollButton />
					{!(hasMessages || isLoading) && (
						<div className="h-full space-y-4">
							<div className="flex h-full flex-col justify-between">
								<div className="space-y-2 py-4 text-center">
									<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded bg-primary/10">
										<SparkleIcon
											className="h-6 w-6 text-primary"
											weight="duotone"
										/>
									</div>
									<h3 className="font-medium text-base">
										Welcome to Databunny
									</h3>
									<p className="mx-auto max-w-md text-muted-foreground text-sm">
										Your data analyst. Ask me about your website analytics,
										metrics, and trends.
									</p>
								</div>
								<div className="space-y-2">
									<div className="flex items-center gap-2 text-muted-foreground text-xs">
										<LightningIcon className="h-3 w-3" weight="duotone" />
										<span>Try these examples:</span>
									</div>
									<Suggestions>
										{quickQuestions.map((question) => (
											<Suggestion
												disabled={isLoading || isRateLimited}
												key={question.text}
												onClick={(suggestion) => {
													if (!(isLoading || isRateLimited)) {
														sendMessage(suggestion);
														scrollToBottom();
													}
												}}
												suggestion={question.text}
											>
												<question.icon className="mr-1.5 h-3 w-3 text-primary/70" />
												{question.text}
											</Suggestion>
										))}
									</Suggestions>
								</div>
							</div>
						</div>
					)}

					{hasMessages && (
						<div className="space-y-2">
							{messages.map((message) => (
								<MessageBubble key={message.id} message={message} />
							))}
						</div>
					)}
				</ConversationContent>
			</Conversation>

			{/* Input Area */}
			<div className="h-min rounded-none">
				<PromptInput
					onSubmit={(e) => {
						e.preventDefault();
						handleSend();
					}}
				>
					<PromptInputTextarea
						disabled={isLoading || isRateLimited}
						onChange={(e) => setInputValue(e.target.value)}
						placeholder={
							isLoading
								? 'Analyzing...'
								: isRateLimited
									? 'Rate limited - please wait...'
									: 'Ask about your analytics data...'
						}
						ref={inputRef}
						value={inputValue}
					/>
					<PromptInputToolbar>
						<div />
						<PromptInputSubmit
							disabled={!inputValue.trim() || isLoading || isRateLimited}
							status={isLoading ? 'submitted' : undefined}
						/>
					</PromptInputToolbar>
				</PromptInput>
			</div>
		</div>
	);
}
