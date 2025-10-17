import { getChatById, getMessagesByChatId } from '@databuddy/ai/lib/queries';
import { convertToUIMessages } from '@databuddy/ai/lib/utils';
import { DEFAULT_CHAT_MODEL } from '@databuddy/ai/models';
import { auth } from '@databuddy/auth';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import Chat from '../_components/chat';
import { ChatSkeleton } from '../_components/chat-skeleton';

const getSession = cache(async () => {
	const session = await auth.api.getSession({ headers: await headers() });
	return session;
});

export default async function ChatPage(props: {
	params: Promise<{ id: string; chatId: string }>;
}) {
	const params = await props.params;
	const { id: websiteId, chatId } = params;
	const chat = await getChatById({ id: chatId });
	const session = await getSession();

	if (!chat) {
		notFound();
	}

	if (session?.user?.id !== chat.userId) {
		notFound();
	}

	const messagesFromDb = await getMessagesByChatId({
		id: chatId,
	});

	const uiMessages = convertToUIMessages(messagesFromDb);

	const cookieStore = await cookies();
	const chatModelFromCookie = cookieStore.get('chat-model');

	if (!chatModelFromCookie) {
		return (
			<Suspense fallback={<ChatSkeleton />}>
				<Chat
					id={chatId}
					initialChatModel={DEFAULT_CHAT_MODEL}
					initialMessages={uiMessages}
					websiteId={websiteId}
				/>
			</Suspense>
		);
	}

	return (
		<Suspense fallback={<ChatSkeleton />}>
			<Chat
				id={chatId}
				initialChatModel={chatModelFromCookie.value}
				initialMessages={uiMessages}
				websiteId={websiteId}
			/>
		</Suspense>
	);
}
