import "@databuddy/test/env";
import { afterEach, expect, it, mock, spyOn } from "bun:test";
import { db } from "@databuddy/db";
import * as redis from "@databuddy/redis";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { resumeInsightReply } from "./resume";
import { createEvidenceSnapshot } from "./evidence-snapshot";

const signal: InvestigationSignal = {
	signalKey: "funnel:signup",
	entity: { type: "funnel", id: "signup", label: "Signup" },
	metric: {
		label: "Completed visitors",
		current: 20,
		previous: 100,
		format: "number",
	},
	changePercent: -80,
	severity: "warning",
	sentiment: "negative",
	period: {
		current: { from: "2026-09-05", to: "2026-09-11" },
		previous: { from: "2026-08-29", to: "2026-09-04" },
	},
};
const outcome: InvestigationOutcome = {
	title: "Signup changed",
	summary: "Cause is unknown.",
	rootCause: null,
	impact: null,
	evidence: ["20 completed visitors."],
	publish: false,
	next: { type: "resolve", reason: "No repair is established." },
};
const snapshot = createEvidenceSnapshot({
	organizationId: "example-org",
	websiteId: "example-site",
	capturedAt: "2026-09-12T00:00:00.000Z",
	signal,
	evidence: [],
	descriptions: {},
	reads: [],
});
const trigger = {
	authorName: "Example teammate",
	authorId: "example-user",
	body: "Explain the original result",
	intent: "clarification",
	sourceObservationId: "original-observation",
	createdAt: new Date("2026-09-13"),
	integrations: null,
	organizationId: "example-org",
	slackDelivery: null,
	status: "queued",
	subjectKey: signal.signalKey,
	timezone: "UTC",
	websiteDomain: "example.com",
	websiteId: "example-site",
	websiteName: "Example",
};
function query<T>(value: T) {
	const q = {
		from: () => q,
		innerJoin: () => q,
		leftJoin: () => q,
		where: () => q,
		orderBy: () => q,
		limit: () => q,
		for: () => q,
		set: (_value: unknown) => q,
		returning: () => q,
		then: (
			resolve: (value: T) => unknown,
			reject?: (error: unknown) => unknown
		) => Promise.resolve(value).then(resolve, reject),
	};
	return q;
}
const dbOriginals = {
	select: db.select,
	update: db.update,
	insert: db.insert,
	transaction: db.transaction,
};
function replaceDb<K extends keyof typeof dbOriginals>(
	name: K,
	implementation: (typeof dbOriginals)[K]
) {
	db[name] = implementation as never;
	return implementation;
}
afterEach(() => {
	for (const key of Object.keys(dbOriginals) as (keyof typeof dbOriginals)[])
		db[key] = dbOriginals[key] as never;
	mock.restore();
});
it("resumes an anchored clarification without refresh, business reads, investigation, case writes or observations", async () => {
	const oldHistory = Array.from({ length: 12 }, (_, index) => ({
		body: `Question ${index}`,
		assistantText: `Saved answer ${index}`,
	}));
	const reads = [
		[trigger],
		[{ id: "case-1", status: "open", createdAt: new Date("2026-09-01") }],
		[{ id: "original-observation", snapshot, outcome, signal }],
		oldHistory,
		[{ id: "example-site" }],
	];
	replaceDb("select", mock(() => query(reads.shift() ?? [])) as never);
	const updates: unknown[] = [];
	replaceDb(
		"update",
		mock((table) => {
			updates.push(table);
			return query([{ id: "reply-1" }]);
		}) as never
	);
	const inserted = mock(() => {
		throw new Error("must not insert an observation");
	});
	replaceDb("insert", inserted as never);
	replaceDb("transaction", mock(async (body) => body(db)) as never);
	spyOn(redis, "invalidateInsightsCachesForOrganization").mockResolvedValue(
		undefined
	);
	const forbidden = mock(async () => {
		throw new Error("new external work must not run");
	});
	const clarify = mock(async (input) => {
		expect(input.snapshot).toEqual(snapshot);
		expect(input.history).toHaveLength(12);
		expect(input.history[0].assistantText).toBe("Saved answer 11");
		return {
			text: "This explains the original saved result.",
			modelId: "openai/gpt-5.6-luna",
			usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
		};
	});
	const result = await resumeInsightReply(
		"reply-1",
		forbidden,
		forbidden,
		forbidden,
		{
			loadCurrentBusinessScope: forbidden,
			loadBusinessProfile: forbidden,
			recallBusinessContext: forbidden,
		},
		clarify
	);
	expect(result).toBe("succeeded");
	expect(forbidden).not.toHaveBeenCalled();
	expect(inserted).not.toHaveBeenCalled();
	expect(reads).toHaveLength(0);
	const { insightReplies } = await import("@databuddy/db/schema");
	expect(updates).toEqual([insightReplies, insightReplies]);
});
it("rejects a cross-tenant snapshot before any clarification generation", async () => {
	const reads = [
		[trigger],
		[{ id: "case-1", status: "open", createdAt: new Date("2026-09-01") }],
		[
			{
				id: "original-observation",
				snapshot: { ...snapshot, organizationId: "other-org" },
				outcome,
				signal,
			},
		],
	];
	replaceDb("select", mock(() => query(reads.shift() ?? [])) as never);
	replaceDb("update", mock(() => query([{ id: "reply-1" }])) as never);
	const forbidden = mock(async () => {
		throw new Error("must not run");
	});
	await expect(
		resumeInsightReply(
			"reply-1",
			forbidden,
			forbidden,
			forbidden,
			{
				loadCurrentBusinessScope: forbidden,
				loadBusinessProfile: forbidden,
				recallBusinessContext: forbidden,
			},
			forbidden
		)
	).rejects.toThrow("different investigation");
	expect(forbidden).not.toHaveBeenCalled();
});
it("rejects a new analysis under unconfigured terms before any new work", async () => {
	const billing = await import("./investigation-billing");
	const reads = [
		[{ ...trigger, intent: "analysis" }],
		[{ id: "case-1", status: "open", createdAt: new Date("2026-09-01") }],
	];
	replaceDb("select", mock(() => query(reads.shift() ?? [])) as never);
	replaceDb("update", mock(() => query([{ id: "reply-1" }])) as never);
	spyOn(billing, "resolveInvestigationBilling").mockResolvedValue({
		mode: "unconfigured",
		customerId: null,
	});
	const forbidden = mock(async () => {
		throw new Error("new work must not run");
	});
	await expect(
		resumeInsightReply(
			"reply-1",
			forbidden,
			forbidden,
			forbidden,
			{
				loadCurrentBusinessScope: forbidden,
				loadBusinessProfile: forbidden,
				recallBusinessContext: forbidden,
			},
			forbidden
		)
	).rejects.toThrow("Activate investigation billing");
	expect(forbidden).not.toHaveBeenCalled();
});
it("reserves the explicit reply's stable unit before any refresh or business work", async () => {
	const billing = await import("./investigation-billing");
	const reads = [
		[{ ...trigger, intent: "analysis" }],
		[{ id: "case-1", status: "open", createdAt: new Date("2026-09-01") }],
	];
	replaceDb("select", mock(() => query(reads.shift() ?? [])) as never);
	replaceDb("update", mock(() => query([{ id: "reply-1" }])) as never);
	const order: string[] = [];
	spyOn(billing, "resolveInvestigationBilling").mockImplementation(async () => {
		order.push("terms");
		return { mode: "fixed", customerId: "synthetic-customer" };
	});
	spyOn(billing, "reserveInvestigationCharge").mockImplementation(
		async (input) => {
			order.push("reserve");
			expect(input.operationKey).toBe(JSON.stringify(["reply", "reply-1"]));
			expect(input.startedAt).toEqual(trigger.createdAt);
			throw new Error("Synthetic balance empty");
		}
	);
	const forbidden = mock(async () => {
		throw new Error("new work before reservation");
	});
	await expect(
		resumeInsightReply(
			"reply-1",
			forbidden,
			forbidden,
			forbidden,
			{
				loadCurrentBusinessScope: forbidden,
				loadBusinessProfile: forbidden,
				recallBusinessContext: forbidden,
			},
			forbidden
		)
	).rejects.toThrow("Synthetic balance empty");
	expect(order).toEqual(["terms", "reserve"]);
	expect(forbidden).not.toHaveBeenCalled();
});

