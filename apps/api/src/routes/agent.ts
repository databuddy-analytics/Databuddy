import { auth, websitesApi } from "@databuddy/auth";
import { smoothStream } from "ai";
import { Elysia, t } from "elysia";
import { type AgentType, createAgent, getStreamConfig } from "../ai/agents";
import { buildAppContext } from "../ai/config/context";
import { captureError, record, setAttributes } from "../lib/tracing";
import { validateWebsite } from "../lib/website-utils";
import { QueryBuilders } from "../query/builders";

const AgentRequestSchema = t.Object({
	websiteId: t.String(),
	message: t.Object({
		id: t.Optional(t.String()),
		role: t.Union([t.Literal("user"), t.Literal("assistant")]),
		content: t.Optional(t.String()),
		parts: t.Optional(
			t.Array(
				t.Object({
					type: t.String(),
					text: t.Optional(t.String()),
				})
			)
		),
		text: t.Optional(t.String()),
	}),
	id: t.Optional(t.String()),
	timezone: t.Optional(t.String()),
	model: t.Optional(
		t.Union([t.Literal("basic"), t.Literal("agent"), t.Literal("agent-max")])
	),
});

interface UIMessage {
	id: string;
	role: "user" | "assistant";
	parts: Array<{ type: "text"; text: string }>;
}

interface IncomingMessage {
	id?: string;
	role: "user" | "assistant";
	content?: string;
	parts?: Array<{ type: string; text?: string }>;
	text?: string;
}

function toUIMessage(msg: IncomingMessage): UIMessage {
	if (msg.parts && msg.parts.length > 0) {
		return {
			id: msg.id ?? crypto.randomUUID(),
			role: msg.role,
			parts: msg.parts.map((p) => ({ type: "text", text: p.text ?? "" })),
		};
	}

	return {
		id: msg.id ?? crypto.randomUUID(),
		role: msg.role,
		parts: [{ type: "text", text: msg.content ?? msg.text ?? "" }],
	};
}

const MODEL_TO_AGENT: Record<string, AgentType> = {
	basic: "triage",
	agent: "analytics",
	"agent-max": "reflection-max",
};

export const agent = new Elysia({ prefix: "/v1/agent" })
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		return { user: session?.user ?? null };
	})
	.onBeforeHandle(({ user, set }) => {
		if (!user) {
			set.status = 401;
			return {
				success: false,
				error: "Authentication required",
				code: "AUTH_REQUIRED",
			};
		}
	})
	.post(
		"/chat",
		function agentChat({ body, user, request }) {
			return record("agentChat", async () => {
				const chatId = body.id ?? crypto.randomUUID();

				setAttributes({
					agent_website_id: body.websiteId,
					agent_user_id: user?.id ?? "unknown",
					agent_chat_id: chatId,
				});

				try {
					const websiteValidation = await validateWebsite(body.websiteId);
					if (!(websiteValidation.success && websiteValidation.website)) {
						return new Response(
							JSON.stringify({
								success: false,
								error: websiteValidation.error ?? "Website not found",
								code: "WEBSITE_NOT_FOUND",
							}),
							{ status: 404, headers: { "Content-Type": "application/json" } }
						);
					}

					const { website } = websiteValidation;

					let authorized = website.isPublic;
					if (!authorized && website.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: request.headers,
							body: { permissions: { website: ["read"] } },
						});
						authorized = success;
					}

					if (!authorized) {
						return new Response(
							JSON.stringify({
								success: false,
								error: "Access denied to this website",
								code: "ACCESS_DENIED",
							}),
							{ status: 403, headers: { "Content-Type": "application/json" } }
						);
					}

					if (!user?.id) {
						return new Response(
							JSON.stringify({
								success: false,
								error: "User ID required",
								code: "AUTH_REQUIRED",
							}),
							{ status: 401, headers: { "Content-Type": "application/json" } }
						);
					}

					const agentType: AgentType =
						MODEL_TO_AGENT[body.model ?? "agent"] ?? "reflection";
					const streamConfig = getStreamConfig(agentType);

					console.log("[Agent] Creating agent", {
						type: agentType,
						model: body.model,
						websiteId: body.websiteId,
						message: body.message.content ?? body.message.text,
					});

					const agentInstance = createAgent(agentType, {
						userId: user.id,
						websiteId: body.websiteId,
						websiteDomain: website.domain ?? "unknown",
						timezone: body.timezone ?? "UTC",
						requestHeaders: request.headers,
					});

					const appContext = buildAppContext(
						user.id,
						body.websiteId,
						website.domain ?? "unknown",
						body.timezone ?? "UTC"
					);

					return agentInstance.toUIMessageStream({
						message: toUIMessage(body.message),
						strategy: "auto",
						maxRounds: streamConfig.maxRounds,
						maxSteps: streamConfig.maxSteps,
						context: {
							...appContext,
							chatId,
							requestHeaders: request.headers,
							availableQueryTypes: Object.keys(QueryBuilders),
						},
						experimental_transform: smoothStream({ chunking: "word" }),
						sendSources: true,
					});
				} catch (error) {
					captureError(error, {
						agent_error: true,
						agent_model_type: body.model ?? "agent",
						agent_chat_id: chatId,
						agent_website_id: body.websiteId,
						agent_user_id: user?.id ?? "unknown",
						error_type: error instanceof Error ? error.name : "UnknownError",
					});
					return new Response(
						JSON.stringify({
							success: false,
							error: error instanceof Error ? error.message : "Unknown error",
							code: "INTERNAL_ERROR",
						}),
						{ status: 500, headers: { "Content-Type": "application/json" } }
					);
				}
			});
		},
		{ body: AgentRequestSchema, idleTimeout: 60_000 }
	);
