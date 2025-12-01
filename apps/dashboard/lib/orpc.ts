import type { AppRouter } from "@databuddy/rpc";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

declare global {
	// eslint-disable-next-line no-var
	var $client: RouterClient<AppRouter> | undefined;
}

const link = new RPCLink({
	url: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/rpc`,
	fetch: (url, options) =>
		fetch(url, {
			...options,
			credentials: "include",
		}),
	interceptors: [
		onError((error) => {
			console.error("oRPC error:", error);
		}),
	],
});

const client: RouterClient<AppRouter> =
	globalThis.$client ?? createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
