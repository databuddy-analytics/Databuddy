import { describe, expect, it } from "bun:test";
import { createSlackConversationContext } from "@/slack/slack-context";
import type { SlackAgentClient } from "@/slack/types";

describe("Slack conversation context", () => {
	it("reads the current Slack thread through conversations.replies", async () => {
		const calls: Array<{ method: string; options: unknown }> = [];
		const client: Pick<SlackAgentClient, "conversations"> = {
			conversations: {
				history: async (options) => {
					calls.push({ method: "conversations.history", options });
					return { ok: true, messages: [] };
				},
				info: async () => ({ ok: true }),
				replies: async (options) => {
					calls.push({ method: "conversations.replies", options });
					return {
						ok: true,
						has_more: false,
						messages: [
							{
								text: "launch is Friday",
								thread_ts: "171234.000",
								ts: "171234.001",
								user: "U123",
							},
						],
					};
				},
			},
		};
		const context = createSlackConversationContext(client, {
			channelId: "C123",
			messageTs: "171234.001",
			teamId: "T123",
			text: "what did we decide?",
			threadTs: "171234.000",
			trigger: "app_mention",
			userId: "U123",
		});

		const result = await context?.readCurrentThread?.();

		expect(calls[0]).toEqual({
			method: "conversations.replies",
			options: expect.objectContaining({
				channel: "C123",
				ts: "171234.000",
			}),
		});
		expect(result).toEqual({
			channelId: "C123",
			hasMore: false,
			messages: [
				{
					text: "launch is Friday",
					threadTs: "171234.000",
					ts: "171234.001",
					userId: "U123",
				},
			],
			threadTs: "171234.000",
		});
	});

	it("shares one thread read across callers", async () => {
		let replyCalls = 0;
		const client: Pick<SlackAgentClient, "conversations"> = {
			conversations: {
				history: async () => ({ ok: true, messages: [] }),
				info: async () => ({ ok: true }),
				replies: async () => {
					replyCalls += 1;
					await Promise.resolve();
					return { ok: true, messages: [] };
				},
			},
		};
		const context = createSlackConversationContext(client, {
			channelId: "C123",
			messageTs: "171234.001",
			teamId: "T123",
			text: "yes",
			threadTs: "171234.000",
			trigger: "thread_follow_up",
			userId: "U123",
		});

		await context?.readCurrentThread?.();
		await context?.readCurrentThread?.();

		expect(replyCalls).toBe(1);
	});
});
