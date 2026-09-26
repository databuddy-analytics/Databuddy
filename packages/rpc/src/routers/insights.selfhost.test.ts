import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { createProcedureClient, os } from "@orpc/server";
import { rpcError } from "../errors";
import type { Context } from "../orpc";

const transaction = mock(() => {
	throw new Error("Reached transaction");
});
const authorize = mock(async () => undefined);
const enqueue = mock(async () => "queued");
const outcome: InvestigationOutcome = {
	title: "Rename the signup goal",
	summary: "The goal name does not match its event.",
	impact: null,
	rootCause: "The goal has an outdated name.",
	evidence: ["The goal counts signup_completed events."],
	publish: true,
	next: {
		type: "act",
		action: "Rename the goal to Signup completed.",
		target: "Signup goal",
		verification: "The goal name matches its event.",
		execution: { operation: "edit", changes: { name: "Signup completed" } },
	},
};
const signal: InvestigationSignal = {
	signalKey: "goal:synthetic-goal",
	entity: { type: "goal", id: "synthetic-goal", label: "Signup" },
	metric: {
		label: "Signup conversion",
		current: 20,
		previous: 40,
		format: "percent",
	},
	changePercent: -50,
	severity: "warning",
	sentiment: "negative",
	period: {
		current: { from: "2026-01-04", to: "2026-01-10" },
		previous: { from: "2025-12-28", to: "2026-01-03" },
	},
};
const selection = {
	from: () => selection,
	innerJoin: () => selection,
	where: () => selection,
	orderBy: () => selection,
	limit: async () => [
		{
			outcome,
			signal,
			organizationId: "synthetic-org",
			status: "failed",
			subjectKey: "goal:synthetic-goal",
			websiteId: "synthetic-site",
		},
	],
};
const select = mock(() => selection);
mock.module("@databuddy/db", () => ({
	and: mock(),
	desc: mock(),
	eq: mock(),
	inArray: mock(),
	isNull: mock(),
	ne: mock(),
	notExists: mock(),
	sql: mock(),
	db: { select, transaction },
}));
mock.module("@databuddy/redis", () => ({
	cacheable: <T>(fn: T) => fn,
	cacheNamespaces: {},
	enqueueInsightsResume: enqueue,
	getInsightsQueue: mock(),
	insightsResumeJobId: mock(),
}));
const rateLimit = mock(async () => ({ success: true, reset: 0 }));
mock.module("@databuddy/redis/rate-limit", () => ({ ratelimit: rateLimit }));
mock.module("@databuddy/services/business-memory", () => ({
	getWebsiteBusinessScope: mock(),
}));
mock.module("../lib/audit", () => ({ setAuditOrganization: mock() }));
mock.module("../lib/funnels-cache", () => ({ invalidateFunnelsCache: mock() }));
mock.module("../lib/goals-cache", () => ({ invalidateGoalsCache: mock() }));
mock.module("../lib/logger", () => ({
	logger: { error: mock(), warn: mock() },
}));
mock.module("../procedures/with-workspace", () => ({
	withWorkspace: authorize,
}));
mock.module("../utils/billing", () => ({ getBillingCustomerId: mock() }));
const procedure = os.$context<Context>();
mock.module("../orpc", () => ({
	auditedProcedure: procedure,
	auditedSessionProcedure: procedure,
	protectedProcedure: procedure,
	publicProcedure: procedure,
}));
const {
	appendInvestigationReply,
	insightsRouter,
	queueDefinitionChangeRechecks,
} = await import("./insights");
const context = {
	user: { id: "synthetic-user", name: "Team member" },
	organizationId: "synthetic-org",
} as Context;
const retry = createProcedureClient(insightsRouter.retryReply, { context });
const apply = createProcedureClient(insightsRouter.applyAction, { context });
const originalEnv = process.env;

beforeEach(() => {
	process.env = { ...originalEnv, SELFHOST: "true", AI_GATEWAY_API_KEY: "" };
	authorize.mockClear();
	transaction.mockClear();
	enqueue.mockClear();
	select.mockClear();
});
afterEach(() => {
	process.env = originalEnv;
});

test("replies are rate limited per author before writes and queues", async () => {
	process.env.SELFHOST = "false";
	rateLimit.mockResolvedValueOnce({
		success: false,
		reset: Date.now() + 30_000,
	});
	await expect(
		appendInvestigationReply({
			context,
			body: "Check again",
			insightId: "synthetic-insight",
		})
	).rejects.toMatchObject({ code: "RATE_LIMITED" });
	expect(rateLimit).toHaveBeenCalledWith(
		expect.stringMatching(/^insights:reply:synthetic-org:/),
		20,
		60
	);
	expect(transaction).not.toHaveBeenCalled();
	expect(enqueue).not.toHaveBeenCalled();
});

for (const [name, reply] of [
	[
		"normal reply",
		() =>
			appendInvestigationReply({
				context,
				body: "Check again",
				insightId: "synthetic-insight",
			}),
	],
	["retry", () => retry({ replyId: "synthetic-reply" })],
	["apply action", () => apply({ insightId: "synthetic-insight" })],
] as const) {
	test.each([
		undefined,
		"",
		"  ",
	])(`${name} rejects AI credentials %p before writes and queues`, async (key) => {
		if (key === undefined) {
			Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
		} else {
			process.env.AI_GATEWAY_API_KEY = key;
		}
		await expect(reply()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message:
				"Ask your administrator to configure AI before continuing an investigation.",
		});
		expect(authorize).toHaveBeenCalledWith(context, {
			allowCrossOrg: true,
			organizationId: "synthetic-org",
			permissions: ["update"],
			websiteId: "synthetic-site",
		});
		expect(transaction).not.toHaveBeenCalled();
		expect(enqueue).not.toHaveBeenCalled();
	});

	test(`${name} checks permissions before AI configuration`, async () => {
		authorize.mockRejectedValueOnce(rpcError.forbidden());
		await expect(reply()).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(transaction).not.toHaveBeenCalled();
		expect(enqueue).not.toHaveBeenCalled();
	});

	test(`${name} keeps hosted behavior and configured self-hosted access`, async () => {
		process.env.SELFHOST = "false";
		await expect(reply()).rejects.toThrow("Reached transaction");
		process.env.SELFHOST = "true";
		process.env.AI_GATEWAY_API_KEY = "synthetic-key";
		await expect(reply()).rejects.toThrow("Reached transaction");
		expect(transaction).toHaveBeenCalledTimes(2);
	});
}

test("ordinary definition edits skip AI rechecks when self-hosted AI is unconfigured", async () => {
	await queueDefinitionChangeRechecks({
		definitionId: "synthetic-goal",
		type: "goal",
		websiteId: "synthetic-site",
	});
	expect(select).not.toHaveBeenCalled();
	expect(transaction).not.toHaveBeenCalled();
	expect(enqueue).not.toHaveBeenCalled();
});
