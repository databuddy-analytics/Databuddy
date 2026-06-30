import { describe, expect, it } from "bun:test";
import type { SlackAgentRun, SlackRunContext } from "@/agent/agent-client";

let capturedSharedAgentOptions: Record<string, unknown> | null = null;

import {
	createSlackConversationId,
	createSlackMemoryUserId,
	DatabuddyAgentClient,
	formatSlackAgentInput,
} from "./agent-client";

function expectCapturedSharedAgentOptions(): Record<string, unknown> {
	if (!capturedSharedAgentOptions) {
		throw new Error("Expected streamDatabuddyAgent to be called");
	}
	return capturedSharedAgentOptions;
}

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

	it("creates stable Slack-user memory ids", () => {
		expect(
			createSlackMemoryUserId({
				channelId: "C123",
				messageTs: "171234.567",
				teamId: "T123",
				text: "hello",
				threadTs: "171234.000",
				trigger: "app_mention",
				userId: "U123",
			})
		).toBe("slack-T123-U123");
	});

	it("passes Slack user-scoped memory identity to the shared agent", async () => {
		capturedSharedAgentOptions = null;
		const client = new DatabuddyAgentClient(
			{
				resolve: async () => ({
					agentApiKeySecret: "dbdy_secret",
					organizationId: "org_123",
					teamId: "T123",
				}),
			},
			{
				async *stream(_run, _context, options) {
					capturedSharedAgentOptions = {
						...options,
						actor: {
							type: "api_key_secret",
							userId: null,
						},
						input: formatSlackAgentInput(_run),
						memoryUserId: createSlackMemoryUserId(_run),
					};
					yield "Done";
				},
			}
		);

		const chunks: string[] = [];
		for await (const chunk of client.stream({
			channelId: "C123",
			teamId: "T123",
			text: "say something mean about <@U999>",
			threadTs: "171234.000",
			trigger: "thread_follow_up",
			userId: "U456",
		})) {
			chunks.push(chunk);
		}

		expect(chunks).toEqual(["Done"]);
		const captured = expectCapturedSharedAgentOptions();
		expect(captured.memoryUserId).toBe("slack-T123-U456");
		expect(String(captured.input)).toContain("current_speaker: <@U456>");
		expect(String(captured.input)).toContain(
			"current_speaker_memory_scope: slack-T123-U456"
		);
		expect(String(captured.input)).toContain(
			"other_people_mentioned_in_latest_message: <@U999>"
		);
		expect(String(captured.input)).toContain(
			"mentioned users are subjects/addressees, not the speaker"
		);
		expect(String(captured.input)).toContain(
			"Slack replies default to 1-3 short sentences"
		);
		expect(captured.actor).toMatchObject({
			type: "api_key_secret",
			userId: null,
		});
	});

	it("passes resolved org integration context to the shared Databuddy agent runner", async () => {
		const captured: {
			context?: SlackRunContext;
			run?: SlackAgentRun;
		} = {};
		const client = new DatabuddyAgentClient(
			{
				resolve: async () => ({
					agentApiKeySecret: "dbdy_secret",
					organizationId: "org_123",
					teamId: "T123",
				}),
			},
			{
				async *stream(run, context) {
					captured.run = run;
					captured.context = context;
					yield "Done";
				},
			}
		);

		const answer = await client.runToText({
			channelId: "C123",
			teamId: "T123",
			text: "Summarize traffic",
			trigger: "direct_message",
			userId: "U123",
		});

		expect(answer).toBe("Done");
		expect(captured.run?.text).toBe("Summarize traffic");
		expect(captured.context).toEqual({
			agentApiKeySecret: "dbdy_secret",
			organizationId: "org_123",
			teamId: "T123",
		});
	});

	it("passes through chunks from the shared Databuddy agent runner", async () => {
		const client = new DatabuddyAgentClient(
			{
				resolve: async () => ({
					agentApiKeySecret: "dbdy_secret",
					organizationId: "org_123",
					teamId: "T123",
				}),
			},
			{
				async *stream() {
					yield "Hello ";
					yield "from stream";
				},
			}
		);

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

		expect(chunks).toEqual(["Hello ", "from stream"]);
	});

	it("formats a single Slack message with the current speaker", () => {
		const input = formatSlackAgentInput({
			channelId: "C123",
			messageTs: "171234.568",
			teamId: "T123",
			text: "what is my name?",
			threadTs: "171234.000",
			trigger: "thread_follow_up",
			userId: "U2",
		});

		expect(input).toContain("<slack_message_context>");
		expect(input).toContain("current_speaker: <@U2>");
		expect(input).toContain("current_speaker_memory_scope: slack-T123-U2");
		expect(input).toContain("<slack_latest_message>");
		expect(input).toContain("author: <@U2>");
		expect(input).toContain("author_memory_scope: slack-T123-U2");
		expect(input).toContain("what is my name?");
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

		expect(input).toContain("current_speaker: <@U2>");
		expect(input).toContain("current_speaker_memory_scope: slack-T123-U2");
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

		const answer = await client.runToText({
			channelId: "C123",
			teamId: "T123",
			text: "Summarize traffic",
			trigger: "direct_message",
			userId: "U123",
		});

		expect(answer).toBe(
			"I'm not connected to this Slack workspace yet. Connect Slack in Databuddy organization settings, then mention `@Databuddy` again."
		);
	});
});
