import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import { handleAnonymousOrpcRequest } from "./handlers";

vi.mock("evlog/elysia", () => ({
	useLogger: () => ({
		error: () => {},
		warn: () => {},
		info: () => {},
		debug: () => {},
	}),
}));

function testRequest() {
	return new Request("http://localhost/rpc/test");
}

interface RpcErrorPayload {
	code: string;
	success: boolean;
}

async function readErrorPayload(response: Response): Promise<RpcErrorPayload> {
	return (await response.json()) as RpcErrorPayload;
}

describe("handleAnonymousOrpcRequest errors", () => {
	it("preserves the ORPC error status instead of collapsing to 500", async () => {
		const response = await handleAnonymousOrpcRequest(testRequest(), () => {
			throw new ORPCError("NOT_FOUND");
		});

		expect(response.status).toBe(404);
		const body = await readErrorPayload(response);
		expect(body.code).toBe("NOT_FOUND");
		expect(body.success).toBe(false);
	});

	it("preserves unauthorized as 401", async () => {
		const response = await handleAnonymousOrpcRequest(testRequest(), () => {
			throw new ORPCError("UNAUTHORIZED");
		});

		expect(response.status).toBe(401);
	});

	it("keeps 500 for unknown errors", async () => {
		const response = await handleAnonymousOrpcRequest(testRequest(), () => {
			throw new Error("boom");
		});

		expect(response.status).toBe(500);
		const body = await readErrorPayload(response);
		expect(body.code).toBe("INTERNAL_SERVER_ERROR");
	});
});
