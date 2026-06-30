import { publicConfig } from "@databuddy/env/public";
import type { AppRouter } from "@databuddy/rpc";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

const link = new RPCLink({
	url: `${publicConfig.urls.api}/rpc`,
});

export const rpcClient = createORPCClient(link) as RouterClient<AppRouter>;
