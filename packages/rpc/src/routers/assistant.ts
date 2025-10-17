import {
	deleteChatById,
	getChatById,
	getChatsbyWebsiteId,
	getVotesByChatId,
	updateChatTitleById,
	voteMessage,
} from '@databuddy/ai/lib/queries';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const assistantRouter = createTRPCRouter({
	getHistory: protectedProcedure
		.input(
			z.object({
				websiteId: z.string(),
				limit: z.number().default(10),
				startingAfter: z.string().optional(),
				endingBefore: z.string().optional(),
				search: z.string().optional(),
			})
		)
		.query(async ({ ctx, input }) => {
			if (input.startingAfter && input.endingBefore) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message:
						'Starting after and ending before cannot be provided together',
				});
			}

			const chats = await getChatsbyWebsiteId({
				userId: ctx.user.id,
				websiteId: input.websiteId,
				limit: input.limit,
				startingAfter: input.startingAfter,
				endingBefore: input.endingBefore,
				search: input.search,
			});

			return chats;
		}),

	// Get chat with messages
	getChat: protectedProcedure
		.input(z.object({ chatId: z.string() }))
		.query(async ({ ctx, input }) => {
			const chat = await getChatById({
				id: input.chatId,
			});

			if (!chat) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Chat not found',
				});
			}

			if (chat.userId !== ctx.user.id) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'You are not allowed to access this chat',
				});
			}

			return chat;
		}),

	getVotes: protectedProcedure
		.input(z.object({ chatId: z.string() }))
		.query(async ({ ctx, input }) => {
			const chat = await getChatById({
				id: input.chatId,
			});

			if (!chat) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Chat not found',
				});
			}

			if (chat.userId !== ctx.user.id) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'You are not allowed to get votes for this chat',
				});
			}

			const votes = await getVotesByChatId({ id: input.chatId });

			return votes;
		}),

	// Add feedback to message
	voteMessage: protectedProcedure
		.input(
			z
				.object({
					chatId: z.string(),
					messageId: z.string(),
					type: z.enum(['up', 'down']).optional(),
				})
				.refine((v) => v.type, {
					message: 'Type must be provided',
				})
		)
		.mutation(async ({ ctx, input }) => {
			const chat = await getChatById({
				id: input.chatId,
			});

			if (!chat) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Chat not found',
				});
			}

			if (chat.userId !== ctx.user.id) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'You are not allowed to add feedback to this chat',
				});
			}

			await voteMessage({
				chatId: input.chatId,
				messageId: input.messageId,
				type: input.type,
			});

			return { success: true };
		}),

	// Delete conversation
	deleteChat: protectedProcedure
		.input(z.object({ chatId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const chat = await getChatById({
				id: input.chatId,
			});

			if (!chat) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Chat not found',
				});
			}

			if (chat.userId !== ctx.user.id) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'You are not allowed to delete this chat',
				});
			}

			await deleteChatById({ id: input.chatId });

			return { success: true };
		}),

	// Update conversation title
	renameChat: protectedProcedure
		.input(
			z.object({
				chatId: z.string(),
				title: z.string().min(1).max(100),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const chat = await getChatById({
				id: input.chatId,
			});

			if (!chat) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Chat not found',
				});
			}

			if (chat.userId !== ctx.user.id) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'You are not allowed to update this chat',
				});
			}

			await updateChatTitleById({
				chatId: input.chatId,
				title: input.title,
			});

			return { success: true };
		}),
});
