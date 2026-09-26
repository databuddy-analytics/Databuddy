"use client";

import { Button, dayjs, EmptyState, fromNow, StatusDot } from "@databuddy/ui";
import { CopyButton } from "@databuddy/ui/client";
import {
	BrainIcon,
	FileTextIcon,
	GlobeIcon,
	ListBulletsIcon,
} from "@databuddy/ui/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
	CONTENT_FORMATS,
	type ContentFormat,
	FEATURED_AI_PRODUCTS,
} from "@databuddy/shared/bot-detection/types";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import {
	Chart,
	type ChartMultiSeriesDataPoint,
} from "@/components/ui/composables/chart";
import { AiProductIcon, aiProductColor } from "@/components/icon";
import { DataTable } from "@/components/table/data-table";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { formatNumber } from "@/lib/formatters";
import { formatRevenueCurrency } from "@/lib/revenue-currency";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

const FORMATS: Record<
	ContentFormat,
	{ description: string; icon: typeof GlobeIcon; label: string }
> = {
	markdown: {
		description: ".md pages and markdown requests",
		icon: FileTextIcon,
		label: "Markdown",
	},
	llms: {
		description: "llms.txt and llms-full.txt",
		icon: ListBulletsIcon,
		label: "llms.txt",
	},
	html: { description: "Regular web pages", icon: GlobeIcon, label: "HTML" },
};

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

const NEVER_SEEN = "1970";
const ALL_VISITORS = "All visitors";

interface AgentPageRow {
	format: ContentFormat | null;
	name: string;
	pageviews: number;
	products: string[];
	requests: number;
	visitors: number;
}

function numberColumn<TRow>(
	key: keyof TRow & string,
	header: string
): ColumnDef<TRow> {
	return {
		id: key,
		accessorKey: key,
		header,
		cell: ({ getValue }) => (
			<span className="text-[15px] text-muted-foreground tabular-nums">
				{formatNumber((getValue() as number) ?? 0)}
			</span>
		),
	};
}

const pageColumns: ColumnDef<AgentPageRow>[] = [
	{
		id: "name",
		accessorKey: "name",
		header: "Page",
		cell: ({ getValue }) => (
			<span className="truncate font-medium text-[15px]">
				{getValue() as string}
			</span>
		),
	},
	numberColumn<AgentPageRow>("visitors", "AI visitors"),
	{
		id: "products",
		accessorKey: "products",
		header: "Read by",
		cell: ({ row }) => (
			<div className="flex items-center gap-1">
				{row.original.products.map((product) => (
					<span key={product} title={product}>
						<AiProductIcon name={product} size="sm" />
					</span>
				))}
			</div>
		),
	},
	numberColumn<AgentPageRow>("requests", "AI requests"),
	{
		id: "format",
		accessorKey: "format",
		header: "Format",
		cell: ({ getValue }) => {
			const format = getValue() as ContentFormat | null;
			return (
				<span className="text-[15px] text-muted-foreground">
					{format ? FORMATS[format].label : ""}
				</span>
			);
		},
	},
	numberColumn<AgentPageRow>("pageviews", "Human views"),
];

const otherProductColumns: ColumnDef<ProductRow & { name: string }>[] = [
	{
		id: "name",
		accessorKey: "name",
		header: "Product",
		cell: ({ row }) => (
			<div className="flex min-w-0 items-center gap-2">
				<AiProductIcon name={row.original.name} size="sm" />
				<span className="truncate font-medium text-[15px]">
					{row.original.name}
				</span>
			</div>
		),
	},
	numberColumn<ProductRow & { name: string }>("requests", "Requests"),
	numberColumn<ProductRow & { name: string }>("pages", "Pages read"),
	numberColumn<ProductRow & { name: string }>("visitors", "Visitors sent"),
	{
		id: "last_seen",
		accessorKey: "last_seen",
		header: "Last read",
		cell: ({ getValue }) => {
			const value = getValue() as string;
			return (
				<span className="text-[15px] text-muted-foreground">
					{value.startsWith(NEVER_SEEN) ? "Never" : fromNow(value)}
				</span>
			);
		},
	},
];

interface OutcomeRow {
	engaged_rate: number;
	name: string;
	pages_per_visit: number;
	revenue: string;
	visitors: number;
}

interface RevenueRow {
	currency: string;
	name: string;
	revenue: number;
}

