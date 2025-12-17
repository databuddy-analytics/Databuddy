import type { AgentCommand } from "./agent-atoms";

export const AGENT_COMMANDS: AgentCommand[] = [
	// Traffic Analysis
	{
		id: "analyze-traffic",
		command: "/analyze",
		title: "Analyze traffic patterns",
		description: "Deep dive into your traffic data and trends",
		toolName: "analyze_traffic",
		keywords: ["analyze", "traffic", "patterns", "trends", "visitors"],
	},
	{
		id: "analyze-sources",
		command: "/analyze",
		title: "Analyze traffic sources",
		description: "Break down traffic by source and medium",
		toolName: "analyze_sources",
		keywords: ["analyze", "sources", "referrers", "channels", "medium"],
	},
	{
		id: "analyze-conversions",
		command: "/analyze",
		title: "Analyze conversion funnel",
		description: "Identify drop-offs in your conversion funnel",
		toolName: "analyze_funnel",
		keywords: ["analyze", "conversions", "funnel", "drop-off", "goals"],
	},
	// Reports
	{
		id: "report-weekly",
		command: "/report",
		title: "Generate weekly report",
		description: "Create a comprehensive weekly analytics report",
		toolName: "generate_report",
		toolParams: { period: "week" },
		keywords: ["report", "weekly", "summary", "overview"],
	},
	{
		id: "report-monthly",
		command: "/report",
		title: "Generate monthly report",
		description: "Create a detailed monthly performance report",
		toolName: "generate_report",
		toolParams: { period: "month" },
		keywords: ["report", "monthly", "summary", "performance"],
	},
	// Visualizations
	{
		id: "chart-traffic",
		command: "/chart",
		title: "Create traffic chart",
		description: "Visualize traffic trends over time",
		toolName: "create_chart",
		toolParams: { type: "traffic" },
		keywords: ["chart", "traffic", "visualization", "graph", "trend"],
	},
	{
		id: "chart-sources",
		command: "/chart",
		title: "Create sources breakdown",
		description: "Pie chart of traffic sources",
		toolName: "create_chart",
		toolParams: { type: "sources" },
		keywords: ["chart", "sources", "pie", "breakdown"],
	},
	// Show data
	{
		id: "show-top-pages",
		command: "/show",
		title: "Show top pages",
		description: "Display your most visited pages",
		toolName: "get_top_pages",
		keywords: ["show", "top", "pages", "popular", "views"],
	},
	{
		id: "show-events",
		command: "/show",
		title: "Show recent events",
		description: "Display recent tracked events",
		toolName: "get_events",
		keywords: ["show", "events", "recent", "actions", "tracking"],
	},
	{
		id: "show-sessions",
		command: "/show",
		title: "Show active sessions",
		description: "Display currently active user sessions",
		toolName: "get_sessions",
		keywords: ["show", "sessions", "active", "users", "live"],
	},
	// Find/Search
	{
		id: "find-anomalies",
		command: "/find",
		title: "Find traffic anomalies",
		description: "Detect unusual patterns in your data",
		toolName: "find_anomalies",
		keywords: ["find", "anomalies", "unusual", "spikes", "drops"],
	},
	{
		id: "find-insights",
		command: "/find",
		title: "Find actionable insights",
		description: "Discover opportunities to improve",
		toolName: "find_insights",
		keywords: [
			"find",
			"insights",
			"opportunities",
			"improve",
			"recommendations",
		],
	},
	// Compare
	{
		id: "compare-periods",
		command: "/compare",
		title: "Compare time periods",
		description: "Compare metrics between two time periods",
		toolName: "compare_periods",
		keywords: ["compare", "periods", "before", "after", "change"],
	},
];

export function filterCommands(query: string): AgentCommand[] {
	if (!query) {
		return AGENT_COMMANDS;
	}

	const normalizedQuery = query.toLowerCase().trim();

	return AGENT_COMMANDS.filter((cmd) => {
		const matchesCommand = cmd.command.toLowerCase().includes(normalizedQuery);
		const matchesTitle = cmd.title.toLowerCase().includes(normalizedQuery);
		const matchesDescription = cmd.description
			.toLowerCase()
			.includes(normalizedQuery);
		const matchesKeywords = cmd.keywords.some((kw) =>
			kw.includes(normalizedQuery)
		);

		return (
			matchesCommand || matchesTitle || matchesDescription || matchesKeywords
		);
	});
}

export function getToolMessage(toolName: string | null): string | null {
	if (!toolName) {
		return null;
	}

	const messages: Record<string, string> = {
		analyze_traffic: "Analyzing traffic patterns...",
		analyze_sources: "Breaking down traffic sources...",
		analyze_funnel: "Analyzing conversion funnel...",
		generate_report: "Generating report...",
		create_chart: "Creating visualization...",
		get_top_pages: "Fetching top pages...",
		get_events: "Loading events...",
		get_sessions: "Loading sessions...",
		find_anomalies: "Scanning for anomalies...",
		find_insights: "Finding insights...",
		compare_periods: "Comparing periods...",
	};

	return messages[toolName] ?? `Running ${toolName}...`;
}

export function getStatusMessage(status: string | null): string | null {
	if (!status) {
		return null;
	}

	const messages: Record<string, string> = {
		routing: "Routing request...",
		thinking: "Thinking...",
		analyzing: "Analyzing data...",
		searching: "Searching...",
		generating: "Generating response...",
		visualizing: "Creating visualization...",
	};

	return messages[status] ?? null;
}
