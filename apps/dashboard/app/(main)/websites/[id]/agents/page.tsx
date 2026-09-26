"use client";

import { dayjs, EmptyState, fromNow, Skeleton } from "@databuddy/ui";
import { CopyButton } from "@databuddy/ui/client";
import { BrainIcon } from "@databuddy/ui/icons";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import {
	Chart,
	type ChartMultiSeriesDataPoint,
} from "@/components/ui/composables/chart";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { AiProductIcon } from "@/components/icon";
import { DataTable } from "@/components/table/data-table";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { formatNumber } from "@/lib/formatters";
import {
	type AgentPageRow,
	NEVER_SEEN,
	otherProductColumns,
	type ProductRow,
	pageColumns,
} from "./columns";
import { cn } from "@/lib/utils";

interface ProductSeriesRow {
	date: string;
	product: string;
	requests: number;
}

interface VisitorSeriesRow {
	date: string;
	product: string;
	visitors: number;
}

interface TrendPoint {
	date: string;
	value: number;
}

type PageResult = Omit<AgentPageRow, "name"> & { page: string };

const CHART_PRODUCTS = 4;
const NON_ID_CHARS = /[^a-zA-Z0-9_-]/g;

const FOREGROUND = "var(--color-foreground)";
const PRODUCT_COLORS: Record<string, string> = {
	Apple: FOREGROUND,
	ByteDance: "#3C8CFF",
	ChatGPT: FOREGROUND,
	Claude: "#D97757",
	"Claude Code": "#D97757",
	Cursor: FOREGROUND,
	DeepSeek: "#5786FE",
	DuckDuckGo: "#DE5833",
	"Gemini CLI": "#8E75B2",
	"Google Gemini": "#8E75B2",
	Huawei: "#FF0000",
	"Meta AI": "#0467DF",
	Mistral: "#FA520F",
	Perplexity: "#1FB8CD",
};

const FAVICON_FALLBACKS: Record<string, string> = {
	"Microsoft Copilot": "copilot.microsoft.com",
};
const FEATURED_PRODUCTS = [
	"ChatGPT",
	"Claude",
	"Google Gemini",
	"Perplexity",
	"Microsoft Copilot",
	"Meta AI",
];

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

function countsByProduct<TRow extends { date: string; product: string }>(
	rows: TRow[],
	value: (row: TRow) => number,
	bucketFormat: string
): Map<string, Map<string, number>> {
	const counts = new Map<string, Map<string, number>>();
	for (const row of rows) {
		const byBucket = counts.get(row.product) ?? new Map<string, number>();
		byBucket.set(dayjs(row.date).format(bucketFormat), value(row));
		counts.set(row.product, byBucket);
	}
	return counts;
}

function mainPurpose(row: ProductRow): string | null {
	const purposes = [
		{ label: "training", value: row.training },
		{ label: "search", value: row.search_index },
		{ label: "answers", value: row.on_demand },
	].sort((a, b) => b.value - a.value);
	return purposes[0].value > 0 ? purposes[0].label : null;
}

function emptyProduct(product: string): ProductRow {
	return {
		last_seen: NEVER_SEEN,
		on_demand: 0,
		pages: 0,
		product,
		requests: 0,
		search_index: 0,
		training: 0,
		visitors: 0,
	};
}

function ProductCard({ row, trend }: { row: ProductRow; trend: TrendPoint[] }) {
	const purpose = mainPurpose(row);
	const isActive = row.requests > 0 || row.visitors > 0;
	return (
		<div className="flex flex-col gap-3 rounded-lg bg-background p-3">
			<div className="flex items-center gap-2.5">
				<AiProductIcon
					className={cn(!isActive && "opacity-40 grayscale")}
					fallback={
						FAVICON_FALLBACKS[row.product] ? (
							<FaviconImage
								altText={row.product}
								className={cn(!isActive && "opacity-40 grayscale")}
								domain={FAVICON_FALLBACKS[row.product]}
								size={28}
							/>
						) : undefined
					}
					name={row.product}
					size={28}
				/>
				<p className="truncate font-semibold text-sm">{row.product}</p>
			</div>
			<div>
				<p className="font-semibold text-xl tabular-nums">
					{formatNumber(row.visitors)}
					<span className="ml-1.5 font-normal text-muted-foreground text-xs">
						visitors sent
					</span>
				</p>
				<div className="my-1.5 h-9">
					<Chart.SingleSeries
						color={PRODUCT_COLORS[row.product]}
						data={trend}
						height={36}
						id={`ai-product-${row.product.replace(NON_ID_CHARS, "-")}`}
						tooltip={{
							formatLabelAction: (label) => dayjs(label).format("ddd, MMM D"),
							formatValue: formatNumber,
							valueSuffixLabel: "visitors",
						}}
						yDomain={[0, "dataMax + 1"]}
					/>
				</div>
				<p className="truncate text-muted-foreground text-xs">
					{row.requests > 0
						? `Read ${formatNumber(row.pages)} pages${purpose ? ` for ${purpose}` : ""}, ${fromNow(row.last_seen)}`
						: isActive
							? "Hasn't read your pages"
							: "Not seen yet"}
				</p>
			</div>
		</div>
	);
}

