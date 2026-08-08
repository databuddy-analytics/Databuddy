import type { HomeView, KnownBlock } from "@slack/web-api";
import { SLACK_SUGGESTED_PROMPTS } from "@/slack/messages";

const DASHBOARD_URL = "https://app.databuddy.cc";
const MAX_HOME_SITES = 10;

export interface ConnectedSite {
	domain: string;
	name: string | null;
}

const QUICK_ACTIONS = [
	{ text: "Open dashboard", url: DASHBOARD_URL, style: "primary" as const },
	{ text: "Investigations", url: `${DASHBOARD_URL}/insights` },
	{ text: "Your websites", url: `${DASHBOARD_URL}/websites` },
];

function connectedSitesBlock(sites: ConnectedSite[]): KnownBlock | null {
	if (sites.length === 0) {
		return null;
	}
	const lines = sites
		.slice(0, MAX_HOME_SITES)
		.map((site) =>
			site.name ? `• *${site.name}* — ${site.domain}` : `• ${site.domain}`
		)
		.join("\n");
	return {
		type: "section",
		text: { type: "mrkdwn", text: `*Your connected sites*\n${lines}` },
	};
}

export function buildAppHomeView(sites: ConnectedSite[] = []): HomeView {
	const prompts = SLACK_SUGGESTED_PROMPTS.map(
		(prompt) => `• ${prompt.message}`
	).join("\n");
	const sitesBlock = connectedSitesBlock(sites);

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
			...(sitesBlock ? [sitesBlock] : []),
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
