import { auth, websitesApi } from "@databuddy/auth";
import { smoothStream } from "ai";
import { Elysia, t } from "elysia";
import { createReflectionAgent, createTriageAgent } from "../ai/agents";
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
		text: t.Optional(t.String()), // SDK sometimes sends text directly
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

	const text = msg.content ?? msg.text ?? "";

	return {
		id: msg.id ?? crypto.randomUUID(),
		role: msg.role,
		parts: [{ type: "text", text }],
	};
}

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
								error: websiteValidation.error ?? "Website not found",
							}),
							{ status: 404, headers: { "Content-Type": "application/json" } }
						);
					}

					const { website } = websiteValidation;

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
						return new Response(JSON.stringify({ error: "Unauthorized" }), {
							status: 403,
							headers: { "Content-Type": "application/json" },
						});
					}

					const appContext = buildAppContext(
						user?.id ?? "anonymous",
						body.websiteId,
						website.domain ?? "unknown",
						body.timezone ?? "UTC"
					);

					const message = toUIMessage(body.message);

					const contextWithChatId = {
						...appContext,
						chatId,
						requestHeaders: request.headers,
						availableQueryTypes: Object.keys(QueryBuilders),
					};

					const agentContext = {
						websiteId: body.websiteId,
						websiteDomain: website.domain ?? "unknown",
						timezone: body.timezone ?? "UTC",
						requestHeaders: request.headers,
					};

					// Select agent based on model preference
					// basic: triageAgent (simple routing)
					// agent: reflectionAgent with haiku model
					// agent-max: reflectionAgent with max capabilities
					const modelType = body.model ?? "agent";
					let agent:
						| ReturnType<typeof createTriageAgent>
						| ReturnType<typeof createReflectionAgent>;
					let maxRounds = 5;
					let maxSteps = 20;

					if (!user?.id) {
						return new Response(JSON.stringify({ error: "User ID required" }), {
							status: 401,
							headers: { "Content-Type": "application/json" },
						});
					}

					switch (modelType) {
						case "basic":
							agent = createTriageAgent(user.id, agentContext);
							maxRounds = 1;
							maxSteps = 5;
							break;
						case "agent":
							agent = createReflectionAgent(user.id, agentContext, "haiku");
							maxRounds = 5;
							maxSteps = 20;
							break;
						case "agent-max":
							agent = createReflectionAgent(user.id, agentContext, "max");
							maxRounds = 10;
							maxSteps = 40;
							break;
						default:
							agent = createReflectionAgent(user.id, agentContext, "haiku");
					}

					return agent.toUIMessageStream({
						message,
						strategy: "auto",
						maxRounds,
						maxSteps,
						context: contextWithChatId,
						experimental_transform: smoothStream({
							chunking: "word",
						}),
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
							error: error instanceof Error ? error.message : "Unknown error",
						}),
						{ status: 500, headers: { "Content-Type": "application/json" } }
					);
				}
			});
		},
		{ body: AgentRequestSchema, idleTimeout: 60_000 }
	);
