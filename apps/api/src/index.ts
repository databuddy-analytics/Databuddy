import "./polyfills/compression";
import { auth } from "@databuddy/auth";
import {
	appRouter,
	createAbortSignalInterceptor,
	createRPCContext,
	getBillingCustomerId,
	recordORPCError,
} from "@databuddy/rpc";
import cors from "@elysiajs/cors";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { autumnHandler } from "autumn-js/elysia";
import { Elysia } from "elysia";
import { initLogger, log, parseError } from "evlog";
import { evlog, useLogger } from "evlog/elysia";
import { applyAuthWideEvent } from "@/lib/auth-wide-event";
import {
	apiLoggerDrain,
	enrichApiWideEvent,
	flushBatchedApiDrain,
} from "@/lib/evlog-api";
import { initTccTracing, shutdownTccTracing } from "@/lib/tcc-otel";
import { captureError } from "@/lib/tracing";
import { agent } from "./routes/agent";
import { health } from "./routes/health";
import { insights } from "./routes/insights";
import { mcp } from "./routes/mcp";
import { publicApi } from "./routes/public";
import { query } from "./routes/query";
import { webhooks } from "./routes/webhooks/index";

initLogger({
	env: { service: "api" },
	drain: apiLoggerDrain,
	sampling: {
		rates: { info: 20, warn: 50, debug: 5 },
		keep: [{ status: 400 }, { duration: 1500 }],
	},
});

try {
	initTccTracing();
} catch (error) {
	log.warn({
		service: "api",
		component: "tcc_otel",
		message: "TCC tracing disabled (init failed)",
		error: error instanceof Error ? error.message : String(error),
	});
}

process.on("unhandledRejection", (reason, _promise) => {
	captureError(reason);
	log.error({
		process: "unhandledRejection",
		reason: reason instanceof Error ? reason.message : String(reason),
	});
});

process.on("uncaughtException", (error) => {
	captureError(error);
	log.error({
		process: "uncaughtException",
		error: error instanceof Error ? error.message : String(error),
	});
});

async function handleRpcRoute(
	ctx: { request: Request },
	handle: (
		request: Request,
		rpcContext: Awaited<ReturnType<typeof createRPCContext>>
	) => Promise<{ matched: boolean; response?: Response }>
) {
	const { request } = ctx;
	try {
		const rpcContext = await createRPCContext({ headers: request.headers });
		const run = async () => {
			const result = await handle(request, rpcContext);
			return result.response ?? new Response("Not Found", { status: 404 });
		};
		return run();
	} catch (error) {
		if (error instanceof ORPCError) {
			recordORPCError({ code: error.code, message: error.message });
		}
		useLogger().error(
			error instanceof Error ? error : new Error(String(error)),
			{ rpc: "handler" }
		);
		return new Response("Internal Server Error", { status: 500 });
	}
}

const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		createAbortSignalInterceptor(),
		onError((error) => {
			useLogger().error(
				error instanceof Error ? error : new Error(String(error))
			);
		}),
	],
});

const HIDDEN_FROM_DOCS = [
	"revenue",
	"agent",
	"chat",
	"sso",
	"uptime",
	"billing",
] as const;
const docsRouter = Object.fromEntries(
	Object.entries(appRouter).filter(
		([key]) =>
			!HIDDEN_FROM_DOCS.includes(key as (typeof HIDDEN_FROM_DOCS)[number])
	)
) as Omit<typeof appRouter, (typeof HIDDEN_FROM_DOCS)[number]>;

