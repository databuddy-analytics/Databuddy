import { describe, expect, it, mock } from "bun:test";
import { ORPCError, os } from "@orpc/server";
import { z } from "zod";
import type { AppContext } from "../../config/context";

let observedSignal: AbortSignal | undefined;

const createRPCContext = mock(
	async (
		opts: { headers: Headers },
		serviceAuth?: AppContext["serviceAuth"]
	) => ({
		...opts,
		serviceAuth,
	})
);
const procedure = os.$context<Awaited<ReturnType<typeof createRPCContext>>>();

mock.module("@databuddy/rpc", () => ({
	createRPCContext,
	appRouter: {
		links: {
			create: procedure.handler(() => {
				throw new ORPCError("FORBIDDEN");
			}),
			list: procedure
				.input(z.object({ websiteId: z.string() }))
				.handler(({ context, path, signal }) => {
					observedSignal = signal;
					return { context, path };
				}),
		},
	},
}));

const { callRPCProcedure } = await import("./rpc");

const BASE_CONTEXT: AppContext = {
	chatId: "eval-chat",
	currentDateTime: "2026-05-05T00:00:00.000Z",
	requestHeaders: new Headers(),
	timezone: "UTC",
	userId: "eval-user",
	websiteDomain: "example.com",
	websiteId: "website_123",
};

describe("AI tool RPC helper", () => {
	it("blocks mutation RPC calls in dry-run mode", async () => {
		const callsBefore = createRPCContext.mock.calls.length;
		const result = await callRPCProcedure(
			"links",
			"create",
			{ organizationId: "org_eval" },
			{ ...BASE_CONTEXT, mutationMode: "dry-run" }
		);

		expect(result).toMatchObject({
			dryRun: true,
			mutationBlocked: true,
			success: false,
		});

		const reply = await callRPCProcedure(
			"insights",
			"reply",
			{ insightId: "case-1" },
			{ ...BASE_CONTEXT, mutationMode: "dry-run" }
		);
		expect(reply).toMatchObject({ dryRun: true, mutationBlocked: true });
		expect(createRPCContext).toHaveBeenCalledTimes(callsBefore);
	});

	it("preserves the full procedure path, authentication context, and cancellation", async () => {
		const controller = new AbortController();
		const serviceAuth = { apiKey: null, session: null };

		const result = await callRPCProcedure(
			"links",
			"list",
			{ websiteId: "website_123" },
			{ ...BASE_CONTEXT, serviceAuth },
			controller.signal
		);

		expect(result).toEqual({
			context: { headers: BASE_CONTEXT.requestHeaders, serviceAuth },
			path: ["links", "list"],
		});
		expect(observedSignal).toBe(controller.signal);
	});

	it.each([
		["missing", "list", "Router missing not found"],
		["links", "missing", "Procedure links.missing not found or not callable."],
		["links", "create", "You don't have permission to access this resource."],
		["links", "list", "Invalid request: Input validation failed"],
	])("preserves the error for %s.%s", async (router, method, message) => {
		await expect(
			callRPCProcedure(router, method, {}, BASE_CONTEXT)
		).rejects.toThrow(message);
	});
});
