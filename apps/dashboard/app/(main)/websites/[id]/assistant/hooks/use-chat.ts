import type { StreamingUpdate } from '@databuddy/shared';
import { useAtom } from 'jotai';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import {
	inputValueAtom,
	isLoadingAtom,
	messagesAtom,
	modelAtom,
	websiteIdAtom,
} from '@/stores/jotai/assistantAtoms';
import type { Message } from '../types/message';

export type Vote = 'upvote' | 'downvote';

export function useChat() {
	const [model] = useAtom(modelAtom);
	const [websiteId] = useAtom(websiteIdAtom);
	const [messages, setMessages] = useAtom(messagesAtom);
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
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
		[]
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
		setMessages([]);
		setInputValue('');
		setIsLoading(false);
		setConversationId(undefined);
	}, [setInputValue, setIsLoading, setMessages]);

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
		sendMessage,
		handleKeyPress,
		resetChat,
		handleVote,
		handleFeedbackComment,
	};
}
