import type { AppRouter } from "@databuddy/rpc";
import { appRouter, createRPCContext } from "@databuddy/rpc";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";

/**
 * Creates a server-side RPC client for use in API routes.
 * Reuses the same pattern as the dashboard's orpc-server.ts but adapted for server-side context.
 *
 * @param headers - Request headers to forward for authentication and context
 * @returns A typed RPC client instance
 */
export async function getServerRPCClient(
	headers: Headers
): Promise<RouterClient<AppRouter>> {
	const rpcContext = await createRPCContext({ headers });

	// Create a client for each router
	const client = {} as RouterClient<AppRouter>;

	// Build client by creating router clients for each router
	for (const [routerName, router] of Object.entries(appRouter)) {
		if (router && typeof router === "object") {
			const routerClient = createRouterClient(router as any, {
				context: rpcContext,
			});
			(client as Record<string, unknown>)[routerName] = routerClient;
		}
	}

	return client;
}
