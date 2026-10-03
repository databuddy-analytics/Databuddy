import { describe, expect, it } from "bun:test";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { generateText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import type { AppContext } from "../config/context";
import {
	createInvestigationTools,
	investigationActionSchema,
	runInvestigationAction,
} from "./investigations";

const tools = createInvestigationTools();
const schema = tools.configure_investigations.inputSchema;
if (!(schema instanceof z.ZodType)) {
	throw new Error("Missing investigation settings schema");
}

const context: AppContext = {
	chatId: "chat-1",
	currentDateTime: "2026-07-20T12:00:00.000Z",
	defaultWebsiteId: "website-1",
	organizationId: "organization-1",
	timezone: "UTC",
	userId: "user-1",
};

const investigation = {
	description: "Checkout failures rose from 2 to 11.",
	id: "investigation-1",
	resolvedReason: null,
	sentiment: "negative" as const,
	severity: "warning" as const,
	status: "open" as const,
	title: "Checkout failures increased",
	websiteDomain: "example.com",
	websiteId: "website-1",
	websiteName: "Example",
};

const reply = {
	author: "Ada",
	body: "This started after the checkout deploy.",
	createdAt: "2026-07-20T12:01:00.000Z",
	id: "reply-1",
	kind: "reply" as const,
	status: "queued" as const,
};

const observation = {
	createdAt: "2026-07-20T11:00:00.000Z",
	entity: { id: "/checkout", label: "Checkout", type: "page" as const },
	id: "observation-1",
	kind: "investigation" as const,
	metric: { current: 11, label: "Checkout failures", previous: 2 },
	outcome: {
		contextSnapshot: {
			capturedAt: "2026-07-20T10:00:00.000Z",
			issues: [],
			sources: [
				{
					content: "Checkout is the main revenue path.",
					id: "organization-profile",
					kind: "organization_profile" as const,
					observedAt: "2026-07-20T10:00:00.000Z",
				},
			],
			status: "ready" as const,
		},
		evidence: ["Checkout failures rose from 2 to 11."],
		next: {
			reason: "The failing release was rolled back.",
			type: "resolve" as const,
		},
		rootCause: null,
		summary: "Failures stayed within one release window.",
		title: "Checkout failures increased",
	},
	period: {
		current: { from: "2026-07-13", to: "2026-07-19" },
		previous: { from: "2026-07-06", to: "2026-07-12" },
	},
};

describe("configure_investigations input", () => {
	it("exposes only status, configure, and run", () => {
		const json = z.toJSONSchema(schema, { io: "input" });

		expect(json).not.toHaveProperty("properties.websiteId");
		expect(json).not.toHaveProperty("properties.cron");
		for (const action of ["status", "configure", "run"]) {
			expect(schema.safeParse({ action }).success).toBe(true);
		}
		for (const action of ["route", "unroute", "reschedule", "test"]) {
			expect(schema.safeParse({ action }).success).toBe(false);
		}
	});

	it("accepts only Off, Daily, and Weekly schedules", () => {
		for (const frequency of ["off", "daily", "weekly"] as const) {
			expect(
				schema.safeParse({
					action: "configure",
					confirmed: false,
					frequency,
				}).success
			).toBe(true);
		}

		for (const frequency of ["hourly", "custom"]) {
			expect(
				schema.safeParse({
					action: "configure",
					confirmed: false,
					frequency,
				}).success
			).toBe(false);
		}
	});

	it("accepts Slack channels but rejects direct messages", () => {
		for (const channelId of ["C012345678", "G012345678"]) {
			expect(
				schema.safeParse({
					action: "configure",
					channelAction: "add",
					channelId,
					confirmed: false,
				}).success
			).toBe(true);
		}

		expect(
			schema.safeParse({
				action: "configure",
				channelAction: "add",
				channelId: "D012345678",
				confirmed: false,
			}).success
		).toBe(false);
	});

	it("rejects invalid timezones", () => {
		expect(
			schema.safeParse({
				action: "configure",
				timezone: "Europe/Berlin",
			}).success
		).toBe(true);
		expect(
			schema.safeParse({ action: "configure", timezone: "Mars/Olympus" })
				.success
		).toBe(false);
	});
});

describe("configure_investigations confirmation preview", () => {
	const previewSchema = z.object({
		confirmationRequired: z.literal(true),
		scope: z.string(),
		billing: z.string().optional(),
	});
	const options = {
		toolCallId: "preview-1",
		messages: [],
		experimental_context: { ...context, mutationMode: "dry-run" },
	};

	async function configure(
		input: unknown,
		appContext = options.experimental_context
	) {
		const result = await generateText({
			model: new MockLanguageModelV3({
				doGenerate: async () => ({
					content: [
						{
							type: "tool-call",
							toolCallId: options.toolCallId,
							toolName: "configure_investigations",
							input: JSON.stringify(input),
						},
					],
					finishReason: { unified: "tool-calls", raw: "tool_calls" },
					usage: {
						inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
						outputTokens: { total: 1, text: 1, reasoning: 0 },
					},
					warnings: [],
				}),
			}),
			prompt: "Preview the requested investigation configuration",
			tools: { configure_investigations: tools.configure_investigations },
			experimental_context: appContext,
		});
		const output = result.toolResults[0];
		if (!output) {
			throw new Error("Investigation settings tool returned no result");
		}
		return output.output;
	}

	it.each([
		{ action: "run" },
		{ action: "configure", frequency: "daily" },
		{ action: "configure", frequency: "weekly" },
		{ action: "configure", channelAction: "add", channelId: "C012345678" },
	] as const)("discloses completed-unit pricing before %j", async (input) => {
		const preview = previewSchema.parse(await configure(input));
		expect(preview.billing).toContain(INVESTIGATION_USAGE.description);
		expect(preview.billing).toContain("fixed-price investigation billing");
		expect(preview.billing).toContain("several signals");
		expect(preview.billing).toContain("multiple investigations");
		expect(preview.billing).toContain(
			"Additional usage is billed monthly when overage is enabled"
		);
		expect(preview.billing).toContain("AI credits pay for Databunny chat");
		expect(preview.billing).toContain(
			"Changing settings does not itself charge"
		);
		expect(preview.scope).toBe(
			input.action === "run"
				? "Website website-1"
				: "All websites in this organization"
		);
	});

	it("discloses organization-wide scope when a run has no selected website", async () => {
		const preview = previewSchema.parse(
			await configure(
				{ action: "run" },
				{
					...options.experimental_context,
					defaultWebsiteId: null,
				}
			)
		);
		expect(preview.scope).toBe("All websites in this organization");
		expect(preview.billing).toContain("multiple investigations");
	});

	it.each([
		{ action: "configure", frequency: "off" },
		{ action: "configure", timezone: "Europe/Berlin" },
		{ action: "configure", channelAction: "remove", channelId: "C012345678" },
	] as const)("does not present %j as starting paid analysis", async (input) => {
		const preview = previewSchema.parse(await configure(input));
		expect(preview.billing).toBeUndefined();
	});

	it("still delegates confirmed work to the canonical RPC mutation boundary", async () => {
		const result = await configure({ action: "run", confirmed: true });
		expect(result).toMatchObject({
			mutationBlocked: true,
			message:
				"Dry-run mode blocked insightGeneration.triggerRun; no data was changed.",
		});
	});
});

describe("investigations", () => {
	it("delegates brief, list, get, reply permissions, and idempotency to canonical RPC", async () => {
		const calls: Array<{ input: unknown; method: string; router: string }> = [];
		const callRpc = async (router: string, method: string, input: unknown) => {
			calls.push({ input, method, router });
			if (method === "brief") {
				return { hasMore: false, insights: [] };
			}
			if (method === "history") {
				return { hasMore: false, insights: [investigation] };
			}
			if (method === "getById") {
				return { canReply: true, insight: investigation, timeline: [reply] };
			}
			return { reply };
		};

		const briefed = await runInvestigationAction(
			{ action: "brief", limit: 5, offset: 1 },
			context,
			undefined,
			callRpc
		);
		const listed = await runInvestigationAction(
			{ action: "list", limit: 10, offset: 2 },
			context,
			undefined,
			callRpc
		);
		const got = await runInvestigationAction(
			{ action: "get", investigationId: "investigation-1" },
			context,
			undefined,
			callRpc
		);
		const replied = await runInvestigationAction(
			{
				action: "reply",
				body: reply.body,
				investigationId: "investigation-1",
				replyId: reply.id,
			},
			context,
			undefined,
			callRpc
		);

		expect(calls).toEqual([
			{
				method: "brief",
				router: "insights",
				input: {
					limit: 5,
					offset: 1,
					organizationId: "organization-1",
					websiteId: "website-1",
				},
			},
			{
				method: "history",
				router: "insights",
				input: {
					limit: 10,
					offset: 2,
					organizationId: "organization-1",
					websiteId: "website-1",
				},
			},
			{
				method: "getById",
				router: "insights",
				input: { insightId: "investigation-1" },
			},
			{
				method: "reply",
				router: "insights",
				input: {
					body: reply.body,
					intent: "clarification",
					insightId: "investigation-1",
					replyId: "reply-1",
				},
			},
		]);
		expect(briefed).toEqual({
			action: "brief",
			hasMore: false,
			insights: [],
		});
		expect(listed).toMatchObject({
			action: "list",
			investigations: [investigation],
		});
		expect(got).toMatchObject({
			action: "get",
			investigation,
			timeline: [reply],
		});
		expect(replied).toMatchObject({ action: "reply", reply });
		expect(replied.message).toContain("status queued");
		expect(replied.message).toContain(
			"included clarification uses saved evidence"
		);
	});

	it("returns observations without their business-context snapshots", async () => {
		const got = await runInvestigationAction(
			{ action: "get", investigationId: "investigation-1" },
			context,
			undefined,
			async () => ({
				canReply: true,
				insight: investigation,
				timeline: [observation, reply],
			})
		);

		expect(got).toMatchObject({
			action: "get",
			timeline: [
				{
					id: observation.id,
					outcome: {
						evidence: observation.outcome.evidence,
						next: observation.outcome.next,
						title: observation.outcome.title,
					},
				},
				reply,
			],
		});
		expect(got).not.toHaveProperty("timeline.0.outcome.contextSnapshot");
	});

	it("requires a stable colon-free reply id", async () => {
		await expect(
			runInvestigationAction(
				{
					action: "reply",
					body: "Context",
					investigationId: "investigation-1",
				},
				context,
				undefined,
				async () => ({ reply })
			)
		).rejects.toThrow("required for reply");
		expect(
			investigationActionSchema.safeParse({
				action: "reply",
				body: "Context",
				investigationId: "investigation-1",
				replyId: "retry:1",
			}).success
		).toBe(false);
	});

	it("returns a dry-run receipt without parsing it as a reply", async () => {
		const result = await runInvestigationAction(
			{
				action: "reply",
				body: "Context",
				investigationId: "investigation-1",
				replyId: "reply-1",
			},
			{ ...context, mutationMode: "dry-run" },
			undefined,
			async () => ({
				dryRun: true,
				message: "No data was changed.",
				mutationBlocked: true,
				success: false,
			})
		);

		expect(result).toEqual({
			action: "reply",
			dryRun: true,
			message: "No data was changed.",
			mutationBlocked: true,
			success: false,
		});
	});
});

describe("read-only investigation tools", () => {
	const readOnly = createInvestigationTools({ readOnly: true });

	it("can only read cases and the automatic investigation settings", () => {
		const cases = readOnly.investigations.inputSchema;
		const settings = readOnly.configure_investigations.inputSchema;
		if (!(cases instanceof z.ZodType && settings instanceof z.ZodType)) {
			throw new Error("Missing read-only investigation schemas");
		}

		for (const action of ["brief", "list", "get"]) {
			expect(cases.safeParse({ action }).success).toBe(true);
		}
		expect(
			cases.safeParse({
				action: "reply",
				body: "Context",
				investigationId: "investigation-1",
				replyId: "reply-1",
			}).success
		).toBe(false);
		expect(settings.safeParse({ action: "status" }).success).toBe(true);
		for (const action of ["configure", "run"]) {
			expect(settings.safeParse({ action, confirmed: true }).success).toBe(
				false
			);
		}
		expect(
			Object.keys(z.toJSONSchema(settings, { io: "input" }).properties ?? {})
		).toEqual(["action"]);
	});
});
