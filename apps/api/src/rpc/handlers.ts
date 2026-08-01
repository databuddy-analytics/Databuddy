import {
	appRouter,
	createAbortSignalInterceptor,
	createRPCContext,
	recordORPCError,
} from "@databuddy/rpc";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { createError } from "evlog";
import { useLogger } from "evlog/elysia";
import { handleAppError } from "@/http/errors";
import { getResolvedAuth } from "@/lib/auth-wide-event";
import { getRequestId } from "@/http/request-id";
import { logOrpcHandlerError } from "./interceptors";

export type OrpcContext = Awaited<ReturnType<typeof createRPCContext>>;
type PreResolvedAuth = NonNullable<Parameters<typeof createRPCContext>[1]>;
export type OrpcRouteHandler = (
	request: Request,
	context: OrpcContext
) => Promise<{ matched: boolean; response?: Response }>;

const ANONYMOUS_AUTH: PreResolvedAuth = { session: null, apiKey: null };

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [createAbortSignalInterceptor(), onError(logOrpcHandlerError)],
});

export function createAuthenticatedOrpcContext(request: Request) {
	const preResolvedAuth = getPreResolvedAuth(request.headers);
	return createRPCContext({ headers: request.headers }, preResolvedAuth);
}

export function createAnonymousOrpcContext(request: Request) {
	return createRPCContext({ headers: request.headers }, ANONYMOUS_AUTH);
}

export function handleAuthenticatedOrpcRequest(
	request: Request,
	handle: OrpcRouteHandler
) {
	return handleOrpcRequest(request, createAuthenticatedOrpcContext, handle);
}

export function handleAnonymousOrpcRequest(
	request: Request,
	handle: OrpcRouteHandler
) {
	return handleOrpcRequest(request, createAnonymousOrpcContext, handle);
}

async function handleOrpcRequest(
	request: Request,
	createContext: (request: Request) => Promise<OrpcContext>,
	handle: OrpcRouteHandler
) {
	const requestId = getRequestId(request);
	try {
		const context = await createContext(request);
		const result = await handle(request, context);
		return (
			result.response ??
			handleAppError({
				error: createError({
					code: "NOT_FOUND",
					message: "Not found",
					status: 404,
				}),
				request,
				requestId,
			})
		);
	} catch (error) {
		if (error instanceof ORPCError) {
			recordORPCError({ code: error.code, message: error.message });
		}
		useLogger().error(
			error instanceof Error ? error : new Error(String(error)),
			{ rpc: "handler" }
		);
		return handleAppError({
			error: createError({
				code: "INTERNAL_SERVER_ERROR",
				message: "An internal server error occurred",
				status: 500,
			}),
			request,
			requestId,
		});
	}
}

function getPreResolvedAuth(headers: Headers): PreResolvedAuth | undefined {
	const resolved = getResolvedAuth(headers);
	if (!resolved) {
		return;
	}

	return {
		session: resolved.session,
		apiKey: resolved.apiKeyResult?.key ?? null,
	};
}
