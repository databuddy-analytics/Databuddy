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

// biome-ignore lint/suspicious/useAwait: async generator function doesn't need await
async function* createErrorResponse(
	message: string
): AsyncGenerator<StreamingUpdate> {
	yield { type: 'error', content: message };
}

export const assistant = new Elysia({ prefix: '/v1/assistant' })
	// .use(createRateLimitMiddleware({ type: 'expensive' }))
	.use(websiteAuth())
	.post(
		'/stream',
		async ({ body, user }: { body: AssistantRequestType; user: User }) => {
			const { message, website_id, model, context } = body;

			try {
				const websiteValidation = await validateWebsite(website_id);

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
					message,
					website_id,
					website_hostname: website.domain,
					model: model || 'chat',
					context,
				};

				const assistantContext: AssistantContext = {
					user: user ?? null,
					website,
					debugInfo: {},
				};

				const updates = processAssistantRequest(
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
