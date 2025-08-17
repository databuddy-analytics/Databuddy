import { assistantConversations, assistantMessages, db } from '@databuddy/db';
import { createId } from '@databuddy/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const assistantRouter = createTRPCRouter({
	// Save a conversation (creates conversation + message)
	saveConversation: protectedProcedure
		.input(
			z.object({
				websiteId: z.string(),
				title: z.string().optional(),
				userMessage: z.string(),
				modelType: z.string(),
				responseType: z.string(),
				finalResponse: z.string().optional(),
				sqlQuery: z.string().optional(),
				chartData: z.record(z.string(), z.unknown()).optional(),
				hasError: z.boolean().default(false),
				errorMessage: z.string().optional(),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const conversationId = createId();
			const messageId = createId();

			await db.transaction(async (tx) => {
				// Insert conversation
				await tx.insert(assistantConversations).values({
					id: conversationId,
					userId: ctx.user.id,
					websiteId: input.websiteId,
					title: input.title || `${input.userMessage.slice(0, 50)}...`,
				});

				// Insert message
				await tx.insert(assistantMessages).values({
					id: messageId,
					conversationId,
					userMessage: input.userMessage,
					modelType: input.modelType,
					responseType: input.responseType,
					finalResponse: input.finalResponse,
					sqlQuery: input.sqlQuery,
					chartData: input.chartData,
					hasError: input.hasError,
					errorMessage: input.errorMessage,
					upvotes: 0,
					downvotes: 0,
					feedbackComments: null,
				});
			});

			return { conversationId, messageId };
		}),

	// Add message to existing conversation
	addMessage: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				userMessage: z.string(),
				modelType: z.string(),
				responseType: z.string(),
				finalResponse: z.string().optional(),
				sqlQuery: z.string().optional(),
				chartData: z.record(z.string(), z.unknown()).optional(),
				hasError: z.boolean().default(false),
				errorMessage: z.string().optional(),
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Verify conversation exists and user has access
			const conversation = await db
				.select()
				.from(assistantConversations)
				.where(
					and(
						eq(assistantConversations.id, input.conversationId),
						eq(assistantConversations.userId, ctx.user.id)
					)
				)
				.limit(1);

			if (!conversation[0]) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Conversation not found or access denied',
				});
			}

			const messageId = createId();

			await db.transaction(async (tx) => {
				// Insert message
				await tx.insert(assistantMessages).values({
					id: messageId,
					conversationId: input.conversationId,
					userMessage: input.userMessage,
					modelType: input.modelType,
					responseType: input.responseType,
					finalResponse: input.finalResponse,
					sqlQuery: input.sqlQuery,
					chartData: input.chartData,
					hasError: input.hasError,
					errorMessage: input.errorMessage,
					upvotes: 0,
					downvotes: 0,
					feedbackComments: null,
				});

				// Update conversation timestamp
				await tx
					.update(assistantConversations)
					.set({ updatedAt: new Date().toISOString() })
					.where(eq(assistantConversations.id, input.conversationId));
			});

			return { messageId };
		}),

	// Get user's conversations
	getConversations: protectedProcedure
		.input(
			z.object({
				websiteId: z.string().optional(),
				limit: z.number().default(20),
				offset: z.number().default(0),
			})
		)
		.query(async ({ ctx, input }) => {
			const conversations = await db
				.select()
				.from(assistantConversations)
				.where(
					input.websiteId
						? and(
								eq(assistantConversations.userId, ctx.user.id),
								eq(assistantConversations.websiteId, input.websiteId)
							)
						: eq(assistantConversations.userId, ctx.user.id)
				)
				.orderBy(desc(assistantConversations.updatedAt))
				.limit(input.limit)
				.offset(input.offset);

			return conversations;
		}),

	// Get conversation with messages
	getConversation: protectedProcedure
		.input(z.object({ conversationId: z.string() }))
		.query(async ({ ctx, input }) => {
			const conversation = await db
				.select()
				.from(assistantConversations)
				.where(
					and(
						eq(assistantConversations.id, input.conversationId),
						eq(assistantConversations.userId, ctx.user.id)
					)
				)
				.limit(1);

			if (!conversation[0]) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Conversation not found',
				});
			}

			const messages = await db
				.select()
				.from(assistantMessages)
				.where(eq(assistantMessages.conversationId, input.conversationId))
				.orderBy(asc(assistantMessages.createdAt));

			return {
				conversation: conversation[0],
				messages,
			};
		}),

	// Add feedback to message
	addFeedback: protectedProcedure
		.input(
			z.object({
				messageId: z.string(),
				type: z.enum(['upvote', 'downvote']),
				comment: z.string().optional(),
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Get message with conversation to verify user access
			const result = await db
				.select({
					message: assistantMessages,
					conversation: assistantConversations,
				})
				.from(assistantMessages)
				.innerJoin(
					assistantConversations,
					eq(assistantMessages.conversationId, assistantConversations.id)
				)
				.where(
					and(
						eq(assistantMessages.id, input.messageId),
						eq(assistantConversations.userId, ctx.user.id)
					)
				)
				.limit(1);

			if (!result[0]) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Message not found or access denied',
				});
			}

			const { message } = result[0];

			// Update vote counts
			const updates: Partial<typeof assistantMessages.$inferInsert> = {};
			if (input.type === 'upvote') {
				updates.upvotes = message.upvotes + 1;
			} else {
				updates.downvotes = message.downvotes + 1;
			}

			// Add comment if provided
			if (input.comment) {
				const existingComments =
					(message.feedbackComments as Array<{
						userId: string;
						comment: string;
						timestamp: string;
					}>) || [];
				updates.feedbackComments = [
					...existingComments,
					{
						userId: ctx.user.id,
						comment: input.comment,
						timestamp: new Date().toISOString(),
					},
				];
			}

			await db
				.update(assistantMessages)
				.set(updates)
				.where(eq(assistantMessages.id, input.messageId));

			return { success: true };
		}),

	// Delete conversation
	deleteConversation: protectedProcedure
		.input(z.object({ conversationId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const result = await db
				.delete(assistantConversations)
				.where(
					and(
						eq(assistantConversations.id, input.conversationId),
						eq(assistantConversations.userId, ctx.user.id)
					)
				);

			return { success: true };
		}),

	// Update conversation title
	updateConversationTitle: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				title: z.string().min(1).max(100),
			})
		)
		.mutation(async ({ ctx, input }) => {
			await db
				.update(assistantConversations)
				.set({
					title: input.title,
					updatedAt: new Date().toISOString(),
				})
				.where(
					and(
						eq(assistantConversations.id, input.conversationId),
						eq(assistantConversations.userId, ctx.user.id)
					)
				);

			return { success: true };
		}),
});
