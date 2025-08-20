import type { User } from '@databuddy/auth';
import type { StreamingUpdate } from '@databuddy/shared';
import { createId, type Website } from '@databuddy/shared';
import type { AssistantRequestType } from '../../schemas';
import { AIService } from './ai-service';
import { AssistantSession, type SessionMetrics } from './assistant-session';
import { ConversationRepository } from './conversation-repository';
import {
	type AIResponseContent,
	ResponseProcessor,
} from './response-processor';

/**
 * Main orchestrator for assistant interactions
 * Coordinates all the different services and manages the workflow
 */
export class AssistantOrchestrator {
	private readonly aiService = new AIService();
	private readonly responseProcessor = new ResponseProcessor();
	private readonly conversationRepo = new ConversationRepository();

	async processRequest(
		request: AssistantRequestType,
		user: User,
		website: Website
	): Promise<StreamingUpdate[]> {
		// Create session to track this interaction
		const session = new AssistantSession(request, user, website);

		try {
			// Step 1: Generate AI response
			const aiResponse = await this.aiService.generateResponse(session);
			const aiMessageId = createId();

			if (!aiResponse.content) {
				session.log('AI response was empty');
				return [
					{
						type: 'error',
						content:
							"I'm having trouble understanding that request. Could you try asking in a different way?",
					},
				];
			}

			const streamingUpdates: StreamingUpdate[] = [
				{
					type: 'metadata',
					data: {
						conversationId: session.getContext().conversationId,
						messageId: aiMessageId,
					},
				},
			];

			// Step 2: Process the response into streaming updates
			const aiResponseUpdates = await this.responseProcessor.process(
				aiResponse.content,
				session
			);

			streamingUpdates.push(...aiResponseUpdates);

			// Step 3: Save to database (async, don't block response)
			const finalResult = streamingUpdates.at(-1);
			if (finalResult) {
				const metrics = session.finalize();

				// Save asynchronously but handle errors
				this.saveConversationAsync(
					session,
					aiResponse.content,
					aiMessageId,
					finalResult,
					metrics
				);
			}

			return streamingUpdates;
		} catch (error) {
			session.log(
				`Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);

			// Return error response
			const errorResponse: StreamingUpdate = {
				type: 'error',
				content: 'Oops! Something unexpected happened. Mind trying that again?',
			};

			// Try to save error conversation
			const metrics = session.finalize();
			this.saveErrorConversationAsync(session, error, errorResponse, metrics);

			return [errorResponse];
		}
	}

	private async saveConversationAsync(
		session: AssistantSession,
		aiResponse: AIResponseContent,
		messageId: string,
		finalResult: StreamingUpdate,
		metrics: SessionMetrics
	): Promise<void> {
		try {
			await this.conversationRepo.saveConversation(
				session,
				aiResponse,
				messageId,
				finalResult,
				metrics
			);
			console.log('✅ Conversation saved successfully');
		} catch (error) {
			console.error('❌ Failed to save conversation:', error);
		}
	}

	private async saveErrorConversationAsync(
		session: AssistantSession,
		originalError: unknown,
		errorResponse: StreamingUpdate,
		metrics: SessionMetrics
	): Promise<void> {
		try {
			const errorAIResponse = {
				response_type: 'text' as const,
				text_response:
					errorResponse.type === 'error'
						? errorResponse.content
						: 'Oops! Something unexpected happened. Mind trying that again?',
				thinking_steps: [
					`Error: ${originalError instanceof Error ? originalError.message : 'Unknown error'}`,
				],
			};

			const messageId = createId('NANOID');

			await this.conversationRepo.saveConversation(
				session,
				errorAIResponse,
				messageId,
				errorResponse,
				metrics
			);
			console.log('✅ Error conversation saved successfully');
		} catch (error) {
			console.error('❌ Failed to save error conversation:', error);
		}
	}
}
