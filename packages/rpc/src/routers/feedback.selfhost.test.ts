import { expect, mock, test } from "bun:test";
import { createProcedureClient, os } from "@orpc/server";
import type { Context } from "../orpc";
import { getAutumn } from "../lib/autumn-client";

const transaction = mock(() => {
	throw new Error("Unexpected credit mutation");
});
const billingOwner = mock(async () => "synthetic-owner");
mock.module("@databuddy/db", () => ({
	and: mock(),
	desc: mock(),
	eq: mock(),
	sql: mock(),
	withTransaction: transaction,
}));
mock.module("@databuddy/redis/rate-limit", () => ({ ratelimit: {} }));
mock.module("@databuddy/services/feedback", () => ({ submitFeedback: mock() }));
mock.module("../utils/billing", () => ({ getBillingCustomerId: billingOwner }));
const procedure = os.$context<Context>();
mock.module("../orpc", () => ({
	sessionProcedure: procedure,
	trackedSessionProcedure: procedure,
}));
const { feedbackRouter } = await import("./feedback");

test("self-hosted rewards stop before credit mutation, and copied billing keys stay disabled", async () => {
	const original = process.env;
	process.env = {
		...original,
		SELFHOST: "false",
		AUTUMN_SECRET_KEY: "synthetic-stale-key",
	};
	try {
		getAutumn();
		getAutumn({ strict: true });
		process.env.SELFHOST = "true";
		expect(() => getAutumn()).toThrow("disabled");
		expect(() => getAutumn({ strict: true })).toThrow("disabled");
		const redeem = createProcedureClient(feedbackRouter.redeemCredits, {
			context: {
				user: { id: "synthetic-user" },
				organizationId: "synthetic-org",
			} as Context,
		});
		await expect(redeem({ tierIndex: 0 })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(transaction).not.toHaveBeenCalled();
		expect(billingOwner).not.toHaveBeenCalled();
	} finally {
		process.env = original;
	}
});
