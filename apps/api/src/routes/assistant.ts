import type { User } from '@databuddy/auth';
import { Elysia } from 'elysia';
import type { StreamingUpdate } from '../agent';
import {
	type AssistantContext,
	type AssistantRequest,
	createStreamingResponse,
	processAssistantRequest,
} from '../agent';
import { validateWebsite } from '../lib/website-utils';
// import { createRateLimitMiddleware } from '../middleware/rate-limit';
import { websiteAuth } from '../middleware/website-auth';
import { AssistantRequestSchema, type AssistantRequestType } from '../schemas';

function createErrorResponse(message: string): StreamingUpdate[] {
	return [{ type: 'error', content: message }];
}

export const assistant = new Elysia({ prefix: '/v1/assistant' })
	// .use(createRateLimitMiddleware({ type: 'expensive' }))
	.use(websiteAuth())
	.post(
		'/stream',
		async ({ body, user }: { body: AssistantRequestType; user: User }) => {
			const { messages, websiteId, model, conversationId } = body;

			try {
				const websiteValidation = await validateWebsite(websiteId);

				if (!websiteValidation.success) {
					return createStreamingResponse(
						createErrorResponse(websiteValidation.error || 'Website not found')
					);
				}

				const { website } = websiteValidation;

				if (!website) {
					return createStreamingResponse(
						createErrorResponse('Website not found')
					);
				}

				const assistantRequest: AssistantRequest = {
					messages,
					websiteId,
					conversationId,
					websiteHostname: website.domain,
					model: model || 'chat',
				};

				const assistantContext: AssistantContext = {
					user,
					website,
					debugInfo: {},
				};

				const updates = await processAssistantRequest(
					assistantRequest,
					assistantContext
				);
				return createStreamingResponse(updates);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : 'Unknown error occurred';
				return createStreamingResponse(createErrorResponse(errorMessage));
			}
		},
		{
			body: AssistantRequestSchema,
		}
	);
