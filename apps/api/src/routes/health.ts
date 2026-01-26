import { Elysia } from "elysia";

export const health = new Elysia().get("/health", function healthCheck() {
	return Response.json(
		{ status: "ok" },
		{
			headers: { "Content-Type": "application/json" },
		}
	);
});
