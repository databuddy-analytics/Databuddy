export const SLACK_SUGGESTED_PROMPTS = [
	{
		message: "Show me our open investigations and what needs attention first.",
		title: "Open investigations",
	},
	{
		message: "Run a new investigation now.",
		title: "Run an investigation",
	},
	{
		message: "Send new investigations to this channel every week.",
		title: "Weekly delivery",
	},
] as const;

export const SLACK_COPY = {
	agentFailure:
		"I couldn't finish that response. Try again in a moment. If it keeps happening, contact your Databuddy organization admin.",
	agentRestarted:
		"I was restarted before I could finish. Mention me again and I'll take another look.",
	agentTimeout:
		"This took longer than expected, so I stopped. Try again with a narrower question.",
	assistantGreeting:
		"I'm in. Show open investigations, run one now, or send new investigations to this channel automatically.",
	autoBindSuccess: "Ready here.",
	bindFailure:
		"I couldn't approve this channel. Check Organization settings → Integrations, then try `/databuddy-bind` again.",
	bindSuccess: "*Ready here.* Mention `@Databuddy` or DM me with a question.",
	channelNotBound:
		"This channel isn't approved for Databuddy yet. Mention `@Databuddy` with a question to connect it, or run `/databuddy-bind`.",
	emptyMention:
		"I'm here. Ask after the mention, like `@Databuddy what changed this week?`",
	help: [
		"*Databuddy in Slack*",
		"Mention `@Databuddy`, DM me, or use the Slack assistant to list, run, configure, or continue investigations. You can also ask about traffic, pages, conversions, campaigns, errors, and product usage.",
		"Databuddy reads messages in approved channels and DMs to understand the current question and thread. Answers posted in a channel are visible to that channel's members.",
		"Channels usually connect on first mention from the workspace where Databuddy is installed. Slack Connect may need approval from the installed side, or Databuddy connected in both workspaces.",
		"Commands: `/databuddy-status`, `/databuddy-help`, `/databuddy-bind`.",
	].join("\n\n"),
	slackConnectExternalUser:
		"Almost there: I'm only installed on the other side of this Slack Connect channel, so I can't answer you here yet.\n\nAsk that side to approve the channel, or connect Databuddy in your own workspace. No analytics were shared.",
	slackConnectNeedsBind:
		"Almost there: this Slack Connect channel needs approval from the workspace where Databuddy is installed. Ask someone on that side to mention me here, or run `/databuddy-bind` from that workspace.",
	missingTeam:
		"I couldn't tell which Slack workspace sent this. Try again from a regular channel or DM.",
	missingWorkspace:
		"I'm not connected to this Slack workspace yet. Connect Slack in Organization settings → Integrations, then mention `@Databuddy` again.",
	missingSlackScopes:
		"I'm missing a Slack permission in this workspace. Reconnect Slack from Databuddy settings so the new scopes are granted, then try again.",
	noAnswer:
		"I didn't get a usable result. Try again, or ask something specific like `traffic for the last 7 days`.",
	processingReaction: "rabbit",
	responseInterrupted:
		"Response interrupted. The information above may be incomplete. Try again before acting on it.",
	streamOpening: "Thinking...",
	statusConnected: "*Workspace connected.*",
	statusFailure:
		"I couldn't check Databuddy's Slack status right now. Try again in a moment.",
	statusReady: "*Ready here.* Mention `@Databuddy` or DM me with a question.",
	suggestedPromptsTitle: "Start with Databuddy",
} as const;
