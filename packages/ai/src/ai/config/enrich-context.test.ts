import { expect, mock, test } from "bun:test";

const billingOwner = mock(async () => ({ planId: "free" }));
const captureError = mock();
mock.module("@databuddy/rpc/billing", () => ({
	getBillingOwner: billingOwner,
}));
mock.module("@databuddy/db", () => ({
	and: mock(),
	count: mock(),
	eq: mock(),
	isNull: mock(),
	db: {
		select: () => ({ from: () => ({ where: async () => [{ value: 0 }] }) }),
	},
}));
mock.module("../../lib/tracing", () => ({ captureError }));
const { enrichAgentContext } = await import("./enrich-context");

test("self-hosted agent context keeps local entity counts without hosted plan lookup", async () => {
	const original = process.env.SELFHOST;
	process.env.SELFHOST = "true";
	try {
		const input = {
			userId: "synthetic-user",
			websiteId: "synthetic-site",
			organizationId: "synthetic-org",
		};
		const local = await enrichAgentContext(input);
		expect(local).toContain("<self_hosted>");
		expect(local).toContain("<goals>0</goals>");
		expect(local).not.toContain("<plan_info>");
		expect(billingOwner).not.toHaveBeenCalled();
		expect(captureError).not.toHaveBeenCalled();
		process.env.SELFHOST = "false";
		expect(await enrichAgentContext(input)).toContain("<plan>free</plan>");
		expect(billingOwner).toHaveBeenCalledTimes(1);
	} finally {
		if (original === undefined) delete process.env.SELFHOST;
		else process.env.SELFHOST = original;
	}
});
