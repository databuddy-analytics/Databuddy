"use client";

import { Button, dayjs, EmptyState, fromNow, Skeleton } from "@databuddy/ui";
import { CopyButton } from "@databuddy/ui/client";
import { BrainIcon } from "@databuddy/ui/icons";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import type { ChartMultiSeriesDataPoint } from "@/components/ui/composables/chart";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { AiProductIcon } from "@/components/icon";
import { DataTable } from "@/components/table/data-table";
import { useDateFilters } from "@/hooks/use-date-filters";
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

type PageResult = Omit<AgentPageRow, "name"> & { page: string };

const CHART_PRODUCTS = 4;
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

function ProductCard({
	isSelected,
	onSelect,
	row,
}: {
	isSelected: boolean;
	onSelect: () => void;
	row: ProductRow;
}) {
	const purpose = mainPurpose(row);
	const isActive = row.requests > 0 || row.visitors > 0;
	return (
		<Button
			aria-pressed={isSelected}
			className={cn(
				"h-auto flex-col items-stretch justify-start gap-3 rounded-lg bg-background p-3 text-left font-normal",
				isSelected && "ring-2 ring-primary"
			)}
			disabled={!isActive}
			onClick={onSelect}
			variant="ghost"
		>
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
			{isActive ? (
				<div>
					<p className="font-semibold text-xl tabular-nums">
						{formatNumber(row.visitors)}
						<span className="ml-1.5 font-normal text-muted-foreground text-xs">
							visitors sent
						</span>
					</p>
					<p className="truncate text-muted-foreground text-xs">
						{row.requests > 0
							? `Read ${formatNumber(row.pages)} pages${purpose ? ` for ${purpose}` : ""}, ${fromNow(row.last_seen)}`
							: "Hasn't read your pages"}
					</p>
				</div>
			) : (
				<p className="text-muted-foreground text-xs">Not seen yet</p>
			)}
		</Button>
	);
}

export default function AgentsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const { dateRange } = useDateFilters();
	const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

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

	const featured = FEATURED_PRODUCTS.map(
		(name) => products.find((row) => row.product === name) ?? emptyProduct(name)
	);
	const others = products
		.filter((row) => !FEATURED_PRODUCTS.includes(row.product))
		.map((row) => ({ ...row, name: row.product }));

	const pageRows = useMemo(
		(): AgentPageRow[] =>
			pages
				.filter(
					(row) => !selectedProduct || row.products.includes(selectedProduct)
				)
				.map(({ page, ...row }) => ({ ...row, name: page })),
		[pages, selectedProduct]
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
									isSelected={selectedProduct === row.product}
									key={row.product}
									onSelect={() =>
										setSelectedProduct((current) =>
											current === row.product ? null : row.product
										)
									}
									row={row}
								/>
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
					description={
						selectedProduct
							? `Pages ${selectedProduct} reads, next to what humans read`
							: "What AI reads, next to what humans read"
					}
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
