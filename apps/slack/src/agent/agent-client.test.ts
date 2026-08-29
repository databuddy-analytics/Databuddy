import { describe, expect, it } from "bun:test";

import {
	createSlackConversationId,
	DatabuddyAgentClient,
	formatSlackAgentInput,
} from "./agent-client";

describe("Databuddy Slack agent client", () => {
	it("creates stable Slack-scoped conversation ids", () => {
		expect(
			createSlackConversationId({
				channelId: "C123",
				messageTs: "171234.567",
				teamId: "T123",
				text: "hello",
				threadTs: "171234.000",
				trigger: "app_mention",
				userId: "U123",
			})
		).toBe("slack-T123-C123-171234_000");
	});

	it("formats queued Slack follow-ups as an ordered continuation", () => {
		const input = formatSlackAgentInput({
			channelId: "C123",
			followUpMessages: [
				{ messageTs: "171234.568", text: "also check referrers", userId: "U1" },
				{ messageTs: "171234.569", text: "and compare mobile", userId: "U2" },
			],
			teamId: "T123",
			text: "also check referrers\nand compare mobile",
			threadTs: "171234.000",
			trigger: "thread_follow_up",
			userId: "U2",
		});

		expect(input).toContain("slack_channel_id: C123");
		expect(input).toContain("<slack_follow_ups>");
		expect(input).toContain("<slack_follow_up index=\"1\">");
		expect(input).toContain("author: <@U1>");
		expect(input).toContain("author_memory_scope: slack-T123-U1");
		expect(input).toContain("<slack_follow_up index=\"2\">");
		expect(input).toContain("author: <@U2>");
		expect(input).toContain("author_memory_scope: slack-T123-U2");
		expect(input).toContain("</slack_follow_ups>");
	});

	it("explains missing organization context when no Slack installation resolves", async () => {
		const client = new DatabuddyAgentClient({
			resolve: async () => null,
		});

		const chunks: string[] = [];
		for await (const chunk of client.stream({
			channelId: "C123",
			teamId: "T123",
			text: "Summarize traffic",
			trigger: "direct_message",
			userId: "U123",
		})) {
			chunks.push(chunk);
		}

		expect(chunks).toEqual([
			"I'm not connected to this Slack workspace yet. Connect Slack in Organization settings → Integrations, then mention `@Databuddy` again.",
		]);
	});
});
