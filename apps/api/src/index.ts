import "./polyfills/compression";
import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
import { evlog } from "evlog/elysia";
import { handleAutumnRequest } from "@/billing/autumn";
import { startAutumnWebhookReplayLoop } from "@/billing/autumn-webhook-replay";
import { startAuditOutboxReplayLoop } from "@/audit/audit-outbox-replay";
import { configureApiInstrumentation } from "@/bootstrap/instrumentation";
import { configureApiLogger } from "@/bootstrap/logger";
import { registerProcessErrorHandlers } from "@/bootstrap/process-errors";
import {
	registerShutdownHooks,
	warmPostgresConnection,
} from "@/bootstrap/shutdown";
import { isAllowedApiOrigin } from "@/http/cors";
import { handleAppError } from "@/http/errors";
import { getRequestId } from "@/http/request-id";
import { AUTUMN_API_PREFIX } from "@/lib/autumn-mount";
import { enrichApiWideEvent } from "@/lib/evlog-api";
import { enrichRequestAuthWideEvent } from "@/middleware/auth-wide-event";
import {
	handleAnonymousOrpcRequest,
	handleAuthenticatedOrpcRequest,
	type OrpcContext,
	rpcHandler,
} from "@/rpc/handlers";
import { openApiHandler } from "@/rpc/openapi";
import { agent } from "./routes/agent";
import { discovery } from "./routes/discovery";
import { health } from "./routes/health";
import { integrations } from "./routes/integrations";
import { mcp } from "./routes/mcp";
import { publicApi } from "./routes/public";
import { query } from "./routes/query";
import { webhooks } from "./routes/webhooks/index";

configureApiLogger();
configureApiInstrumentation();
registerProcessErrorHandlers();

const BUN_IDLE_TIMEOUT_SECONDS = 255;
interface RequestContext {
	request: Request;
}

function handleRpcEndpoint({ request }: RequestContext) {
	return handleAuthenticatedOrpcRequest(request, (orpcRequest, context) =>
		rpcHandler.handle(orpcRequest, {
			prefix: "/rpc",
			context,
		})
	);
}

function handleOpenApiReference({ request }: RequestContext) {
	return handleAnonymousOrpcRequest(request, handleOpenApiRequest);
}

function handleOpenApiEndpoint({ request }: RequestContext) {
	return handleAuthenticatedOrpcRequest(request, handleOpenApiRequest);
}

function handleOpenApiJson({ request }: RequestContext) {
	const url = new URL(request.url);
	url.pathname = "/spec.json";
	const specRequest = new Request(url, {
		headers: request.headers,
		method: request.method,
		signal: request.signal,
	});

	return handleOpenApiReference({ request: specRequest });
}

function handleOpenApiRequest(orpcRequest: Request, context: OrpcContext) {
	return openApiHandler.handle(orpcRequest, {
		prefix: "/",
		context,
	});
}

const app = new Elysia({ precompile: true })
	.use(
		evlog({
			enrich: enrichApiWideEvent,
		})
	)
	.onBeforeHandle(({ request, set }) => {
		set.headers["X-Request-ID"] = getRequestId(request);
	})
	.onBeforeHandle(({ request }) => enrichRequestAuthWideEvent(request))
	.use(
		cors({
			credentials: true,
			exposeHeaders: [
				"X-Request-ID",
				"Retry-After",
				"X-RateLimit-Limit",
				"X-RateLimit-Remaining",
				"X-RateLimit-Reset",
			],
			origin: isAllowedApiOrigin,
		})
	)
	.use(publicApi)
	.use(health)
	.use(discovery)
	.use(webhooks)
	.mount(AUTUMN_API_PREFIX, handleAutumnRequest)
	.use(query)
	.use(agent)
	.use(integrations)
	.use(mcp)
	.all("/rpc/*", handleRpcEndpoint, { parse: "none" })
	.all("/", handleOpenApiReference, { parse: "none" })
	.all("/openapi.json", handleOpenApiJson, { parse: "none" })
	.all("/spec.json", handleOpenApiReference, { parse: "none" })
	.all("/*", handleOpenApiEndpoint, { parse: "none" })
	.onError(handleAppError);

const autumnWebhookReplay = startAutumnWebhookReplayLoop();
const auditOutboxReplay = startAuditOutboxReplayLoop();
warmPostgresConnection();
registerShutdownHooks(async () => {
	await Promise.all([autumnWebhookReplay.stop(), auditOutboxReplay.stop()]);
});

export default {
	fetch: app.fetch,
	port: Number.parseInt(process.env.PORT ?? "3001", 10) || 3001,
	idleTimeout: BUN_IDLE_TIMEOUT_SECONDS,
};
