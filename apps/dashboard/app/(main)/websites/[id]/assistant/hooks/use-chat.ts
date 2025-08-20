import type { StreamingUpdate } from '@databuddy/shared';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
	inputValueAtom,
	isLoadingAtom,
	isRateLimitedAtom,
	messagesAtom,
	modelAtom,
	scrollAreaRefAtom,
	websiteDataAtom,
	websiteIdAtom,
} from '@/stores/jotai/assistantAtoms';
import { getChatDB } from '../lib/chat-db';
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

export function useChat() {
	const [model] = useAtom(modelAtom);
	const [websiteId] = useAtom(websiteIdAtom);
	const [websiteData] = useAtom(websiteDataAtom);
	const [messages, setMessages] = useAtom(messagesAtom);
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
	const [isRateLimited, setIsRateLimited] = useAtom(isRateLimitedAtom);
	const [scrollAreaRef] = useAtom(scrollAreaRefAtom);
	const rateLimitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const chatDB = getChatDB();
	const [conversationId, setConversationId] = useState<string>();

	useEffect(() => {
		let isMounted = true;

		const initializeChat = async () => {
			try {
				const existingMessages = await chatDB.getMessages(websiteId || '');

				if (isMounted) {
					if (existingMessages.length === 0) {
						// No existing chat, create welcome message
						const welcomeMessage: Message = {
							id: '1',
							type: 'assistant',
							content: generateWelcomeMessage(websiteData?.name || ''),
							timestamp: new Date(),
						};

						// Save welcome message to IndexedDB and set in state
						await chatDB.saveMessage(welcomeMessage, websiteId || '');
						setMessages([welcomeMessage]);
					} else {
						// Load existing messages
						setMessages(existingMessages);
					}

					// Update chat metadata
					await chatDB.createOrUpdateChat(
						websiteId || '',
						websiteData?.name || ''
					);
				}
			} catch (error) {
				console.error('Failed to initialize chat from IndexedDB:', error);

				// Fallback to welcome message in memory only
				if (isMounted) {
					const welcomeMessage: Message = {
						id: '1',
						type: 'assistant',
						content: generateWelcomeMessage(websiteData?.name || ''),
						timestamp: new Date(),
					};
					setMessages([welcomeMessage]);
				}
			}
		};

		initializeChat();

		return () => {
			isMounted = false;
		};
	}, [websiteId, websiteData?.name, chatDB, setMessages]);

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

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (rateLimitTimeoutRef.current) {
				clearTimeout(rateLimitTimeoutRef.current);
			}
		};
	}, []);

	const sendMessage = useCallback(
		async (content?: string) => {
			const messageContent = content || inputValue.trim();
			if (!messageContent || isLoading || isRateLimited) {
				return;
			}

			const userMessage: Message = {
				id: Date.now().toString(),
				type: 'user',
				content: messageContent,
				timestamp: new Date(),
			};

			// Save user message to IndexedDB immediately
			try {
				await chatDB.saveMessage(userMessage, websiteId || '');
			} catch (error) {
				console.error('Failed to save user message to IndexedDB:', error);
			}

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

			try {
				// Stream the AI response using the new single endpoint
				const response = await fetch(
					`${process.env.NEXT_PUBLIC_API_URL}/v1/assistant/stream`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-Website-Id': websiteId || '',
						},
						credentials: 'include',
						body: JSON.stringify({
							messages: [...messages, userMessage].map(({ type, content }) => ({
								role: type,
								content,
							})),
							websiteId: websiteId || '',
							conversationId,
							model,
						}),
					}
				);

				if (!response.ok) {
					// Handle rate limit specifically
					if (response.status === 429) {
						const errorData = await response.json();
						if (errorData.code === 'RATE_LIMIT_EXCEEDED') {
							assistantMessage = {
								...assistantMessage,
								content:
									"⏱️ You've reached the rate limit. Please wait 60 seconds before sending another message.",
							};

							setIsLoading(false);
							setIsRateLimited(true);

							// Clear any existing timeout
							if (rateLimitTimeoutRef.current) {
								clearTimeout(rateLimitTimeoutRef.current);
							}

							// Set a 60-second timeout to re-enable messaging
							rateLimitTimeoutRef.current = setTimeout(() => {
								setIsRateLimited(false);
							}, 60_000);

							return;
						}
					}
					throw new Error('Failed to start stream');
				}

				const reader = response.body?.getReader();
				if (!reader) {
					throw new Error('No response stream available');
				}

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							break;
						}

						const chunk = new TextDecoder().decode(value);
						const lines = chunk.split('\n');

						for (const line of lines) {
							if (line.startsWith('data: ')) {
								try {
									const update: StreamingUpdate = JSON.parse(line.slice(6));

									switch (update.type) {
										case 'thinking': {
											assistantMessage = {
												...assistantMessage,
												thinkingSteps: [
													...(assistantMessage.thinkingSteps || []),
													update.content,
												],
											};
											break;
										}
										case 'progress': {
											assistantMessage = {
												...assistantMessage,
												content: update.content,
												hasVisualization: update.data?.hasVisualization,
												chartType: update.data?.chartType as any,
												data: update.data?.data,
												responseType: update.data?.responseType,
												metricValue: update.data?.metricValue,
												metricLabel: update.data?.metricLabel,
											};
											scrollToBottom();
											break;
										}
										case 'complete': {
											assistantMessage = {
												...assistantMessage,
												type: 'assistant' as const,
												content: update.content,
												timestamp: new Date(),
												hasVisualization: update.data?.hasVisualization,
												chartType: update.data?.chartType as any,
												data: update.data?.data,
												responseType: update.data?.responseType,
												metricValue: update.data?.metricValue,
												metricLabel: update.data?.metricLabel,
												debugInfo: update.debugInfo,
											};

											// Save completed assistant message to IndexedDB
											try {
												await chatDB.saveMessage(
													assistantMessage,
													websiteId || ''
												);
											} catch (error) {
												console.error(
													'Failed to save Databunny message to IndexedDB:',
													error
												);
											}

											scrollToBottom();
											break;
										}
										case 'error': {
											assistantMessage = {
												...assistantMessage,
												content: update.content,
												debugInfo: update.debugInfo,
											};
											break;
										}
										case 'metadata': {
											assistantMessage = {
												...assistantMessage,
												id: update.data.messageId,
											};
											setConversationId(update.data.conversationId);
											break;
										}
										default: {
											break;
										}
									}
								} catch (_parseError) {
									console.warn('Failed to parse SSE data:', line);
								}
							}
						}
					}
				} finally {
					reader.releaseLock();
				}
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

			setMessages((prev) => [...prev, assistantMessage]);
		},
		[
			inputValue,
			isLoading,
			isRateLimited,
			websiteId,
			messages,
			scrollToBottom,
			chatDB,
			model,
			setInputValue,
			setIsLoading,
			setIsRateLimited,
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

	const resetChat = useCallback(async () => {
		try {
			// Clear messages from IndexedDB
			await chatDB.clearMessages(websiteId || '');

			setConversationId(undefined);

			// Create new welcome message
			const welcomeMessage: Message = {
				id: '1',
				type: 'assistant',
				content: generateWelcomeMessage(websiteData?.name || ''),
				timestamp: new Date(),
			};

			// Save welcome message to IndexedDB
			await chatDB.saveMessage(welcomeMessage, websiteId || '');

			// Update state
			setMessages([welcomeMessage]);
		} catch (error) {
			console.error('Failed to reset chat in IndexedDB:', error);

			// Fallback to memory-only reset
			const welcomeMessage: Message = {
				id: '1',
				type: 'assistant',
				content: generateWelcomeMessage(websiteData?.name || ''),
				timestamp: new Date(),
			};
			setMessages([welcomeMessage]);
		}

		setInputValue('');
		setIsRateLimited(false);
		setIsLoading(false);

		// Clear any existing timeout
		if (rateLimitTimeoutRef.current) {
			clearTimeout(rateLimitTimeoutRef.current);
		}
	}, [
		websiteData?.name,
		websiteId,
		chatDB,
		setMessages,
		setInputValue,
		setIsRateLimited,
		setIsLoading,
	]);

	return {
		messages,
		inputValue,
		setInputValue,
		isLoading,
		isRateLimited,
		scrollAreaRef,
		sendMessage,
		handleKeyPress,
		resetChat,
		scrollToBottom,
	};
}
