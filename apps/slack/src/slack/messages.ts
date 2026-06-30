export const SLACK_SUGGESTED_PROMPTS = [
	{
		message:
			"What changed in traffic, conversions, and top pages over the last 7 days?",
		title: "Weekly changes",
	},
	{
		message: "What looks unusual in our analytics today?",
		title: "Find anomalies",
	},
	{
		message:
			"Which referrers and campaigns are driving the best traffic this week?",
		title: "Channel performance",
	},
] as const;

export const SLACK_COPY = {
	agentFailure:
		"I hit a snag before I could answer. Try again in a moment; if it keeps happening, reconnect Slack from Databuddy settings.",
	assistantGreeting:
		"I'm in. Ask me about traffic, pages, referrers, conversions, campaigns, links, flags, or product usage.",
	autoBindSuccess: "Ready here.",
	bindFailure:
		"I couldn't connect this channel. Make sure Slack is connected in Databuddy settings, then try `/bind` again.",
	bindSuccess: "*Ready here.* Mention `@Databuddy` or DM me with a question.",
	channelNotBound:
		"This channel isn't approved for Databuddy yet. Mention `@Databuddy` with a question to connect it, or run `/bind`.",
	emptyMention:
		"I'm here. Ask after the mention, like `@Databuddy what changed this week?`",
	help: [
		"*Databuddy in Slack*",
		"Mention `@Databuddy`, DM me, or use the Slack assistant to ask about traffic, pages, referrers, conversions, campaigns, links, flags, and product usage.",
		"Channels usually connect on first mention from the workspace where Databuddy is installed. Slack Connect may need approval from the installed side, or Databuddy connected in both workspaces.",
		"Commands: `/databuddy-status`, `/databuddy-help`, `/bind`.",
	].join("\n\n"),
	slackConnectExternalUser:
		"Almost there: I'm only installed on the other side of this Slack Connect channel, so I can't answer you here yet.\n\nAsk that side to approve the channel, or connect Databuddy in your own workspace. No analytics were shared.",
	slackConnectNeedsBind:
		"Almost there: this Slack Connect channel needs approval from the workspace where Databuddy is installed. Ask someone on that side to mention me here, or run `/bind` from that workspace.",
	missingTeam:
		"I couldn't tell which Slack workspace sent this. Try again from a regular channel or DM.",
	missingWorkspace:
		"I'm not connected to this Slack workspace yet. Connect Slack in Databuddy organization settings, then mention `@Databuddy` again.",
	missingSlackScopes:
		"I'm missing a Slack permission in this workspace. Reconnect Slack from Databuddy settings so the new scopes are granted, then try again.",
	noAnswer:
		"I reached Databuddy, but no answer came back. Try a narrower question, like `traffic for the last 7 days`.",
	processingReaction: "rabbit",
	streamOpening: "Thinking...",
	statusConnected: "*Workspace connected.*",
	statusFailure:
		"I couldn't check Databuddy's Slack status right now. Try again in a moment.",
	statusReady: "*Ready here.* Mention `@Databuddy` or DM me with a question.",
	suggestedPromptsTitle: "Start with Databuddy",
} as const;
