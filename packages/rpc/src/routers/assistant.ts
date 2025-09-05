import { assistantConversations, assistantMessages, db } from '@databuddy/db';
import { createId } from '@databuddy/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const messageSchema = z.object({
	messageId: z.string().optional(),
	conversationId: z.string(),
	role: z.enum(['user', 'assistant']),
	content: z.string().optional(),
	modelType: z.string(),
	sql: z.string().optional(),
	chartType: z.string().optional(),
	responseType: z.string().optional(),
	textResponse: z.string().optional(),
	thinkingSteps: z.array(z.string()).optional(),
	errorMessage: z.string().optional(),
	hasError: z.boolean().optional(),
	finalResult: z.record(z.string(), z.unknown()).optional(),
});

export const assistantRouter = createTRPCRouter({
	// Save a conversation (creates conversation + message)
	saveConversation: protectedProcedure
		.input(
			z.object({
				conversationId: z.string().optional(),
				websiteId: z.string(),
				title: z.string(),
				messages: z.array(messageSchema.omit({ conversationId: true })),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const conversationId = input.conversationId || createId();

			await db.transaction(async (tx) => {
				// Insert conversation
				await tx.insert(assistantConversations).values({
					id: conversationId,
					userId: ctx.user.id,
					websiteId: input.websiteId,
					title: input.title,
				});

				// Insert all messages in a single batch operation
				const messagesToInsert = input.messages.map((message) => ({
					id: message.messageId || createId(),
					conversationId,
					role: message.role,
					content: message.content,
					modelType: message.modelType,
					hasError: message.hasError,
					errorMessage: message.errorMessage,
					sql: message.sql,
					chartType: message.chartType,
					responseType: message.responseType,
					textResponse: message.textResponse,
					thinkingSteps: message.thinkingSteps,
				}));

				await tx.insert(assistantMessages).values(messagesToInsert);
			});

			return { conversationId };
		}),

	// Add message to existing conversation
	addMessage: protectedProcedure
		.input(z.array(messageSchema))
		.mutation(async ({ ctx, input }) => {
			const conversationId = input[0].conversationId;
			// Verify conversation exists and user has access
			const conversation = await db
				.select()
				.from(assistantConversations)
				.where(
					and(
						eq(assistantConversations.id, conversationId),
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

			const messagesToInsert = input.map((message) => ({
				id: message.messageId || createId(),
				conversationId: message.conversationId,
				role: message.role,
				content: message.content,
				modelType: message.modelType,
				hasError: message.hasError,
				errorMessage: message.errorMessage,
				sql: message.sql,
				chartType: message.chartType,
				responseType: message.responseType,
				textResponse: message.textResponse,
				thinkingSteps: message.thinkingSteps,
			}));

			await db.transaction(async (tx) => {
				// Insert message
				await tx.insert(assistantMessages).values(messagesToInsert);

				// Update conversation timestamp
				await tx
					.update(assistantConversations)
					.set({ updatedAt: new Date().toISOString() })
					.where(eq(assistantConversations.id, conversationId));
			});

			return { messageIds: messagesToInsert.map((message) => message.id) };
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
			z
				.object({
					messageId: z.string(),
					type: z.enum(['upvote', 'downvote']).optional(),
					comment: z.string().optional(),
				})
				.refine((v) => v.type || v.comment, {
					message: 'Either type or comment must be provided',
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
			} else if (input.type === 'downvote') {
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
			const _result = await db
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
