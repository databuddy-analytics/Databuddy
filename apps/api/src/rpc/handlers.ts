import {
	appRouter,
	createAbortSignalInterceptor,
	createRPCContext,
	recordORPCError,
} from "@databuddy/rpc";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { useLogger } from "evlog/elysia";
import { getResolvedAuth } from "@/lib/auth-wide-event";
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
	try {
		const context = await createContext(request);
		const result = await handle(request, context);
		return result.response ?? new Response("Not Found", { status: 404 });
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
