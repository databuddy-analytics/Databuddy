import cors from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { Elysia } from "elysia";
import { captureError, mergeWideEvent } from "@databuddy/ai/lib/tracing";
import { handleAppError } from "@/http/errors";
import { agentTelemetryRoute } from "./agent-telemetry";
import { flagsRoute } from "./flags";

export const publicApi = new Elysia({ prefix: "/public" })
	.use(
		serverTiming({
			enabled: true,
			trace: {
				request: true,
				beforeHandle: true,
				handle: true,
				afterHandle: true,
				total: true,
			},
		})
	)
	.use(
		cors({
			credentials: false,
			origin: true,
		})
	)
	.options("*", () => new Response(null, { status: 204 }))
	.use(agentTelemetryRoute)
	.use(flagsRoute)
	.onError(function handlePublicError({ error, code }) {
		const isNotFound = code === "NOT_FOUND";
		mergeWideEvent({
			public_api: true,
			public_error_kind: isNotFound ? "not_found" : "handler_error",
		});
		if (!isNotFound) {
			captureError(error, { public_api: true });
		}

		return handleAppError({ code, error });
	});
