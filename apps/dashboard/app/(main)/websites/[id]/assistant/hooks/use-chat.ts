import type { StreamingUpdate } from '@databuddy/shared';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import {
	inputValueAtom,
	isLoadingAtom,
	messagesAtom,
	modelAtom,
	scrollAreaRefAtom,
	websiteDataAtom,
	websiteIdAtom,
} from '@/stores/jotai/assistantAtoms';
import type { Message } from '../types/message';

function generateWelcomeMessage(websiteName?: string): string {
	const examples = [
		'Show me page views over the last 7 days',
		'How many visitors did I have yesterday?',
		'What are my top traffic sources?',
		"What's my current bounce rate?",
		'How is my mobile vs desktop traffic?',
		'Show me traffic by country',
	];

	return `Hello! I'm Databunny, your data analyst for ${websiteName || 'your website'}. I can help you understand your data with charts, single metrics, or detailed answers. Try asking me questions like:\n\n${examples.map((prompt: string) => `• "${prompt}"`).join('\n')}\n\nI'll automatically choose the best way to present your data - whether it's a chart, a single number, or a detailed explanation.`;
}

export type Vote = 'upvote' | 'downvote';

export function useChat() {
	const [model] = useAtom(modelAtom);
	const [websiteId] = useAtom(websiteIdAtom);
	const [websiteData] = useAtom(websiteDataAtom);
	const [messages, setMessages] = useAtom(messagesAtom);
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
	const [scrollAreaRef] = useAtom(scrollAreaRefAtom);
	const [conversationId, setConversationId] = useState<string>();

	// Validate required fields
	if (!websiteId) {
		throw new Error('Website ID is required');
	}

	const addFeedback = trpc.assistant.addFeedback.useMutation({
		onError: (error) => {
			toast.error(
				error.message || 'Failed to submit feedback. Please try again.'
			);
		},
	});

	// Initialize with welcome message if no messages exist
	useEffect(() => {
		if (messages.length === 0 && websiteData?.name) {
			const welcomeMessage: Message = {
				id: '1',
				type: 'assistant',
				content: generateWelcomeMessage(websiteData.name),
				timestamp: new Date(),
			};
			setMessages([welcomeMessage]);
		}
	}, [websiteData?.name, messages.length, setMessages]);

	const scrollToBottom = useCallback(() => {
		setTimeout(() => {
			if (scrollAreaRef?.current) {
				const scrollContainer = scrollAreaRef.current.querySelector(
					'[data-radix-scroll-area-viewport]'
				);
				if (scrollContainer) {
					scrollContainer.scrollTop = scrollContainer.scrollHeight;
				}
			}
		}, 50);
	}, [scrollAreaRef]);

	useEffect(() => {
		scrollToBottom();
	}, [scrollToBottom]);

	const updateAiMessage = useCallback(
		(message: Message) => {
			setMessages((prev) => {
				const newMessages = [...prev];
				newMessages[newMessages.length - 1] = message;
				return newMessages;
			});
		},
		[setMessages]
	);

	const processStreamingUpdate = useCallback(
		(update: StreamingUpdate, assistantMessage: Message): Message => {
			switch (update.type) {
				case 'thinking': {
					return {
						...assistantMessage,
						thinkingSteps: [
							...(assistantMessage.thinkingSteps || []),
							update.content,
						],
					};
				}
				case 'progress': {
					const updatedMessage = {
						...assistantMessage,
						content: update.content,
						hasVisualization: update.data?.hasVisualization,
						chartType: update.data?.chartType as Message['chartType'],
						data: update.data?.data,
						responseType: update.data?.responseType,
						metricValue: update.data?.metricValue,
						metricLabel: update.data?.metricLabel,
					};
					scrollToBottom();
					return updatedMessage;
				}
				case 'complete': {
					const completedMessage = {
						...assistantMessage,
						type: 'assistant' as const,
						content: update.content,
						timestamp: new Date(),
						hasVisualization: update.data?.hasVisualization,
						chartType: update.data?.chartType as Message['chartType'],
						data: update.data?.data,
						responseType: update.data?.responseType,
						metricValue: update.data?.metricValue,
						metricLabel: update.data?.metricLabel,
						debugInfo: update.debugInfo,
					};
					scrollToBottom();
					return completedMessage;
				}
				case 'error': {
					return {
						...assistantMessage,
						content: update.content,
						debugInfo: update.debugInfo,
					};
				}
				case 'metadata': {
					setConversationId(update.data.conversationId);
					return {
						...assistantMessage,
						id: update.data.messageId,
					};
				}
				default: {
					return assistantMessage;
				}
			}
		},
		[scrollToBottom]
	);

	const readStreamChunk = useCallback(
		async (
			reader: ReadableStreamDefaultReader<Uint8Array>,
			assistantMessage: Message
		): Promise<Message> => {
			const { done, value } = await reader.read();

			if (done) {
				return assistantMessage;
			}

			const chunk = new TextDecoder().decode(value);
			const lines = chunk.split('\n');
			let updatedMessage = assistantMessage;

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					try {
						const update: StreamingUpdate = JSON.parse(line.slice(6));
						updatedMessage = processStreamingUpdate(update, updatedMessage);
						updateAiMessage(updatedMessage);
					} catch {
						console.warn('Failed to parse SSE data:', line);
					}
				}
			}

			return readStreamChunk(reader, updatedMessage);
		},
		[processStreamingUpdate, updateAiMessage]
	);

	const processStreamReader = useCallback(
		async (
			reader: ReadableStreamDefaultReader<Uint8Array>,
			initialAssistantMessage: Message
		) => {
			try {
				return await readStreamChunk(reader, initialAssistantMessage);
			} finally {
				reader.releaseLock();
			}
		},
		[readStreamChunk]
	);

	const sendMessage = useCallback(
		async (content?: string) => {
			const messageContent = content || inputValue.trim();
			if (!messageContent || isLoading) {
				return;
			}

			const userMessage: Message = {
				id: Date.now().toString(),
				type: 'user',
				content: messageContent,
				timestamp: new Date(),
			};

			setMessages((prev) => [...prev, userMessage]);
			setInputValue('');
			setIsLoading(true);

			let assistantMessage: Message = {
				id: '',
				type: 'assistant',
				content: '',
				timestamp: new Date(),
				hasVisualization: false,
				thinkingSteps: [],
			};

			setMessages((prev) => [...prev, assistantMessage]);

			try {
				// Stream the AI response using the new single endpoint
				const response = await fetch(
					`${process.env.NEXT_PUBLIC_API_URL}/v1/assistant/stream`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-Website-Id': websiteId,
						},
						credentials: 'include',
						body: JSON.stringify({
							messages: [...messages, userMessage].map((message) => ({
								role: message.type,
								content: message.content,
							})),
							websiteId,
							conversationId,
							model,
						}),
					}
				);

				if (!response.ok) {
					throw new Error('Failed to start stream');
				}

				const reader = response.body?.getReader();
				if (!reader) {
					throw new Error('No response stream available');
				}

				await processStreamReader(reader, assistantMessage);
			} catch (error) {
				console.error('Failed to get AI response:', error);
				assistantMessage = {
					...assistantMessage,
					content:
						"I apologize, but I'm having trouble processing your request right now. Please try again in a moment.",
				};
			} finally {
				setIsLoading(false);
			}
		},
		[
			inputValue,
			isLoading,
			websiteId,
			messages,
			conversationId,
			model,
			processStreamReader,
			setInputValue,
			setIsLoading,
			setMessages,
		]
	);

	const handleKeyPress = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			}
		},
		[sendMessage]
	);

	const resetChat = useCallback(() => {
		// Create new welcome message
		const welcomeMessage: Message = {
			id: '1',
			type: 'assistant',
			content: generateWelcomeMessage(websiteData?.name || ''),
			timestamp: new Date(),
		};

		setMessages([welcomeMessage]);
		setInputValue('');
		setIsLoading(false);
		setConversationId(undefined);
	}, [websiteData?.name, setMessages, setInputValue, setIsLoading]);

	const handleVote = useCallback(
		(messageId: string, type: Vote) => {
			addFeedback.mutate({ messageId, type });
		},
		[addFeedback]
	);

	const handleFeedbackComment = useCallback(
		(messageId: string, comment: string) => {
			addFeedback.mutate(
				{ messageId, comment },
				{
					onSuccess: () => {
						toast.success('Feedback submitted');
					},
					onError: () => {
						toast.error('Failed to submit feedback');
					},
				}
			);
		},
		[addFeedback]
	);

	return {
		messages,
		inputValue,
		setInputValue,
		isLoading,
		scrollAreaRef,
		sendMessage,
		handleKeyPress,
		resetChat,
		scrollToBottom,
		handleVote,
		handleFeedbackComment,
	};
}
