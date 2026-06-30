import { describe, expect, it } from "bun:test";
import { getSlackChannelMentionPolicy } from "@/slack/channel-policy";
import type { SlackAgentClient } from "@/slack/types";

const logger = {
	warn: () => undefined,
};

function createPolicyClient(
	info: SlackAgentClient["conversations"]["info"]
): Pick<SlackAgentClient, "conversations"> {
	return {
		conversations: {
			history: async () => ({ ok: true, messages: [] }),
			info,
			replies: async () => ({ ok: true, messages: [] }),
		},
	};
}

describe("Slack channel mention policy", () => {
	it("auto-binds internal channels", async () => {
		const policy = await getSlackChannelMentionPolicy({
			channelId: "C123",
			client: createPolicyClient(
				async () => ({
					channel: {
						is_ext_shared: false,
						is_org_shared: false,
						name: "growth",
					},
					ok: true,
				})
			),
			logger,
		});

		expect(policy).toMatchObject({
			autoBind: true,
			channelName: "growth",
			isExtShared: false,
			reason: "internal",
		});
	});

	it("auto-binds Slack Connect channels after an installed-workspace mention", async () => {
		const policy = await getSlackChannelMentionPolicy({
			channelId: "C123",
			client: createPolicyClient(
				async () => ({
					channel: {
						is_ext_shared: true,
						name: "partner-launch",
					},
					ok: true,
				})
			),
			logger,
		});

		expect(policy).toMatchObject({
			autoBind: true,
			isExtShared: true,
			reason: "slack_connect",
		});
	});

	it("reports missing scopes separately from channel binding", async () => {
		const policy = await getSlackChannelMentionPolicy({
			channelId: "C123",
			client: createPolicyClient(
				async () => {
					throw { data: { error: "missing_scope" } };
				}
			),
			logger,
		});

		expect(policy).toMatchObject({
			autoBind: false,
			errorCode: "missing_scope",
			reason: "missing_scope",
		});
	});

	it("fails closed when Slack channel lookup is unavailable", async () => {
		const policy = await getSlackChannelMentionPolicy({
			channelId: "C123",
			client: createPolicyClient(
				async () => {
					throw { data: { error: "ratelimited" } };
				}
			),
			logger,
		});

		expect(policy).toMatchObject({
			autoBind: false,
			errorCode: "ratelimited",
			reason: "lookup_failed",
		});
	});
});
