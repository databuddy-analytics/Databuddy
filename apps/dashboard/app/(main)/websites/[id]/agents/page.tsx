"use client";

import { dayjs, EmptyState, fromNow } from "@databuddy/ui";
import { CopyButton } from "@databuddy/ui/client";
import {
	BrainIcon,
	FileTextIcon,
	GlobeIcon,
	ListBulletsIcon,
} from "@databuddy/ui/icons";
import type { ColumnDef } from "@tanstack/react-table";
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
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

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

const FORMAT_LABELS: Record<string, string> = {
	html: "HTML",
	llms: "llms.txt",
	markdown: "Markdown",
};

interface AgentPageRow {
	format: string | null;
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
			const format = getValue() as string | null;
			return (
				<span className="text-[15px] text-muted-foreground">
					{format ? (FORMAT_LABELS[format] ?? format) : ""}
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

interface FormatRow {
	format: string;
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

const NON_ID_CHARS = /[^a-zA-Z0-9_-]/g;

const CHART_PRODUCTS = 4;
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
	event.waitUntil(trackAgentTraffic(request, { websiteId: "${websiteId}" }));
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

const FORMATS = [
	{
		description: ".md pages and markdown requests",
		format: "markdown",
		icon: FileTextIcon,
	},
	{
		description: "llms.txt and llms-full.txt",
		format: "llms",
		icon: ListBulletsIcon,
	},
	{ description: "Regular web pages", format: "html", icon: GlobeIcon },
];

function FormatCard({
	format,
	isLoading,
	row,
}: {
	format: (typeof FORMATS)[number];
	isLoading: boolean;
	row: FormatRow | undefined;
}) {
	const Icon = format.icon;
	return (
		<div className="flex flex-col gap-3 rounded-lg bg-background p-3">
			<div className="flex items-center gap-2.5">
				<div className="flex size-7 items-center justify-center rounded bg-accent">
					<Icon className="size-4 text-muted-foreground" />
				</div>
				<div className="min-w-0">
					<p className="truncate font-semibold text-sm">
						{FORMAT_LABELS[format.format]}
					</p>
					<p className="truncate text-muted-foreground text-xs">
						{format.description}
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
		]
	);

	const products =
		(getDataForQuery("products", "ai_products") as ProductRow[]) ?? [];
	const formats =
		(getDataForQuery("formats", "ai_content_formats") as FormatRow[]) ?? [];
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

	const visitorsByProduct = useMemo(
		() =>
			countsByProduct(
				visitorSeries,
				(row) => Number(row.visitors) || 0,
				bucketFormat
			),
		[visitorSeries, bucketFormat]
	);

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
					description="ChatGPT, Claude and Perplexity show up here when they read your pages or send you visitors. Crawlers skip JavaScript, so add this to your Next.js proxy.ts and set DATABUDDY_API_KEY to see them."
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

				<div>
					<h2 className="mb-2 font-semibold text-sm">
						How AI reads your content
					</h2>
					<div className="grid gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-3">
						{FORMATS.map((format) => (
							<FormatCard
								format={format}
								isLoading={isLoading}
								key={format.format}
								row={formats.find((row) => row.format === format.format)}
							/>
						))}
					</div>
				</div>

				{isLoading || chart.metrics.length > 0 ? (
					<SimpleMetricsChart
						chartStepType={chartStepType}
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

				<p className="text-pretty text-muted-foreground text-xs">
					Crawlers that don't run JavaScript, like GPTBot and ClaudeBot, only
					appear once trackAgentTraffic from @databuddy/sdk/agents runs on your
					server.
				</p>
			</div>
		</div>
	);
}
