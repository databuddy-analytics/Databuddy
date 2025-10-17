'use client';

import { useChat } from '@ai-sdk-tools/store';
import { generateUUID } from '@databuddy/ai/lib/utils';
import type { ChatMessage } from '@databuddy/ai/types';
import { DefaultChatTransport } from 'ai';
import { notFound } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Canvas } from './canvas';
import { ChatHeader } from './chat-header';
import { ChatInput } from './chat-input';
import { Messages } from './messages';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const Chat = ({
	id,
	websiteId,
	initialMessages,
	initialChatModel,
}: {
	id: string;
	websiteId: string;
	initialMessages: ChatMessage[];
	initialChatModel: string;
}) => {
	const [currentModelId, setCurrentModelId] = useState(initialChatModel);
	const currentModelIdRef = useRef(currentModelId);

	// Fetch votes for the current chat
	const { data: votes = [] } = trpc.assistant.getVotes.useQuery(
		{ chatId: id },
		{ enabled: !!id }
	);

	useChat<ChatMessage>({
		id,
		messages: initialMessages,
		generateId: generateUUID,
		// enableBatching: true,
		experimental_throttle: 100,
		transport: new DefaultChatTransport({
			api: `${API_BASE_URL}/v1/assistant`,
			prepareSendMessagesRequest({ messages, id, body }) {
				return {
					credentials: 'include',
					body: {
						id,
						message: messages.at(-1),
						selectedChatModel: currentModelIdRef.current,
						websiteId,
						...body,
					},
				};
			},
		}),
	});

	useEffect(() => {
		currentModelIdRef.current = currentModelId;
	}, [currentModelId]);

	if (!websiteId) {
		return notFound();
	}

	return (
		<div className="flex size-full items-center justify-center gap-2 divide-x divide-border">
			<div
				className={cn(
					'relative flex size-full flex-col rounded-2xl border border-border transition-all duration-300 ease-in-out'
				)}
			>
				<ChatHeader chatId={id} websiteId={websiteId} />

				<div className="relative flex h-full flex-1 flex-col overflow-y-auto px-6 pb-6">
					<Messages
						chatId={id}
						isReadonly={false}
						votes={votes}
					/>

					<ChatInput
						chatId={id}
						onModelChange={setCurrentModelId}
						selectedModelId={currentModelId}
						websiteId={websiteId}
					/>
				</div>
			</div>

			<Canvas websiteId={websiteId} />
		</div>
	);
};

export default Chat;
