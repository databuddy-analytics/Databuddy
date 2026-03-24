import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
import { parseError } from "evlog";
import { captureError, mergeWideEvent } from "@/lib/tracing";
import { flagsRoute } from "./flags";

export const publicApi = new Elysia({ prefix: "/public" })
	.use(
		cors({
			credentials: false,
			origin: true,
		})
	)
	.options("*", () => new Response(null, { status: 204 }))
	.use(flagsRoute)
	.onError(function handlePublicError({ error, code, set }) {
		const isNotFound = code === "NOT_FOUND";
		mergeWideEvent({
			public_api: true,
			public_error_kind: isNotFound ? "not_found" : "handler_error",
		});
		if (!isNotFound) {
			captureError(error, { public_api: true });
		}

		const errorMessage = error instanceof Error ? error.message : String(error);
		const isDevelopment = process.env.NODE_ENV === "development";
		const parsed = parseError(error);
		const exposeStructured =
			isDevelopment || (parsed.status >= 400 && parsed.status < 500);

		set.status = isNotFound ? 404 : 500;

		return {
			success: false,
			error: isDevelopment ? errorMessage : "An internal server error occurred",
			code: code ?? "INTERNAL_SERVER_ERROR",
			...(exposeStructured && parsed.why != null && parsed.why !== ""
				? { why: parsed.why }
				: {}),
			...(exposeStructured && parsed.fix != null && parsed.fix !== ""
				? { fix: parsed.fix }
				: {}),
			...(exposeStructured && parsed.link != null && parsed.link !== ""
				? { link: parsed.link }
				: {}),
		};
	});
