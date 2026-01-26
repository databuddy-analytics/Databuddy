import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
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
		const errorMessage = error instanceof Error ? error.message : String(error);
		const isDevelopment = process.env.NODE_ENV === "development";

		set.status = code === "NOT_FOUND" ? 404 : 500;

		return {
			success: false,
			error: isDevelopment ? errorMessage : "An internal server error occurred",
			code: code ?? "INTERNAL_SERVER_ERROR",
		};
	});
