import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createConfig as createAnalyticsConfig } from "../agents/analytics";
import { createMcpAgentConfig } from "../agents/mcp";
import type { AppContext } from "../config/context";
import {
	createInvestigationTools,
	investigationActionSchema,
	runInvestigationAction,
} from "./investigations";
import { createToolkit } from "./toolkit";

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

describe("investigations", () => {
	it("is native to the dashboard agent", () => {
		const toolkit = createToolkit({ capabilities: ["investigation"] });
		const config = createAnalyticsConfig({
			chatId: "chat-1",
			organizationId: "organization-1",
			timezone: "UTC",
			userId: "user-1",
			websiteId: "website-1",
		});

		expect(toolkit.investigations).toBeDefined();
		expect(toolkit.configure_investigations).toBeDefined();
		expect(config.tools.investigations).toBeDefined();
		expect(config.tools.configure_investigations).toBeDefined();
	});

	it("is native to the Slack agent", () => {
		const config = createMcpAgentConfig({
			apiKey: null,
			organizationId: "organization-1",
			requestHeaders: new Headers(),
			source: "slack",
			userId: "user-1",
		});

		expect(config.tools.investigations).toBeDefined();
		expect(config.tools.configure_investigations).toBeDefined();
	});

	it("is one native list, get, or reply tool", () => {
		expect(Object.keys(tools).sort()).toEqual([
			"configure_investigations",
			"investigations",
		]);
		expect(
			z.toJSONSchema(investigationActionSchema, { io: "input" }).type
		).toBe("object");
		for (const input of [
			{ action: "list" },
			{ action: "get", investigationId: "investigation-1" },
			{
				action: "reply",
				body: "Deployment context",
				investigationId: "investigation-1",
				replyId: "reply-1",
			},
		]) {
			expect(investigationActionSchema.safeParse(input).success).toBe(true);
		}
	});

	it("delegates list, get, reply permissions, and idempotency to canonical RPC", async () => {
		const calls: Array<{ input: unknown; method: string; router: string }> = [];
		const callRpc = async (router: string, method: string, input: unknown) => {
			calls.push({ input, method, router });
			if (method === "history") {
				return { hasMore: false, insights: [investigation] };
			}
			if (method === "getById") {
				return { canReply: true, insight: investigation, timeline: [reply] };
			}
			return { reply };
		};

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
					insightId: "investigation-1",
					replyId: "reply-1",
				},
			},
		]);
		expect(listed).toMatchObject({
			action: "list",
			investigations: [investigation],
		});
		expect(got).toMatchObject({ action: "get", investigation, timeline: [reply] });
		expect(replied).toMatchObject({ action: "reply", reply });
		expect(replied.message).toContain("status queued");
		expect(replied.message).toContain("asynchronously");
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