it("replays a saved completed analysis by finalizing its original operation without reservation or new work", async () => {
	const billing = await import("./investigation-billing");
	const reads = [
		[
			{
				...trigger,
				status: "succeeded",
				intent: "analysis",
				observationId: "completed-observation",
			},
		],
		[
			{
				insightId: "case-1",
				snapshot: { ...snapshot, completion: "complete" },
			},
		],
	];
	replaceDb("select", mock(() => query(reads.shift() ?? [])) as never);
	const forbidden = mock(async () => {
		throw new Error("A saved reply must not restart work");
	});
	replaceDb("update", forbidden as never);
	replaceDb("insert", forbidden as never);
	spyOn(billing, "resolveInvestigationBilling").mockImplementation(forbidden);
	spyOn(billing, "reserveInvestigationCharge").mockImplementation(forbidden);
	const settle = spyOn(billing, "settleInvestigationCharge").mockResolvedValue(
		undefined
	);
	expect(
		await resumeInsightReply(
			"reply-1",
			forbidden,
			forbidden,
			forbidden,
			{
				loadCurrentBusinessScope: forbidden,
				loadBusinessProfile: forbidden,
				recallBusinessContext: forbidden,
			},
			forbidden
		)
	).toBe("succeeded");
	expect(settle).toHaveBeenCalledTimes(1);
	expect(settle).toHaveBeenCalledWith({
		organizationId: trigger.organizationId,
		websiteId: trigger.websiteId,
		operationKey: JSON.stringify(["reply", "reply-1"]),
		complete: true,
	});
	expect(forbidden).not.toHaveBeenCalled();
	expect(reads).toHaveLength(0);
});