const openApiHandler = new OpenAPIHandler(docsRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
			specPath: "/spec.json",
			docsPath: "/",
			docsTitle: "Databuddy API",
			docsConfig: { theme: "deepSpace" },
			specGenerateOptions: {
				servers: [{ url: "https://api.databuddy.cc" }],
				info: {
					title: "Databuddy API",
					version: "1.0.0",
					description: `REST API for Databuddy analytics, link management, and feature flags.

**Authentication:** Endpoints accept either session cookies (browser) or an API key. For programmatic access, use an API key.

**API Key usage:**
- Send in the \`x-api-key\` header, or
- Send as a Bearer token in the \`Authorization\` header: \`Authorization: Bearer <your-api-key>\`
- API keys must be scoped to an organization. Create keys in the dashboard under Organization → API Keys.

**Scope requirements:** Some endpoints require specific API key scopes. The Links endpoints require \`read:links\` for list/get and \`write:links\` for create/update/delete. Check each operation's \`x-required-scopes\` for requirements. Session authentication does not use scopes; access is determined by organization membership and role.`,
				},
				tags: [
					{
						name: "Annotations",
						description:
							"Timeline annotations for marking events on charts. Create, update, and delete annotations tied to specific time ranges and chart contexts.",
					},
					{
						name: "API Keys",
						description:
							"Create, list, update, revoke, and verify API keys. Requires organization membership with website configure permission. API keys cannot be used to manage other API keys.",
					},
					{
						name: "Autocomplete",
						description:
							"Autocomplete suggestions for analytics filters: page paths, custom events, browsers, countries, UTM params, and more. Used to power filter dropdowns and search.",
					},
					{
						name: "Export",
						description:
							"Export analytics data in CSV, JSON, or text format for a date range. Requires read permission on the website.",
					},
					{
						name: "Flags",
						description:
							"Feature flags for gradual rollouts and A/B testing. Create, update, and evaluate flags scoped to websites or organizations.",
					},
					{
						name: "Funnels",
						description:
							"Funnel conversion analysis. Define multi-step funnels, track conversions, and analyze funnel performance by referrer.",
					},
					{
						name: "Goals",
						description:
							"Conversion goals and analytics. Define goals (custom events, page views, etc.), track conversions, and retrieve goal analytics.",
					},
					{
						name: "Insights",
						description:
							"Smart insights and anomaly detection for analytics data across your workspaces.",
					},
					{
						name: "Links",
						description:
							"Short link creation and management. Create, list, update, and delete short links with custom slugs. API keys require read:links or write:links scope.",
					},
					{
						name: "Mini Charts",
						description:
							"Pre-aggregated mini chart data for dashboard widgets. Returns compact time-series data for authorized websites.",
					},
					{
						name: "Organizations",
						description:
							"Workspace and organization management: avatar, invitations, billing context, and usage.",
					},
					{
						name: "Preferences",
						description:
							"User preferences for date and time formatting. Stored per-user, not per-organization.",
					},
					{
						name: "Target Groups",
						description:
							"Audience targeting for feature flags. Define target groups by rules (country, referrer, etc.) and use them to target flag rollouts.",
					},
					{
						name: "Websites",
						description:
							"Website management: create, list, update, delete websites; transfer between workspaces; configure settings and tracking.",
					},
				],
				security: [{ apiKey: [] }],
				components: {
					securitySchemes: {
						apiKey: {
							type: "apiKey",
							in: "header",
							name: "x-api-key",
							description: `API key for programmatic access. Use instead of session cookies when calling from servers, scripts, or external integrations.

**How to send:**
- \`x-api-key: <your-api-key>\` header (preferred), or
- \`Authorization: Bearer <your-api-key>\` header

**Scope requirements:** Session auth uses organization membership and roles; no scopes. API key auth may require scopes. The Links router enforces scopes: \`read:links\` for list/get, \`write:links\` for create/update/delete. Operations that require scopes include \`x-required-scopes\` in their schema.

**Available scopes:** read:data | write:llm | track:events | read:links | write:links

**Creating keys:** Keys are created in the dashboard (Organization → API Keys) and must be scoped to an organization. Store the secret securely; it is shown only once.`,
						},
					},
				},
			},
		}),
	],
	interceptors: [
		createAbortSignalInterceptor(),
		onError((error) => {
			useLogger().error(
				error instanceof Error ? error : new Error(String(error))
			);
		}),
	],
});

