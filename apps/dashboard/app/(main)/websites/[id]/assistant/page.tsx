import { generateUUID } from '@databuddy/ai/lib/utils';
import { DEFAULT_CHAT_MODEL } from '@databuddy/ai/models';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import Chat from './_components/chat';
import { ChatSkeleton } from './_components/chat-skeleton';

export default async function ChatPage(props: {
	params: Promise<{ id: string }>;
}) {
	const params = await props.params;
	const { id: websiteId } = params;
	const chatId = generateUUID();

	const cookieStore = await cookies();
	const modelIdFromCookie = cookieStore.get('chat-model');

	if (!modelIdFromCookie) {
		return (
			<Suspense fallback={<ChatSkeleton />}>
				<Chat
					id={chatId}
					initialChatModel={DEFAULT_CHAT_MODEL}
					initialMessages={[]}
					key={chatId}
					websiteId={websiteId}
				/>
			</Suspense>
		);
	}

	return (
		<Suspense fallback={<ChatSkeleton />}>
			<Chat
				id={chatId}
				initialChatModel={modelIdFromCookie.value}
				initialMessages={[]}
				key={chatId}
				websiteId={websiteId}
			/>
		</Suspense>
	);
}
