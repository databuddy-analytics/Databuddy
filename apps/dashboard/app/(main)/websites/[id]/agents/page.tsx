"use client";

import { dayjs, EmptyState, fromNow, Skeleton } from "@databuddy/ui";
import { CopyButton } from "@databuddy/ui/client";
import { BrainIcon } from "@databuddy/ui/icons";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import type { ChartMultiSeriesDataPoint } from "@/components/ui/composables/chart";
import { AiProductIcon } from "@/components/icon";
import { DataTable } from "@/components/table/data-table";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { formatNumber } from "@/lib/formatters";
import { type AgentPageRow, pageColumns } from "./columns";

interface ProductRow {
	last_seen: string;
	on_demand: number;
	pages: number;
	product: string;
	requests: number;
	search_index: number;
	training: number;
	visitors: number;
}

interface ProductSeriesRow {
	date: string;
	product: string;
	requests: number;
}

type PageResult = Omit<AgentPageRow, "name"> & { page: string };

const CHART_PRODUCTS = 4;

function proxySnippet(websiteId: string): string {
	return `import { trackAgentTraffic } from "@databuddy/sdk/agents";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest, event: NextFetchEvent) {
	event.waitUntil(
		trackAgentTraffic(request, {
			apiKey: process.env.DATABUDDY_API_KEY ?? "",
			websiteId: "${websiteId}",
		})
	);
	return NextResponse.next();
}
`;
}
const NEVER_SEEN = "1970";

function mainPurpose(row: ProductRow): string | null {
	const purposes = [
		{ label: "training", value: row.training },
		{ label: "search", value: row.search_index },
		{ label: "on-demand fetches", value: row.on_demand },
	].sort((a, b) => b.value - a.value);
	return purposes[0].value > 0 ? purposes[0].label : null;
}

function ProductCard({ row }: { row: ProductRow }) {
	const purpose = mainPurpose(row);
	return (
		<div className="flex flex-col gap-3 rounded-lg bg-background p-3">
			<div className="flex items-center gap-2.5">
				<AiProductIcon name={row.product} size={28} />
				<div className="min-w-0">
					<p className="truncate font-semibold text-sm">{row.product}</p>
					<p className="truncate text-muted-foreground text-xs">
						{row.last_seen.startsWith(NEVER_SEEN)
							? "Sends visitors"
							: `Last read ${fromNow(row.last_seen)}`}
					</p>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<div>
					<p className="font-semibold text-base tabular-nums">
						{formatNumber(row.requests)}
					</p>
					<p className="text-muted-foreground text-xs">
						{row.requests > 0
							? `requests, ${formatNumber(row.pages)} pages${purpose ? `, ${purpose}` : ""}`
							: "requests"}
					</p>
				</div>
				<div>
					<p className="font-semibold text-base tabular-nums">
						{formatNumber(row.visitors)}
					</p>
					<p className="text-muted-foreground text-xs">visitors sent</p>
				</div>
			</div>
		</div>
	);
}

export default function AgentsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const { dateRange } = useDateFilters();

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		[
			{ id: "products", parameters: ["ai_products"] },
			{ id: "series", parameters: ["ai_agent_time_series"] },
			{ id: "pages", parameters: ["ai_agent_pages"] },
		]
	);

	const products =
		(getDataForQuery("products", "ai_products") as ProductRow[]) ?? [];
	const series =
		(getDataForQuery("series", "ai_agent_time_series") as ProductSeriesRow[]) ??
		[];
	const pages =
		(getDataForQuery("pages", "ai_agent_pages") as PageResult[]) ?? [];

	const chart = useMemo(() => {
		const topProducts = products
			.filter((row) => row.requests > 0)
			.slice(0, CHART_PRODUCTS)
			.map((row) => row.product);
		const byDate = new Map<string, ChartMultiSeriesDataPoint>();
		for (const row of series) {
			if (!topProducts.includes(row.product)) {
				continue;
			}
			const date =
				dateRange.granularity === "hourly"
					? dayjs(row.date).format("HH:mm")
					: dayjs(row.date).format("MMM D");
			const point = byDate.get(date) ?? { date };
			point[row.product] = Number(row.requests) || 0;
			byDate.set(date, point);
		}
		return {
			data: [...byDate.values()],
			metrics: topProducts.map((product) => ({ key: product, label: product })),
		};
	}, [products, series, dateRange.granularity]);

	const pageRows = useMemo(
		(): AgentPageRow[] =>
			pages.map(({ page, ...row }) => ({ ...row, name: page })),
		[pages]
	);

	if (!isLoading && products.length === 0) {
		return (
			<div className="flex h-full flex-col p-4">
				<EmptyState
					action={
						<CopyButton
							label="Copy proxy.ts setup"
							size="md"
							value={proxySnippet(websiteId)}
							variant="secondary"
						/>
					}
					description="ChatGPT, Claude and Perplexity show up here when they read your pages or send you visitors. Crawlers skip JavaScript, so add this to your Next.js proxy.ts to see them."
					icon={<BrainIcon />}
					isMainContent
					title="No AI activity yet"
				/>
			</div>
		);
	}

	return (
		<div className="relative flex h-full flex-col">
			<div className="space-y-4 p-4">
				<div className="grid gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2 lg:grid-cols-4">
					{isLoading
						? Array.from({ length: 4 }, (_, index) => (
								<Skeleton className="h-[116px] rounded-lg" key={index} />
							))
						: products.map((row) => (
								<ProductCard key={row.product} row={row} />
							))}
				</div>

				{chart.metrics.length > 0 ? (
					<SimpleMetricsChart
						data={chart.data}
						description="Requests from each AI product's crawlers and agents"
						height={280}
						isLoading={isLoading}
						metrics={chart.metrics}
						partialLastSegment
						title="AI requests"
					/>
				) : null}

				<DataTable
					columns={pageColumns}
					data={pageRows}
					description="What AI reads, next to what humans read"
					emptyMessage="No pages read by AI yet"
					isLoading={isLoading}
					title="Pages"
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