const app = new Elysia()
	.use(
		evlog({
			enrich: enrichApiWideEvent,
		})
	)
	.onBeforeHandle(async ({ request }) => {
		await applyAuthWideEvent(request.headers);
	})
	.use(
		cors({
			credentials: true,
			origin: [
				/(?:^|\.)databuddy\.cc$/,
				...(process.env.NODE_ENV === "development"
					? ["http://localhost:3000"]
					: []),
			],
		})
	)
	.use(publicApi)
	.use(health)
	.get(
		"/.well-known/oauth-authorization-server",
		() =>
			new Response(null, {
				status: 404,
				headers: { "Cache-Control": "no-store" },
			})
	)
	.use(webhooks)
	.use(
		autumnHandler({
			identify: async ({ request }) => {
				try {
					const session = await auth.api.getSession({
						headers: request.headers,
					});

					if (!session?.user) {
						return null;
					}

					const activeOrgId = (
						session.session as { activeOrganizationId?: string | null }
					)?.activeOrganizationId;
					const customerId = await getBillingCustomerId(
						session.user.id,
						activeOrgId
					);

					return {
						customerId,
						customerData: {
							name: session.user.name,
							email: session.user.email,
						},
					};
				} catch (error) {
					useLogger().error(
						error instanceof Error ? error : new Error(String(error)),
						{ autumn: "identify" }
					);
					return null;
				}
			},
		})
	)
	.use(query)
	.use(agent)
	.use(insights)
	.use(mcp)
	.all(
		"/rpc/*",
		(ctx) =>
			handleRpcRoute(ctx, (request, rpcContext) =>
				rpcHandler.handle(request, {
					prefix: "/rpc",
					context: rpcContext,
				})
			),
		{ parse: "none" }
	)
	.all(
		"/*",
		(ctx) =>
			handleRpcRoute(ctx, (request, rpcContext) =>
				openApiHandler.handle(request, {
					prefix: "/",
					context: rpcContext,
				})
			),
		{ parse: "none" }
	)
	.onError(function handleError({ error, code }) {
		const statusCode = code === "NOT_FOUND" ? 404 : 500;

		const parsed = parseError(error);
		const isDevelopment = process.env.NODE_ENV === "development";
		const errorMessage = error instanceof Error ? error.message : String(error);
		const safeClientError =
			isDevelopment || statusCode === 404
				? errorMessage
				: "An internal server error occurred";
		const exposeStructured =
			isDevelopment || (parsed.status >= 400 && parsed.status < 500);

		return new Response(
			JSON.stringify({
				success: false,
				error: safeClientError,
				code: code ?? "INTERNAL_SERVER_ERROR",
				...(exposeStructured && parsed.why != null && parsed.why !== ""
					? { why: parsed.why }
					: {}),
				...(exposeStructured && parsed.fix != null && parsed.fix !== ""
					? { fix: parsed.fix }
					: {}),
				...(exposeStructured && parsed.link != null && parsed.link !== ""
					? { link: parsed.link }
					: {}),
			}),
			{ status: statusCode, headers: { "Content-Type": "application/json" } }
		);
	});

export default {
	fetch: app.fetch,
	port: Number.parseInt(process.env.PORT ?? "3001", 10),
};

process.on("SIGINT", async () => {
	log.info("lifecycle", "SIGINT received, shutting down gracefully");
	await Promise.all([
		flushBatchedApiDrain().catch((error) =>
			log.error({
				lifecycle: "drainFlush",
				error: error instanceof Error ? error.message : String(error),
			})
		),
		shutdownTccTracing().catch((error) =>
			log.error({
				lifecycle: "tccOtelShutdown",
				error: error instanceof Error ? error.message : String(error),
			})
		),
	]);
	process.exit(0);
});

process.on("SIGTERM", async () => {
	log.info("lifecycle", "SIGTERM received, shutting down gracefully");
	await Promise.all([
		flushBatchedApiDrain().catch((error) =>
			log.error({
				lifecycle: "drainFlush",
				error: error instanceof Error ? error.message : String(error),
			})
		),
		shutdownTccTracing().catch((error) =>
			log.error({
				lifecycle: "tccOtelShutdown",
				error: error instanceof Error ? error.message : String(error),
			})
		),
	]);
	process.exit(0);
});
