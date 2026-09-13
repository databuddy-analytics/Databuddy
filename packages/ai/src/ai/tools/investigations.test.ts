import { describe, expect, it } from "bun:test";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { z } from "zod";
import type { AppContext } from "../config/context";
import {
	createInvestigationTools,
	investigationActionSchema,
	runInvestigationAction,
} from "./investigations";

const tools = createInvestigationTools();
const schema = tools.configure_investigations.inputSchema;

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

	it.each([
		{ action: "run" },
		{ action: "configure", frequency: "daily" },
		{ action: "configure", frequency: "weekly" },
		{ action: "configure", channelAction: "add", channelId: "C012345678" },
	] as const)("discloses completed-unit pricing before %j", async (input) => {
		const execute = tools.configure_investigations.execute;
		if (!execute) throw new Error("Missing native tool executor");
		const preview = previewSchema.parse(
			await execute(schema.parse(input), options)
		);
		expect(preview.billing).toContain(INVESTIGATION_USAGE.description);
		expect(preview.billing).toContain("fixed-price investigation billing");
		expect(preview.billing).toContain("several signals");
		expect(preview.billing).toContain("multiple investigations");
		expect(preview.billing).toContain("Additional usage is billed monthly when overage is enabled");
		expect(preview.billing).toContain("Existing legacy billing terms remain");
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
		const execute = tools.configure_investigations.execute;
		if (!execute) throw new Error("Missing native tool executor");
		const preview = previewSchema.parse(
			await execute(schema.parse({ action: "run" }), {
				...options,
				experimental_context: {
					...options.experimental_context,
					defaultWebsiteId: null,
				},
			})
		);
		expect(preview.scope).toBe("All websites in this organization");
		expect(preview.billing).toContain("multiple investigations");
	});

	it.each([
		{ action: "configure", frequency: "off" },
		{ action: "configure", timezone: "Europe/Berlin" },
		{ action: "configure", channelAction: "remove", channelId: "C012345678" },
	] as const)("does not present %j as starting paid analysis", async (input) => {
		const execute = tools.configure_investigations.execute;
		if (!execute) throw new Error("Missing native tool executor");
		const preview = previewSchema.parse(
			await execute(schema.parse(input), options)
		);
		expect(preview.billing).toBeUndefined();
	});

	it("still delegates confirmed work to the canonical RPC mutation boundary", async () => {
		const execute = tools.configure_investigations.execute;
		if (!execute) throw new Error("Missing native tool executor");
		const result = await execute(
			schema.parse({ action: "run", confirmed: true }),
			options
		);
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
		expect(got).toMatchObject({ action: "get", investigation, timeline: [reply] });
		expect(replied).toMatchObject({ action: "reply", reply });
		expect(replied.message).toContain("status queued");
		expect(replied.message).toContain("included clarification uses saved evidence");
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
