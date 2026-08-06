import type { HomeView } from "@slack/web-api";
import { SLACK_SUGGESTED_PROMPTS } from "@/slack/messages";

const DASHBOARD_URL = "https://app.databuddy.cc";

const QUICK_ACTIONS = [
	{ text: "Open dashboard", url: DASHBOARD_URL, style: "primary" as const },
	{ text: "Investigations", url: `${DASHBOARD_URL}/insights` },
	{ text: "Your websites", url: `${DASHBOARD_URL}/websites` },
];

export function buildAppHomeView(): HomeView {
	const prompts = SLACK_SUGGESTED_PROMPTS.map(
		(prompt) => `• ${prompt.message}`
	).join("\n");

	return {
		type: "home",
		blocks: [
			{
				type: "header",
				text: { type: "plain_text", text: "Databuddy" },
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: "Ask about your analytics right here in Slack — traffic, pages, conversions, campaigns, errors, and product usage. Mention *@Databuddy*, send a direct message, or use the assistant.",
				},
			},
			{
				type: "actions",
				elements: QUICK_ACTIONS.map((action) => ({
					type: "button",
					text: { type: "plain_text", text: action.text },
					url: action.url,
					...(action.style ? { style: action.style } : {}),
				})),
			},
			{ type: "divider" },
			{
				type: "section",
				text: { type: "mrkdwn", text: "*Try asking*" },
			},
			{
				type: "section",
				text: { type: "mrkdwn", text: prompts },
			},
			{ type: "divider" },
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: "Commands: `/databuddy-status`   `/databuddy-help`   `/databuddy-bind`",
					},
				],
			},
		],
	};
}
