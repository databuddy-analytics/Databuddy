'use server';

import {
	type Chat,
	chats,
	type DBMessage,
	db,
	messages,
	votes,
} from '@databuddy/db';
import {
	and,
	asc,
	desc,
	eq,
	gt,
	gte,
	ilike,
	inArray,
	lt,
	type SQL,
} from 'drizzle-orm';

export async function saveChat({
	id,
	userId,
	title,
	websiteId,
}: {
	id: string;
	userId: string;
	title: string;
	websiteId: string;
}) {
	try {
		return await db.insert(chats).values({
			id,
			createdAt: new Date(),
			updatedAt: new Date(),
			userId,
			websiteId,
			title,
		});
	} catch (_error) {
		throw new Error('Failed to save chat');
	}
}

export async function deleteChatById({ id }: { id: string }) {
	try {
		await db.delete(votes).where(eq(votes.chatId, id));
		await db.delete(messages).where(eq(messages.chatId, id));

		const [chatsDeleted] = await db
			.delete(chats)
			.where(eq(chats.id, id))
			.returning();
		return chatsDeleted;
	} catch (_error) {
		throw new Error('Failed to delete chat by id');
	}
}

export async function getChatsbyWebsiteId({
	userId,
	websiteId,
	limit,
	startingAfter,
	endingBefore,
	search,
}: {
	userId: string;
	websiteId: string;
	limit: number;
	startingAfter: string | null;
	endingBefore: string | null;
	search?: string | null;
}) {
	try {
		const extendedLimit = limit + 1;

		const query = (whereCondition?: SQL<any>) => {
			const baseConditions = [
				eq(chats.userId, userId),
				eq(chats.websiteId, websiteId),
			];

			if (search) {
				baseConditions.push(ilike(chats.title, `%${search}%`));
			}

			const allConditions = whereCondition
				? and(...baseConditions, whereCondition)
				: and(...baseConditions);

			return db
				.select()
				.from(chats)
				.where(allConditions)
				.orderBy(desc(chats.createdAt))
				.limit(extendedLimit);
		};

		let filteredChats: Chat[] = [];

		if (startingAfter) {
			const [selectedChat] = await db
				.select()
				.from(chats)
				.where(and(eq(chats.id, startingAfter), eq(chats.websiteId, websiteId)))
				.limit(1);

			if (!selectedChat) {
				throw new Error(`Chat with id ${startingAfter} not found`);
			}

			filteredChats = await query(gt(chats.createdAt, selectedChat.createdAt));
		} else if (endingBefore) {
			const [selectedChat] = await db
				.select()
				.from(chats)
				.where(and(eq(chats.id, endingBefore), eq(chats.websiteId, websiteId)))
				.limit(1);

			if (!selectedChat) {
				throw new Error(`Chat with id ${endingBefore} not found`);
			}

			filteredChats = await query(lt(chats.createdAt, selectedChat.createdAt));
		} else {
			filteredChats = await query();
		}

		const hasMore = filteredChats.length > limit;

		return {
			chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
			hasMore,
		};
	} catch (_error) {
		throw new Error('Failed to get chats by user id');
	}
}

export async function getChatById({ id }: { id: string }) {
	try {
		const [selectedChat] = await db
			.select()
			.from(chats)
			.where(eq(chats.id, id));
		if (!selectedChat) {
			return null;
		}

		return selectedChat;
	} catch (_error) {
		throw new Error('Failed to get chat by id');
	}
}

export async function saveMessages({
	messages: items,
}: {
	messages: DBMessage[];
}) {
	try {
		return await db.insert(messages).values(items);
	} catch (_error) {
		throw new Error('Failed to save messages');
	}
}

export async function getMessagesByChatId({ id }: { id: string }) {
	try {
		return await db
			.select()
			.from(messages)
			.where(eq(messages.chatId, id))
			.orderBy(asc(messages.createdAt));
	} catch (_error) {
		throw new Error('Failed to get messages by chat id');
	}
}

export async function voteMessage({
	chatId,
	messageId,
	type,
}: {
	chatId: string;
	messageId: string;
	type: 'up' | 'down';
}) {
	try {
		const [existingVote] = await db
			.select()
			.from(votes)
			.where(and(eq(votes.messageId, messageId)));

		if (existingVote) {
			return await db
				.update(votes)
				.set({ isUpvoted: type === 'up' })
				.where(and(eq(votes.messageId, messageId), eq(votes.chatId, chatId)));
		}
		return await db.insert(votes).values({
			chatId,
			messageId,
			isUpvoted: type === 'up',
		});
	} catch (_error) {
		throw new Error('Failed to vote message');
	}
}

export async function getVotesByChatId({ id }: { id: string }) {
	try {
		return await db.select().from(votes).where(eq(votes.chatId, id));
	} catch (_error) {
		throw new Error('Failed to get votes by chat id');
	}
}

export async function updateChatTitleById({
	chatId,
	title,
}: {
	chatId: string;
	title: string;
}) {
	try {
		return await db
			.update(chats)
			.set({
				title,
				updatedAt: new Date(),
			})
			.where(eq(chats.id, chatId));
	} catch (_error) {
		throw new Error('Failed to update chat title in database');
	}
}

export async function getMessageById({ id }: { id: string }) {
	try {
		return await db.select().from(messages).where(eq(messages.id, id));
	} catch (_error) {
		throw new Error('Failed to get message by id');
	}
}

export async function deleteMessagesByChatIdAfterTimestamp({
	chatId,
	timestamp,
}: {
	chatId: string;
	timestamp: Date;
}) {
	try {
		const messagesToDelete = await db
			.select({ id: messages.id })
			.from(messages)
			.where(
				and(eq(messages.chatId, chatId), gte(messages.createdAt, timestamp))
			);

		const messageIds = messagesToDelete.map((message) => message.id);

		if (messageIds.length > 0) {
			await db
				.delete(votes)
				.where(
					and(eq(votes.chatId, chatId), inArray(votes.messageId, messageIds))
				);

			return await db
				.delete(messages)
				.where(
					and(eq(messages.chatId, chatId), inArray(messages.id, messageIds))
				);
		}
	} catch (_error) {
		throw new Error('Failed to delete messages by chat id after timestamp');
	}
}
