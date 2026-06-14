import { useLogger } from "evlog/elysia";

export function logOrpcHandlerError(error: unknown) {
	// AbortError (code 20, "The connection was closed") means the client
	// closed the connection — not a server error. Skip ERROR-level logging.
	if (error instanceof Error && error.name === "AbortError") {
		return;
	}
	useLogger().error(error instanceof Error ? error : new Error(String(error)), {
		rpc: "interceptor",
	});
}
