import { auth, websitesApi } from "@databuddy/auth";
import type { StreamingUpdate } from "@databuddy/shared/types/assistant";
import { Elysia } from "elysia";
import { processAssistantRequest } from "../agent/processor";
import { createStreamingResponse } from "../agent/utils/stream-utils";
import { record, setAttributes } from "../lib/tracing";
import { validateWebsite } from "../lib/website-utils";
import { AssistantRequestSchema } from "../schemas";

function createErrorResponse(message: string): StreamingUpdate[] {
	return [{ type: "error", content: message }];
}

export const assistant = new Elysia({ prefix: "/v1/assistant" })
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
					error: "Authentication required",
					code: "AUTH_REQUIRED",
				}),
				{
					status: 401,
					headers: { "Content-Type": "application/json" },
				}
			);
		}
	})
	.post(
		"/stream",
		function assistantStream({ body, user, request }) {
			return record("assistantStream", async () => {
				setAttributes({
					"assistant.website_id": body.websiteId,
					"assistant.user_id": user?.id || "unknown",
					"assistant.message_count": body.messages.length,
				});

				try {
					const websiteValidation = await validateWebsite(body.websiteId);
					if (!websiteValidation.success) {
						setAttributes({ "assistant.website_validation_failed": true });
						return createStreamingResponse(
							createErrorResponse(
								websiteValidation.error || "Website not found"
							)
						);
					}

					const { website } = websiteValidation;
					if (!website) {
						setAttributes({ "assistant.website_not_found": true });
						return createStreamingResponse(
							createErrorResponse("Website not found")
						);
					}

					// Authorization: allow public websites, org members with permission, or the owner
					let authorized = website.isPublic;
					if (!authorized) {
						if (website.organizationId) {
							const { success } = await websitesApi.hasPermission({
								headers: request.headers,
								body: { permissions: { website: ["read"] } },
							});
							authorized = success;
						} else {
							authorized = website.userId === user?.id;
						}
					}

					if (!authorized) {
						setAttributes({ "assistant.unauthorized": true });
						return createStreamingResponse(
							createErrorResponse(
								"You do not have permission to access this website"
							)
						);
					}

					setAttributes({
						"assistant.website_public": website.isPublic,
						"assistant.website_org": Boolean(website.organizationId),
					});

					if (!user) {
						setAttributes({ "assistant.no_user": true });
						return createStreamingResponse(
							createErrorResponse("User not found")
						);
					}

					const updates = await processAssistantRequest(
						body,
						user as never,
						website
					);
					setAttributes({ "assistant.success": true });
					return createStreamingResponse(updates);
				} catch (error) {
					setAttributes({ "assistant.error": true });
					const errorMessage =
						error instanceof Error ? error.message : "Unknown error occurred";
					return createStreamingResponse(createErrorResponse(errorMessage));
				}
			});
		},
		{
			body: AssistantRequestSchema,
		}
	);
