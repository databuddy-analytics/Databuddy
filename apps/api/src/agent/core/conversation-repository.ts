import {
	type AssistantMessageInput,
	assistantConversations,
	assistantMessages,
	db,
} from '@databuddy/db';
import type { StreamingUpdate } from '@databuddy/shared';
import { createId } from '@databuddy/shared';
import { eq } from 'drizzle-orm';
import type { AssistantSession, SessionMetrics } from './assistant-session';
import type { AIResponseContent } from './response-processor';

/**
 * Repository for managing conversation persistence
 * Handles all database operations for conversations and messages
 */
export class ConversationRepository {
	async saveConversation(
		session: AssistantSession,
		aiResponse: AIResponseContent,
		aiMessageId: string,
		finalResult: StreamingUpdate,
		metrics: SessionMetrics
	): Promise<void> {
		const context = session.getContext();
		const messages = session.getMessages();
		const debugLogs = session.getDebugLogs();

		// Extract user ID safely
		const userId = context.user?.id;
		if (!userId) {
			throw new Error('User ID is required to save conversation');
		}

		const isNewConversation =
			messages.filter((m) => m.role === 'user').length === 1;

		try {
			const userMsg: AssistantMessageInput = {
				id: createId('NANOID'),
				conversationId: context.conversationId,
				role: 'user',
				content: messages.at(-1)?.content || '',
				modelType: context.model,
				sql: null,
				chartType: null,
				responseType: null,
				finalResult: null,
				textResponse: null,
				thinkingSteps: null,
				hasError: false,
				errorMessage: null,
				upvotes: 0,
				downvotes: 0,
				feedbackComments: null,
				aiResponseTime: null,
				totalProcessingTime: null,
				promptTokens: null,
				completionTokens: null,
				totalTokens: null,
				debugLogs: null,
				metadata: null,
			};

			const assistantMsg: AssistantMessageInput = {
				id: aiMessageId,
				conversationId: context.conversationId,
				role: 'assistant',
				content: finalResult.content,
				modelType: context.model,
				sql: aiResponse.sql ?? null,
				chartType: aiResponse.chart_type ?? null,
				responseType: aiResponse.response_type ?? null,
				finalResult,
				textResponse: aiResponse.text_response ?? null,
				thinkingSteps: aiResponse.thinking_steps ?? null,
				hasError: finalResult.type === 'error',
				errorMessage: finalResult.type === 'error' ? finalResult.content : null,
				aiResponseTime: metrics.aiResponseTime,
				totalProcessingTime: metrics.totalProcessingTime,
				promptTokens: metrics.tokenUsage.promptTokens,
				completionTokens: metrics.tokenUsage.completionTokens,
				totalTokens: metrics.tokenUsage.totalTokens,
				debugLogs,
			};

			const conversationMessages: AssistantMessageInput[] = [
				userMsg,
				assistantMsg,
			];

			if (isNewConversation) {
				await this.createNewConversation(
					context.conversationId,
					context.website.id,
					userId,
					'New Conversation',
					conversationMessages
				);
			} else {
				await this.addMessagesToConversation(
					context.conversationId,
					conversationMessages
				);
			}
		} catch (error) {
			throw new Error(
				`Failed to save conversation: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	private async createNewConversation(
		conversationId: string,
		websiteId: string,
		userId: string,
		title: string,
		messages: AssistantMessageInput[]
	): Promise<void> {
		await db.transaction(async (tx) => {
			// Create conversation first
			await tx.insert(assistantConversations).values({
				id: conversationId,
				userId,
				websiteId,
				title,
			});

			if (messages.length === 1) {
				const only = messages[0];
				if (only) {
					await tx.insert(assistantMessages).values(only);
				}
			} else if (messages.length > 1) {
				const first = messages[0];
				const second = messages[1];
				if (first) {
					await tx.insert(assistantMessages).values(first);
				}
				if (second) {
					await tx.insert(assistantMessages).values(second);
				}
			}
		});
	}

	private async addMessagesToConversation(
		conversationId: string,
		messages: AssistantMessageInput[]
	): Promise<void> {
		await db.transaction(async (tx) => {
			if (messages.length === 1) {
				const only = messages[0];
				if (only) {
					await tx.insert(assistantMessages).values(only);
				}
			} else if (messages.length > 1) {
				const first = messages[0];
				const second = messages[1];
				if (first) {
					await tx.insert(assistantMessages).values(first);
				}
				if (second) {
					await tx.insert(assistantMessages).values(second);
				}
			}

			// Update conversation timestamp
			await tx
				.update(assistantConversations)
				.set({ updatedAt: new Date().toISOString() })
				.where(eq(assistantConversations.id, conversationId));
		});
	}
}
