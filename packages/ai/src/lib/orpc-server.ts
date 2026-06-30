import type { AppRouter, PreResolvedAuth } from "@databuddy/rpc";
import { appRouter, createRPCContext } from "@databuddy/rpc";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";

export async function getServerRPCClient(
	headers: Headers,
	preResolved?: PreResolvedAuth
): Promise<RouterClient<AppRouter>> {
	const rpcContext = await createRPCContext({ headers }, preResolved);

	const client = {} as RouterClient<AppRouter>;

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
