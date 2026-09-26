"use client";

import { EmptyState } from "@databuddy/ui";
import {
	BrainIcon,
	FileTextIcon,
	RobotIcon,
	UsersIcon,
} from "@databuddy/ui/icons";
import { dayjs } from "@databuddy/ui";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { StatCard } from "@/components/analytics/stat-card";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import { DataTable } from "@/components/table/data-table";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import {
	type AgentPageRow,
	type AgentRow,
	agentColumns,
	PURPOSES,
	pageColumns,
} from "./columns";

interface AgentSummary {
	agents: number;
	ai_sessions: number;
	hits: number;
	pages: number;
	sessions: number;
}

interface AgentTimeSeriesRow {
	date: string;
	hits: number;
	on_demand: number;
	search_index: number;
	training: number;
}

type AgentPageResult = Omit<AgentPageRow, "name"> & { page: string };

function percentOf(part: number, total: number): string {
	return total > 0 ? `${Math.round((part / total) * 100)}%` : "0%";
}

export default function AgentsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const { dateRange } = useDateFilters();

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		[
			{ id: "agent-summary", parameters: ["ai_agent_summary"] },
			{ id: "agent-series", parameters: ["ai_agent_time_series"] },
			{ id: "agent-tables", parameters: ["ai_agent_pages", "ai_agents"] },
		]
	);

	const summary = (
		getDataForQuery("agent-summary", "ai_agent_summary") as AgentSummary[]
	)?.[0];
	const series =
		(getDataForQuery(
			"agent-series",
			"ai_agent_time_series"
		) as AgentTimeSeriesRow[]) ?? [];
	const pages =
		(getDataForQuery("agent-tables", "ai_agent_pages") as AgentPageResult[]) ??
		[];
	const agents =
		(getDataForQuery("agent-tables", "ai_agents") as AgentRow[]) ?? [];

	const chartData = useMemo(
		() =>
			series.map((row) => ({
				...row,
				date:
					dateRange.granularity === "hourly"
						? dayjs(row.date).format("HH:mm")
						: dayjs(row.date).format("MMM D"),
			})),
		[series, dateRange.granularity]
	);

	const hitsChart = series.map((row) => ({
		date: row.date,
		value: Number(row.hits) || 0,
	}));

	const purposeMetrics = PURPOSES.filter(({ key }) =>
		series.some((row) => row[key] > 0)
	).map(({ key, label }) => ({ key, label }));
	const chartMetrics =
		purposeMetrics.length > 0
			? purposeMetrics
			: [{ key: "hits", label: "Agent hits" }];

	const pageRows = useMemo(
		(): AgentPageRow[] =>
			pages.map(({ page, ...row }) => ({ ...row, name: page })),
		[pages]
	);

	const hits = summary?.hits ?? 0;

	if (!isLoading && hits === 0) {
		return (
			<div className="p-4">
				<EmptyState
					description="Agents that run JavaScript show up automatically. Crawlers like GPTBot and ClaudeBot don't, so add trackAgentTraffic from @databuddy/sdk/agents to your server to see them."
					icon={<BrainIcon />}
					title="No AI agents in this period"
				/>
			</div>
		);
	}

	return (
		<div className="relative flex h-full flex-col">
			<div className="space-y-4 p-4">
				<div className="grid gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2 lg:grid-cols-4">
					<StatCard
						chartData={hitsChart}
						icon={BrainIcon}
						id="agent-hits"
						isLoading={isLoading}
						title="Agent hits"
						value={hits}
					/>
					<StatCard
						icon={RobotIcon}
						id="agent-count"
						isLoading={isLoading}
						title="Agents"
						value={summary?.agents ?? 0}
					/>
					<StatCard
						icon={FileTextIcon}
						id="agent-pages"
						isLoading={isLoading}
						title="Pages read"
						value={summary?.pages ?? 0}
					/>
					<StatCard
						description={`${percentOf(summary?.ai_sessions ?? 0, summary?.sessions ?? 0)} of all sessions`}
						icon={UsersIcon}
						id="agent-referrals"
						isLoading={isLoading}
						title="AI-referred sessions"
						value={summary?.ai_sessions ?? 0}
					/>
				</div>

				<SimpleMetricsChart
					data={chartData}
					description="Hits from AI agents and crawlers by purpose"
					height={300}
					isLoading={isLoading}
					metrics={chartMetrics}
					partialLastSegment
					title="Agent traffic"
				/>

				<DataTable
					columns={pageColumns(pageRows)}
					data={pageRows}
					description="What AI agents read, next to what humans read"
					emptyMessage="No pages read by agents yet"
					isLoading={isLoading}
					title="Pages"
				/>

				<DataTable
					columns={agentColumns}
					data={agents}
					description="Who is reading, and why"
					emptyMessage="No agents yet"
					isLoading={isLoading}
					title="Agents"
				/>

				<p className="text-pretty text-muted-foreground text-xs">
					Crawlers that don't run JavaScript, like GPTBot and ClaudeBot, only
					appear once trackAgentTraffic from @databuddy/sdk/agents runs on your
					server.
				</p>
			</div>
		</div>
	);
}
