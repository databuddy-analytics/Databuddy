import {
	type AssistantMessageInput,
	assistantConversations,
	assistantMessages,
	db,
} from "@databuddy/db";
import { eq } from "drizzle-orm";

export async function createNewConversation(
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

	try {
		await db.transaction(async (tx) => {
			// First create the conversation
			await tx.insert(assistantConversations).values({
				id: conversationId,
				userId,
				websiteId,
				title,
			});

			// Then insert the messages
			if (messagesToInsert.length > 0) {
				await tx.insert(assistantMessages).values(messagesToInsert);
			}
		});
	} catch (error) {
		console.error("Failed to create conversation:", {
			conversationId,
			userId,
			websiteId,
			messageCount: messagesToInsert.length,
			error: error instanceof Error ? error.message : error,
		});
		throw error;
	}
}

export async function addMessageToConversation(
	conversationId: string,
	modelType: string,
	messages: AssistantMessageInput[]
) {
	const messagesToInsert = messages.map((message) => ({
		...message,
		conversationId,
		modelType,
	}));

	try {
		await db.transaction(async (tx) => {
			// Insert the messages
			if (messagesToInsert.length > 0) {
				await tx.insert(assistantMessages).values(messagesToInsert);
			}

			// Update the conversation timestamp
			await tx
				.update(assistantConversations)
				.set({ updatedAt: new Date().toISOString() })
				.where(eq(assistantConversations.id, conversationId));
		});
	} catch (error) {
		console.error("Failed to add messages to conversation:", {
			conversationId,
			messageCount: messagesToInsert.length,
			error: error instanceof Error ? error.message : error,
		});
		throw error;
	}
}
