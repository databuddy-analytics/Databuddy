import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as agentModule from "@databuddy/ai/agent";
import type {
	SlackThreadReplyMessage,
	SlackThreadReplyRelevance,
	SlackThreadReplyRelevanceInput,
} from "@databuddy/ai/agent";
import type { SlackAgentRun } from "@/agent/agent-client";

let capturedModelInput: SlackThreadReplyRelevanceInput | null = null;
let modelDecision: SlackThreadReplyRelevance | null = null;

mock.module("@databuddy/ai/agent", () => ({
	...agentModule,
	classifySlackThreadReplyRelevance: async (
		input: SlackThreadReplyRelevanceInput
	) => {
		capturedModelInput = input;
		return modelDecision;
	},
}));

const { shouldReplyToSlackThreadFollowUp } = await import("./thread-relevance");

const BASE_RUN: SlackAgentRun = {
	channelId: "C123",
	messageTs: "171234.568",
	teamId: "T123",
	text: "",
	threadTs: "171234.000",
	trigger: "thread_follow_up",
	userId: "U123",
};

function createRun(text: string): SlackAgentRun {
	return { ...BASE_RUN, text };
}

async function decide(text: string) {
	return shouldReplyToSlackThreadFollowUp(createRun(text), {
		botUserId: "UBOT",
	});
}

async function decideWithThread(
	text: string,
	threadMessages: SlackThreadReplyMessage[]
) {
	return shouldReplyToSlackThreadFollowUp(createRun(text), {
		botUserId: "UBOT",
		readThreadMessages: async () => threadMessages,
	});
}

describe("Slack thread reply relevance", () => {
	beforeEach(() => {
		capturedModelInput = null;
		modelDecision = null;
	});

	it("lets the model allow the exact short clarification answer from thread context", async () => {
		modelDecision = {
			confidence: 0.92,
			reason: "direct_request",
			shouldReply: true,
		};

		await expect(
			decideWithThread("both", [
				{
					text: "hey <@UBOT> can you tell me my top pages, and tell <@UQAIS> to do a better j*b",
					userId: "U123",
				},
				{
					text: "I see two websites — Databuddy (app.databuddy.cc) and Landing Page (databuddy.cc). Which one's top pages would you like me to pull?",
					userId: "UBOT",
				},
			])
		).resolves.toMatchObject({
			reason: "direct_request",
			shouldReply: true,
			source: "model",
		});
		expect(capturedModelInput).toMatchObject({
			currentUserId: "U123",
			text: "both",
		});
		expect(capturedModelInput?.threadMessages).toHaveLength(2);
	});

	it("falls back to explicit mentions when the model is unavailable", async () => {
		await expect(decide("<@UBOT> what now?")).resolves.toMatchObject({
			reason: "bot_mentioned",
			shouldReply: true,
			source: "fallback",
		});
	});

	it("falls back conservatively for unmentioned replies when the model is unavailable", async () => {
		await expect(decide("databuddy is gonna make qais mad")).resolves.toMatchObject({
			reason: "ambiguous",
			shouldReply: false,
			source: "fallback",
		});
	});
});
