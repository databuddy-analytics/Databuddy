export interface AgentCommand {
	command: string;
	description: string;
	id: string;
	keywords: readonly string[];
	prompt: string;
	title: string;
}

export const AGENT_COMMANDS: readonly AgentCommand[] = [
	{
		id: "analyze-traffic",
		command: "/analyze",
		title: "Analyze traffic patterns",
		description: "Deep dive into recent traffic trends",
		prompt:
			"Analyze my traffic patterns over the last 7 days. Call out any notable spikes, drops, or shifts in source mix, and tell me what's driving the biggest changes.",
		keywords: ["analyze", "traffic", "patterns", "trends", "visitors"],
	},
	{
		id: "analyze-sources",
		command: "/sources",
		title: "Break down traffic sources",
		description: "Where's traffic coming from right now",
		prompt:
			"Break down my traffic sources for the last 7 days — referrers, search, direct, social — and flag any sources that are over- or under-performing vs the prior period.",
		keywords: ["sources", "referrers", "channels", "medium", "acquisition"],
	},
	{
		id: "analyze-funnel",
		command: "/funnel",
		title: "Inspect my funnels",
		description: "Look for drop-offs and weak steps",
		prompt:
			"List my funnels and walk through each one. Point out the steps with the biggest drop-offs and suggest what to investigate next.",
		keywords: ["funnel", "funnels", "conversion", "drop-off", "goals"],
	},
	{
		id: "top-pages",
		command: "/pages",
		title: "Top pages",
		description: "Most-visited pages with context",
		prompt:
			"Show me my top 10 pages by pageviews over the last 7 days, including bounce rate and average time on page. Highlight any pages that stand out.",
		keywords: ["pages", "top", "popular", "content", "views"],
	},
	{
		id: "live",
		command: "/live",
		title: "What's happening now",
		description: "Live sessions and recent activity",
		prompt:
			"Tell me what's happening on the site right now — active sessions, most-viewed pages in the last hour, and any recent events worth knowing about.",
		keywords: ["live", "now", "active", "realtime", "sessions"],
	},
	{
		id: "anomalies",
		command: "/anomalies",
		title: "Find anomalies",
		description: "Detect unusual patterns in the data",
		prompt:
			"Scan my analytics for anomalies over the last 14 days — unusual spikes, drops, or new traffic sources — and rank them by how concerning they are.",
		keywords: ["anomalies", "unusual", "spikes", "drops", "alerts"],
	},
	{
		id: "compare",
		command: "/compare",
		title: "Compare periods",
		description: "Last 7 days vs prior 7 days",
		prompt:
			"Compare my key metrics (visitors, sessions, pageviews, bounce rate, conversion) between the last 7 days and the prior 7 days. Explain what changed and why.",
		keywords: ["compare", "periods", "before", "after", "change", "delta"],
	},
	{
		id: "report",
		command: "/report",
		title: "Weekly report",
		description: "Executive summary of the last week",
		prompt:
			"Generate a concise weekly analytics report: top-line metrics, biggest wins, biggest concerns, and recommended actions for next week.",
		keywords: ["report", "weekly", "summary", "executive", "overview"],
	},
] as const;

export function filterCommands(query: string): readonly AgentCommand[] {
	const normalized = query.toLowerCase().trim();
	if (!normalized) {
		return AGENT_COMMANDS;
	}
	return AGENT_COMMANDS.filter(
		(cmd) =>
			cmd.command.toLowerCase().includes(normalized) ||
			cmd.title.toLowerCase().includes(normalized) ||
			cmd.description.toLowerCase().includes(normalized) ||
			cmd.keywords.some((kw) => kw.includes(normalized))
	);
}
