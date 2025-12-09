import { auth, websitesApi } from "@databuddy/auth";
import { smoothStream } from "ai";
import { Elysia, t } from "elysia";
import { createReflectionAgent, createTriageAgent } from "../ai/agents";
import { buildAppContext } from "../ai/config/context";
import { record, setAttributes } from "../lib/tracing";
import { getWebsiteDomain, validateWebsite } from "../lib/website-utils";
import { executeQuery, QueryBuilders } from "../query/builders";
import type { QueryRequest } from "../query/types";

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

/**
 * Schema for manual tool invocation requests.
 * Allows users to directly invoke analytics queries without going through the AI agent.
 */
const InvokeRequestSchema = t.Object({
	websiteId: t.String(),
	tool: t.String({
		description: "The tool/query type to invoke",
	}),
	params: t.Object({
		from: t.String({ description: "Start date in ISO format (e.g., 2024-01-01)" }),
		to: t.String({ description: "End date in ISO format (e.g., 2024-01-31)" }),
		timeUnit: t.Optional(
			t.Union([
				t.Literal("minute"),
				t.Literal("hour"),
				t.Literal("day"),
				t.Literal("week"),
				t.Literal("month"),
			])
		),
		filters: t.Optional(
			t.Array(
				t.Object({
					field: t.String(),
					op: t.Union([
						t.Literal("eq"),
						t.Literal("ne"),
						t.Literal("contains"),
						t.Literal("not_contains"),
						t.Literal("starts_with"),
						t.Literal("in"),
						t.Literal("not_in"),
					]),
					value: t.Union([
						t.String(),
						t.Number(),
						t.Array(t.Union([t.String(), t.Number()])),
					]),
					target: t.Optional(t.String()),
					having: t.Optional(t.Boolean()),
				})
			)
		),
		groupBy: t.Optional(t.Array(t.String())),
		orderBy: t.Optional(t.String()),
		limit: t.Optional(t.Number({ minimum: 1, maximum: 1000 })),
		offset: t.Optional(t.Number({ minimum: 0 })),
	}),
	timezone: t.Optional(t.String()),
});

type UIMessage = {
	id: string;
	role: "user" | "assistant";
	parts: Array<{ type: "text"; text: string }>;
};

type IncomingMessage = {
	id?: string;
	role: "user" | "assistant";
	content?: string;
	parts?: Array<{ type: string; text?: string }>;
	text?: string;
};

function toUIMessage(msg: IncomingMessage): UIMessage {
	if (msg.parts && msg.parts.length > 0) {
		return {
			id: msg.id ?? crypto.randomUUID(),
			role: msg.role,
			parts: msg.parts.map((p) => ({ type: "text", text: p.text ?? "" })),
		};
	}

	// Extract text from content or text field
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
					"agent.website_id": body.websiteId,
					"agent.user_id": user?.id ?? "unknown",
					"agent.chat_id": chatId,
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
					let agent: ReturnType<typeof createTriageAgent> | ReturnType<typeof createReflectionAgent>;
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
					console.error("Agent chat error:", error);
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
	)
	.post(
		"/invoke",
		async function agentInvoke({ body, user, request }) {
			return record("agentInvoke", async () => {
				setAttributes({
					"agent.website_id": body.websiteId,
					"agent.user_id": user?.id ?? "unknown",
					"agent.tool": body.tool,
				});

				try {
					const websiteValidation = await validateWebsite(body.websiteId);
					if (!(websiteValidation.success && websiteValidation.website)) {
						return {
							success: false,
							error: websiteValidation.error ?? "Website not found",
						};
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
						return {
							success: false,
							error: "Unauthorized",
						};
					}

					// Validate the tool exists
					const availableTools = Object.keys(QueryBuilders);
					if (!availableTools.includes(body.tool)) {
						return {
							success: false,
							error: `Unknown tool: ${body.tool}. Available tools: ${availableTools.join(", ")}`,
							availableTools,
						};
					}

					// Get website domain for the query
					const websiteDomain = await getWebsiteDomain(body.websiteId);

					// Build and execute the query
					const queryRequest: QueryRequest = {
						projectId: body.websiteId,
						type: body.tool,
						from: body.params.from,
						to: body.params.to,
						timeUnit: body.params.timeUnit,
						filters: body.params.filters,
						groupBy: body.params.groupBy,
						orderBy: body.params.orderBy,
						limit: body.params.limit,
						offset: body.params.offset,
						timezone: body.timezone ?? "UTC",
					};

					const startTime = Date.now();
					const data = await executeQuery(
						queryRequest,
						websiteDomain,
						queryRequest.timezone
					);
					const executionTime = Date.now() - startTime;

					return {
						success: true,
						tool: body.tool,
						data,
						meta: {
							rowCount: data.length,
							executionTime,
							timezone: queryRequest.timezone,
							from: body.params.from,
							to: body.params.to,
						},
					};
				} catch (error) {
					console.error("Agent invoke error:", error);
					return {
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
					};
				}
			});
		},
		{ body: InvokeRequestSchema }
	)
	.get("/tools", async function listTools({ user }) {
		if (!user?.id) {
			return {
				success: false,
				error: "Authentication required",
			};
		}

		const tools = Object.keys(QueryBuilders).map((key) => ({
			name: key,
			description: `Execute ${key} analytics query`,
		}));

		return {
			success: true,
			tools,
		};
	});
