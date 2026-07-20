import { describe, expect, it, mock } from "bun:test";
import type { AppContext } from "../../config/context";

let observedSignal: AbortSignal | undefined;

mock.module("../../../lib/orpc-server", () => ({
	getServerRPCClient: async () => ({
		links: {
			create: async () => {
				throw new Error("Live RPC should not be called in this test");
			},
			list: async (
				_input: unknown,
				options?: { signal?: AbortSignal }
			) => {
				observedSignal = options?.signal;
				return [];
			},
		},
	}),
}));

const { callRPCProcedure } = await import("./rpc");

const BASE_CONTEXT: AppContext = {
	chatId: "eval-chat",
	currentDateTime: "2026-05-05T00:00:00.000Z",
	requestHeaders: new Headers(),
	timezone: "UTC",
	userId: "eval-user",
	websiteDomain: "databuddy.cc",
	websiteId: "website_123",
};

describe("AI tool RPC helper", () => {
	it("blocks mutation RPC calls in dry-run mode", async () => {
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
	});

	it("blocks detection RPC calls in dry-run mode", async () => {
		const result = await callRPCProcedure(
			"anomalies",
			"detect",
			{ websiteId: "website_123" },
			{ ...BASE_CONTEXT, mutationMode: "dry-run" }
		);

		expect(result).toMatchObject({
			dryRun: true,
			mutationBlocked: true,
			success: false,
		});
	});

	it("forwards cancellation to the ORPC client", async () => {
		const controller = new AbortController();

		await callRPCProcedure(
			"links",
			"list",
			{ websiteId: "website_123" },
			BASE_CONTEXT,
			controller.signal
		);

		expect(observedSignal).toBe(controller.signal);
	});
});