const outcomeColumns: ColumnDef<OutcomeRow>[] = [
	{
		id: "name",
		accessorKey: "name",
		header: "Visitors from",
		cell: ({ row }) => (
			<div className="flex min-w-0 items-center gap-2">
				{row.original.name === ALL_VISITORS ? null : (
					<AiProductIcon name={row.original.name} size="sm" />
				)}
				<span
					className={cn(
						"truncate text-[15px]",
						row.original.name === ALL_VISITORS
							? "text-muted-foreground"
							: "font-medium"
					)}
				>
					{row.original.name}
				</span>
			</div>
		),
	},
	numberColumn<OutcomeRow>("visitors", "Visitors"),
	{
		id: "pages_per_visit",
		accessorKey: "pages_per_visit",
		header: "Pages per visit",
		cell: ({ getValue }) => (
			<span className="text-[15px] text-muted-foreground tabular-nums">
				{(getValue() as number).toFixed(1)}
			</span>
		),
	},
	{
		id: "engaged_rate",
		accessorKey: "engaged_rate",
		header: "Viewed 2+ pages",
		cell: ({ getValue }) => (
			<span className="text-[15px] text-muted-foreground tabular-nums">
				{getValue() as number}%
			</span>
		),
	},
	{
		id: "revenue",
		accessorKey: "revenue",
		header: "Revenue",
		cell: ({ getValue }) => (
			<span className="text-[15px] text-muted-foreground tabular-nums">
				{getValue() as string}
			</span>
		),
	},
];

interface CrawlerRow {
	agent_id: string;
	last_seen: string;
	name: string;
	product: string;
	purpose: string;
	requests: number;
	robots: RobotsAccess | undefined;
	user_agent: string;
}

type RobotsAccess = "allowed" | "partial" | "blocked";

const PURPOSE_LABELS: Record<string, string> = {
	agent: "Agent",
	search_index: "Search",
	training: "Training",
	user_fetch: "Answers",
};

const ROBOTS_LABELS: Record<RobotsAccess, string> = {
	allowed: "Allowed",
	blocked: "Blocked",
	partial: "Partly blocked",
};

const crawlerColumns: ColumnDef<CrawlerRow>[] = [
	{
		id: "name",
		accessorKey: "name",
		header: "Crawler",
		cell: ({ row }) => (
			<div className="flex min-w-0 items-center gap-2">
				<AiProductIcon name={row.original.product} size="sm" />
				<span className="truncate font-medium text-[15px]">
					{row.original.name}
				</span>
			</div>
		),
	},
	{
		id: "purpose",
		accessorKey: "purpose",
		header: "Reads for",
		cell: ({ getValue }) => (
			<span className="text-[15px] text-muted-foreground">
				{PURPOSE_LABELS[getValue() as string] ?? ""}
			</span>
		),
	},
	numberColumn<CrawlerRow>("requests", "Requests"),
	{
		id: "robots",
		accessorKey: "robots",
		header: "robots.txt",
		cell: ({ row }) => {
			const { last_seen, robots } = row.original;
			if (!robots) {
				return null;
			}
			const isStillCrawling =
				robots === "blocked" && dayjs().diff(last_seen, "hour") < 24;
			return (
				<span className="flex items-center gap-1.5 text-[15px] text-muted-foreground">
					<StatusDot
						color={
							robots === "allowed"
								? "success"
								: isStillCrawling
									? "destructive"
									: "warning"
						}
					/>
					{isStillCrawling ? "Blocked, still crawling" : ROBOTS_LABELS[robots]}
				</span>
			);
		},
	},
	{
		id: "last_seen",
		accessorKey: "last_seen",
		header: "Last read",
		cell: ({ getValue }) => (
			<span className="text-[15px] text-muted-foreground">
				{fromNow(getValue() as string)}
			</span>
		),
	},
];

