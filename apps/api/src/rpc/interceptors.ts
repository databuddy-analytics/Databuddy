import { useLogger } from "evlog/elysia";

export function logOrpcHandlerError(error: unknown) {
	// AbortError (name="AbortError", code=20) means the HTTP client closed the
	// connection before the response was delivered. This is an expected network
	// event (user navigates away, closes tab, mobile sleep) and is not a server
	// fault — swallow it silently instead of creating noisy ERROR incidents.
	if (error instanceof Error && error.name === "AbortError") {
		return;
	}
	useLogger().error(error instanceof Error ? error : new Error(String(error)), {
		rpc: "interceptor",
	});
}
