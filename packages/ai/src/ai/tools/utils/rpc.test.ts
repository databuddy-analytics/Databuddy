import { describe, expect, it, mock } from "bun:test";
import type { AppContext } from "../../config/context";

mock.module("../../../lib/orpc-server", () => ({
	getServerRPCClient: async () => ({
		links: {
			create: async () => {
				throw new Error("Live RPC should not be called in this test");
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
	});
});
