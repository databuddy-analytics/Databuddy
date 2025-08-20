import { auth, type User, websitesApi } from '@databuddy/auth';
import type { StreamingUpdate } from '@databuddy/shared';
import { Elysia } from 'elysia';
import { processAssistantRequest } from '../agent/processor';
import { createStreamingResponse } from '../agent/utils/stream-utils';
import { validateWebsite } from '../lib/website-utils';
import { AssistantRequestSchema, type AssistantRequestType } from '../schemas';

function createErrorResponse(message: string): StreamingUpdate[] {
	return [{ type: 'error', content: message }];
}

export const assistant = new Elysia({ prefix: '/v1/assistant' })
	// .use(createRateLimitMiddleware({ type: 'expensive' }))
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });

		return {
			user: session?.user ?? null,
		};
	})
	.onBeforeHandle(({ user }) => {
		if (!user) {
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Authentication required',
					code: 'AUTH_REQUIRED',
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}
	})
	.post(
		'/stream',
		async ({
			body,
			user,
			request,
		}: {
			body: AssistantRequestType;
			user: User;
			request: Request;
		}) => {
			try {
				const websiteValidation = await validateWebsite(body.websiteId);
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

				// Authorization: allow public websites, org members with permission, or the owner
				let authorized = website.isPublic;
				if (!authorized) {
					if (website.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: request.headers,
							body: { permissions: { website: ['read'] } },
						});
						authorized = success;
					} else {
						authorized = website.userId === user.id;
					}
				}

				if (!authorized) {
					return createStreamingResponse(
						createErrorResponse(
							'You do not have permission to access this website'
						)
					);
				}

				const updates = await processAssistantRequest(body, user, website);
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
