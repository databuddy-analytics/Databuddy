
import type { Vote } from '@databuddy/db';
import equal from 'fast-deep-equal';
import { memo } from 'react';
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { ChatGreeting } from './chat-greeting';
import { PreviewMessage } from './message';
import { ThinkingMessage } from './message/thinking-message';
import { useChatMessages, useChatStatus } from '@ai-sdk-tools/store';
import { ChatMessage } from '@databuddy/ai/types';

interface MessagesProps {
	chatId: string;
	votes: Vote[] | undefined;
	isReadonly: boolean;
}

function PureMessages({
	chatId,
	votes,
	isReadonly,
}: MessagesProps) {
	const messages = useChatMessages<ChatMessage>();
	const status = useChatStatus();

	return (
		<div className="flex flex-1 overflow-y-auto">
			<Conversation className="mx-auto flex min-w-0 flex-col gap-4 md:gap-6">
				<ConversationContent className="flex h-full flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
					{messages.length === 0 && <ChatGreeting />}

					{messages.map((message, index) => (
						<PreviewMessage
							chatId={chatId}
							isLoading={
								status === 'streaming' && messages.length - 1 === index
							}
							isReadonly={isReadonly}
							message={message}
							key={message.id}
							vote={
								votes
									? votes.find((vote) => vote.messageId === message.id)
									: undefined
							}
						/>
					))}

					{status === 'submitted' &&
						messages.length > 0 && <ThinkingMessage />}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>
		</div>
	);
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
	if (!equal(prevProps.votes, nextProps.votes)) {
		return false;
	}

	return false;
});
