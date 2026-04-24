import type { AppRouter } from "@databuddy/rpc";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { isAbortError } from "@/lib/is-abort-error";

const link = new RPCLink({
	url: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/rpc`,
	fetch: (url, options) =>
		fetch(url, {
			...options,
			credentials: "include",
		}),
	interceptors: [
		onError((error) => {
			if (isAbortError(error)) {
				return;
			}
			if (
				error instanceof Error &&
				(error.message.includes("Unexpected token") ||
					error.message.includes("JSON") ||
					error.message.includes("<!DOCTYPE"))
			) {
				return;
			}
			console.error("oRPC error:", error);
		}),
	],
});

const client: RouterClient<AppRouter> = createORPCClient(link);

const FIVE_MINUTES = 5 * 60 * 1000;

export const orpc = createTanstackQueryUtils(client, {
	experimental_defaults: {
		websites: {
			list: { queryOptions: { staleTime: FIVE_MINUTES } },
		},
		uptime: {
			listSchedules: { queryOptions: { staleTime: FIVE_MINUTES } },
		},
		autocomplete: {
			get: { queryOptions: { staleTime: FIVE_MINUTES } },
		},
		featureInvite: {
			checkAccess: {
				queryOptions: { staleTime: FIVE_MINUTES, retry: false },
			},
		},
	},
});
