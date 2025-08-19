import {
	type AssistantMessageInput,
	assistantConversations,
	assistantMessages,
	db,
} from '@databuddy/db';
import { eq } from 'drizzle-orm';

export function createNewConversation(
	conversationId: string,
	websiteId: string,
	userId: string,
	title: string,
	modelType: string,
	messages: AssistantMessageInput[]
) {
	const messagesToInsert = messages.map((message) => ({
		...message,
		modelType,
		conversationId,
	}));

	db.transaction(async (tx) => {
		await tx.insert(assistantConversations).values({
			id: conversationId,
			userId,
			websiteId,
			title,
		});

		await tx.insert(assistantMessages).values(messagesToInsert);
	});
}

export function addMessageToConversation(
	conversationId: string,
	modelType: string,
	messages: AssistantMessageInput[]
) {
	const messagesToInsert = messages.map((message) => ({
		...message,
		conversationId,
		modelType,
	}));

	db.transaction(async (tx) => {
		await tx.insert(assistantMessages).values(messagesToInsert);

		await tx
			.update(assistantConversations)
			.set({ updatedAt: new Date().toISOString() })
			.where(eq(assistantConversations.id, conversationId));
	});
}