export default function AgentsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const { dateRange } = useDateFilters();
	const { chartType, chartStepType } = useChartPreferences("overview-main");

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		[
			{ id: "products", parameters: ["ai_products"] },
			{ id: "series", parameters: ["ai_agent_time_series"] },
			{ id: "visitors", parameters: ["ai_product_visitors"] },
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

	const visitorSeries =
		(getDataForQuery(
			"visitors",
			"ai_product_visitors"
		) as VisitorSeriesRow[]) ?? [];

	const isHourly = dateRange.granularity === "hourly";
	const bucketFormat = isHourly ? "YYYY-MM-DD HH:00" : "YYYY-MM-DD";
	const buckets = useMemo(() => {
		const unit = isHourly ? "hour" : "day";
		const end = dayjs(dateRange.end_date).endOf("day");
		const keys: string[] = [];
		for (
			let cursor = dayjs(dateRange.start_date).startOf(unit);
			!cursor.isAfter(end);
			cursor = cursor.add(1, unit)
		) {
			keys.push(cursor.format(bucketFormat));
		}
		return keys;
	}, [dateRange.start_date, dateRange.end_date, isHourly, bucketFormat]);

	const chart = useMemo(() => {
		const topProducts = products
			.filter((row) => row.requests > 0)
			.slice(0, CHART_PRODUCTS)
			.map((row) => row.product);
		const requests = countsByProduct(
			series,
			(row) => Number(row.requests) || 0,
			bucketFormat
		);
		return {
			data: buckets.map((bucket): ChartMultiSeriesDataPoint => {
				const point: ChartMultiSeriesDataPoint = {
					date: dayjs(bucket).format(isHourly ? "HH:mm" : "MMM D"),
				};
				for (const product of topProducts) {
					point[product] = requests.get(product)?.get(bucket) ?? 0;
				}
				return point;
			}),
			metrics: topProducts.map((product) => ({
				key: product,
				label: product,
			})),
		};
	}, [products, series, buckets, bucketFormat, isHourly]);

	const trendFor = useMemo(() => {
		const visitors = countsByProduct(
			visitorSeries,
			(row) => Number(row.visitors) || 0,
			bucketFormat
		);
		return (product: string): TrendPoint[] =>
			buckets.map((date) => ({
				date,
				value: visitors.get(product)?.get(date) ?? 0,
			}));
	}, [visitorSeries, buckets, bucketFormat]);

	const featured = FEATURED_PRODUCTS.map(
		(name) => products.find((row) => row.product === name) ?? emptyProduct(name)
	);
	const others = products
		.filter((row) => !FEATURED_PRODUCTS.includes(row.product))
		.map((row) => ({ ...row, name: row.product }));

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
				<div className="grid gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2 lg:grid-cols-3">
					{isLoading
						? FEATURED_PRODUCTS.map((name) => (
								<Skeleton className="h-[104px] rounded-lg" key={name} />
							))
						: featured.map((row) => (
								<ProductCard
									key={row.product}
									row={row}
									trend={trendFor(row.product)}
								/>
							))}
				</div>

				{chart.metrics.length > 0 ? (
					<SimpleMetricsChart
						data={chart.data}
						description="Requests from each AI product's crawlers and agents"
						height={280}
						isLoading={isLoading}
						chartStepType={chartStepType}
						metrics={chart.metrics}
						partialLastSegment
						seriesKind={chartType}
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

				{others.length > 0 ? (
					<DataTable
						columns={otherProductColumns}
						data={others}
						description="Coding agents, crawlers and other AI products"
						isLoading={isLoading}
						title="Other AI"
					/>
				) : null}

				<p className="text-pretty text-muted-foreground text-xs">
					Crawlers that don't run JavaScript, like GPTBot and ClaudeBot, only
					appear once trackAgentTraffic from @databuddy/sdk/agents runs on your
					server.
				</p>
			</div>
		</div>
	);
}
