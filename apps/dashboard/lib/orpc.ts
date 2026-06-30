import { publicConfig } from "@databuddy/env/public";
import type { AppRouter } from "@databuddy/rpc";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { isDashboardE2E } from "@/lib/e2e-mode";
import { isAbortError } from "@/lib/is-abort-error";

const isE2E = isDashboardE2E;

const link = new RPCLink({
	url: `${publicConfig.urls.api}/rpc`,
	fetch: (request, init) => {
		const headers = new Headers(request.headers);

		if (typeof window !== "undefined") {
			const anonId = localStorage.getItem("did");
			const sessionId = sessionStorage.getItem("did_session");
			if (anonId) {
				headers.set("x-databuddy-anonymous-id", anonId);
			}
			if (sessionId) {
				headers.set("x-databuddy-session-id", sessionId);
			}
		}

		return fetch(new Request(request, { headers }), {
			...init,
			credentials: "include",
		});
	},
	interceptors: [
		onError((error) => {
			if (isE2E || isAbortError(error)) {
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
	},
});