interface FormatRow {
	format: ContentFormat;
	pages: number;
	products: string[];
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
type OutcomeResult = Omit<OutcomeRow, "name" | "revenue"> & {
	product: string;
};

const NON_ID_CHARS = /[^a-zA-Z0-9_-]/g;

const CHART_PRODUCTS = 4;

function setupSnippet(websiteId: string): string {
	return `// proxy.ts
export { proxy } from "@databuddy/sdk/agents";

// .env
NEXT_PUBLIC_DATABUDDY_CLIENT_ID=${websiteId}
`;
}

function AgentSetup({
	className,
	websiteId,
}: {
	className?: string;
	websiteId: string;
}) {
	const check = useMutation(orpc.websites.checkAgentSetup.mutationOptions());
	const results = check.data
		? [
				{
					label: "Homepage",
					isRecorded: check.data.homepage,
					hint: "deploy proxy.ts with NEXT_PUBLIC_DATABUDDY_CLIENT_ID set",
				},
				{
					label: "llms.txt",
					isRecorded: check.data.llmsTxt,
					hint: "make sure your proxy matcher doesn't skip .txt files",
				},
			]
		: [];

	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<div className="flex gap-2">
				<CopyButton
					label="Copy setup"
					size="md"
					value={setupSnippet(websiteId)}
					variant="secondary"
				/>
				<Button
					loading={check.isPending}
					onClick={() => check.mutate({ websiteId })}
					size="md"
					variant="secondary"
				>
					Test setup
				</Button>
			</div>
			{results.map((result) => (
				<p className="flex items-center gap-1.5 text-xs" key={result.label}>
					<StatusDot color={result.isRecorded ? "success" : "warning"} />
					{result.isRecorded
						? `${result.label} recorded`
						: `${result.label} not recorded: ${result.hint}`}
				</p>
			))}
			{check.isError ? (
				<p className="text-destructive text-xs">
					Couldn't run the check. Try again in a moment.
				</p>
			) : null}
		</div>
	);
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

function FormatCard({
	format,
	isLoading,
	row,
}: {
	format: ContentFormat;
	isLoading: boolean;
	row: FormatRow | undefined;
}) {
	const { description, icon: Icon, label } = FORMATS[format];
	return (
		<div className="flex flex-col gap-3 rounded-lg bg-background p-3">
			<div className="flex items-center gap-2.5">
				<div className="flex size-7 items-center justify-center rounded bg-accent">
					<Icon className="size-4 text-muted-foreground" />
				</div>
				<div className="min-w-0">
					<p className="truncate font-semibold text-sm">{label}</p>
					<p className="truncate text-muted-foreground text-xs">
						{description}
					</p>
				</div>
			</div>
			<div>
				<p className="font-semibold text-xl tabular-nums">
					{formatNumber(row?.requests ?? 0)}
					<span className="ml-1.5 font-normal text-muted-foreground text-xs">
						requests
					</span>
				</p>
				<div className="mt-1.5 flex h-5 items-center gap-1.5">
					{row && row.requests > 0 ? (
						<>
							<span className="text-muted-foreground text-xs">
								{formatNumber(row.pages)} pages, read by
							</span>
							{row.products.map((product) => (
								<span key={product} title={product}>
									<AiProductIcon name={product} size="sm" />
								</span>
							))}
						</>
					) : (
						<span className="text-muted-foreground text-xs">
							{isLoading ? "Checking…" : "Not fetched yet"}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

function ProductCard({
	isLoading,
	row,
	trend,
}: {
	isLoading: boolean;
	row: ProductRow;
	trend: TrendPoint[];
}) {
	const purpose = mainPurpose(row);
	const isActive = row.requests > 0 || row.visitors > 0;
	return (
		<div className="flex flex-col gap-3 rounded-lg bg-background p-3">
			<div className="flex items-center gap-2.5">
				<AiProductIcon
					className={cn(!isActive && "opacity-40 grayscale")}
					name={row.product}
					size={28}
				/>
				<p className="truncate font-semibold text-sm">{row.product}</p>
				{row.requests > 0 && row.visitors > 0 ? (
					<span
						className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums"
						title="AI requests for every visitor it sent you"
					>
						{formatNumber(Math.round(row.requests / row.visitors) || 1)} reads
						per visitor
					</span>
				) : null}
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
						color={aiProductColor(row.product)}
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
							: isLoading
								? "Checking…"
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
			{ id: "visitors", parameters: ["ai_product_visitors"] },
			{ id: "formats", parameters: ["ai_content_formats"] },
			{ id: "pages", parameters: ["ai_agent_pages"] },
			{ id: "outcomes", parameters: ["ai_visitor_outcomes"] },
			{ id: "revenue", parameters: ["revenue_by_ai_product"] },
			{ id: "crawlers", parameters: ["ai_crawlers"] },
		]
	);

	const products =
		(getDataForQuery("products", "ai_products") as ProductRow[]) ?? [];
	const formats =
		(getDataForQuery("formats", "ai_content_formats") as FormatRow[]) ?? [];
	const pages =
		(getDataForQuery("pages", "ai_agent_pages") as PageResult[]) ?? [];
	const outcomes =
		(getDataForQuery("outcomes", "ai_visitor_outcomes") as OutcomeResult[]) ??
		[];
	const crawlers =
		(getDataForQuery("crawlers", "ai_crawlers") as Omit<
			CrawlerRow,
			"robots"
		>[]) ?? [];
	const robots = useQuery({
		...orpc.websites.checkAiRobots.queryOptions({
			input: {
				websiteId,
				userAgents: crawlers.map((crawler) => crawler.user_agent),
			},
		}),
		enabled: crawlers.length > 0,
		staleTime: 10 * 60 * 1000,
	});
	const crawlerRows = crawlers.map(
		(crawler, index): CrawlerRow => ({
			...crawler,
			robots: robots.data?.access[index],
		})
	);
	const revenue =
		(getDataForQuery("revenue", "revenue_by_ai_product") as RevenueRow[]) ?? [];

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

	const visitorsByProduct = useMemo(() => {
		const counts = new Map<string, Map<string, number>>();
		for (const row of visitorSeries) {
			const byBucket = counts.get(row.product) ?? new Map<string, number>();
			byBucket.set(
				dayjs(row.date).format(bucketFormat),
				Number(row.visitors) || 0
			);
			counts.set(row.product, byBucket);
		}
		return counts;
	}, [visitorSeries, bucketFormat]);

	const trendFor = (product: string): TrendPoint[] =>
		buckets.map((date) => ({
			date,
			value: visitorsByProduct.get(product)?.get(date) ?? 0,
		}));

	const chart = useMemo(() => {
		const topProducts = products
			.filter((row) => row.visitors > 0)
			.sort((a, b) => b.visitors - a.visitors)
			.slice(0, CHART_PRODUCTS)
			.map((row) => row.product);
		return {
			data: buckets.map((bucket): ChartMultiSeriesDataPoint => {
				const point: ChartMultiSeriesDataPoint = {
					date: dayjs(bucket).format(isHourly ? "HH:mm" : "MMM D"),
				};
				for (const product of topProducts) {
					point[product] = visitorsByProduct.get(product)?.get(bucket) ?? 0;
				}
				return point;
			}),
			metrics: topProducts.map((product) => ({ key: product, label: product })),
		};
	}, [products, buckets, visitorsByProduct, isHourly]);

	const featured = FEATURED_AI_PRODUCTS.map(
		(name) => products.find((row) => row.product === name) ?? emptyProduct(name)
	);
	const others = products
		.filter((row) => !FEATURED_AI_PRODUCTS.includes(row.product))
		.map((row) => ({ ...row, name: row.product }));

	const outcomeRows = outcomes.map(({ product, ...row }): OutcomeRow => {
		const earned = revenue.find((item) => item.name === product);
		return {
			...row,
			name: product,
			revenue: earned
				? formatRevenueCurrency(earned.revenue, earned.currency)
				: "",
		};
	});

	const pageRows = useMemo(
		(): AgentPageRow[] =>
			pages.map(({ page, ...row }) => ({ ...row, name: page })),
		[pages]
	);

	if (!isLoading && products.length === 0) {
		return (
			<div className="flex h-full flex-col p-4">
				<EmptyState
					action={<AgentSetup className="items-center" websiteId={websiteId} />}
					description="ChatGPT, Claude and Perplexity show up here when they read your pages or send you visitors. Crawlers skip JavaScript, so add one file to your site, deploy, then test it."
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
					{featured.map((row) => (
						<ProductCard
							isLoading={isLoading}
							key={row.product}
							row={row}
							trend={trendFor(row.product)}
						/>
					))}
				</div>

				<div className="space-y-1.5 rounded-xl bg-secondary p-1.5">
					<div className="grid gap-1.5 sm:grid-cols-3">
						{CONTENT_FORMATS.map((format) => (
							<FormatCard
								format={format}
								isLoading={isLoading}
								key={format}
								row={formats.find((row) => row.format === format)}
							/>
						))}
					</div>

					{isLoading || chart.metrics.length > 0 ? (
						<SimpleMetricsChart
							chartStepType={chartStepType}
							className="rounded-lg border-0 bg-background"
							data={chart.data}
							description="Visitors each AI product sent to your site"
							height={280}
							isLoading={isLoading}
							metrics={chart.metrics}
							partialLastSegment
							seriesKind={chartType}
							showYAxis
							title="AI visitors"
						/>
					) : null}
				</div>

				{isLoading || outcomeRows.length > 1 ? (
					<DataTable
						columns={outcomeColumns}
						data={outcomeRows}
						description="How visitors from AI browse and buy, next to everyone else"
						isLoading={isLoading}
						title="What AI visitors do"
					/>
				) : null}

				{isLoading || crawlerRows.length > 0 ? (
					<DataTable
						columns={crawlerColumns}
						data={crawlerRows}
						description={
							robots.data && !robots.data.hasRobotsTxt
								? "Your site has no robots.txt, so every crawler is allowed"
								: "Each AI crawler and what your robots.txt lets it read"
						}
						initialPageSize={10}
						isLoading={isLoading}
						title="AI crawlers"
					/>
				) : null}

				<DataTable
					columns={pageColumns}
					data={pageRows}
					description="Where AI sends visitors, and what it reads"
					emptyMessage="No AI visitors or reads yet"
					isLoading={isLoading}
					title="Pages"
				/>

				{isLoading || others.length > 0 ? (
					<DataTable
						columns={otherProductColumns}
						data={others}
						description="Coding agents, crawlers and other AI products"
						initialPageSize={5}
						isLoading={isLoading}
						title="Other AI"
					/>
				) : null}

				<div className="space-y-2">
					<p className="text-pretty text-muted-foreground text-xs">
						Crawlers that don't run JavaScript, like GPTBot and ClaudeBot, only
						appear once @databuddy/sdk/agents runs on your server.
					</p>
					<AgentSetup websiteId={websiteId} />
				</div>
			</div>
		</div>
	);
}
