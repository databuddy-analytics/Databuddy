"use client";

import {
	Button,
	dayjs,
	EmptyState,
	fromNow,
	SegmentedControl,
	Skeleton,
	StatusDot,
	Tooltip,
} from "@databuddy/ui";
import { Sheet, Tabs } from "@databuddy/ui/client";
import {
	BrainIcon,
	MinusIcon,
	TrendDownIcon,
	TrendUpIcon,
} from "@databuddy/ui/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
	type AgentPurpose,
	type ContentFormat,
	FEATURED_AI_PRODUCTS,
	type RobotsAccess,
	UNIDENTIFIED_AGENTS_PRODUCT,
} from "@databuddy/shared/bot-detection/types";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { NoticeBanner } from "@/app/(main)/websites/_components/notice-banner";
import { AskAgentButton } from "@/components/agent/new-chat-button";
import {
	CodeBlock,
	CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
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
import {
	calculatePercentChange,
	calculatePreviousPeriod,
} from "../_components/utils/analytics-helpers";

const FORMAT_LABELS: Record<ContentFormat, string> = {
	html: "HTML",
	llms: "llms.txt",
	markdown: "Markdown",
};

interface ProductRow {
	has_proxy: number;
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

interface PageReader {
	agent_id: string;
	name: string;
	product: string;
	requests: number;
}

interface PageRead {
	agents: PageReader[];
	format: ContentFormat;
	page: string;
	requests: number;
}

interface CrawlerResult {
	agent_id: string;
	last_seen: string;
	llms: number;
	markdown: number;
	name: string;
	operator: string;
	pages: number;
	product: string;
	purpose: AgentPurpose;
	requests: number;
	user_agent: string;
}

interface ReadingAgent extends CrawlerResult {
	html: number;
	robots: RobotsAccess | undefined;
}

type ReadFocus = ContentFormat | "all";

interface LandingPageRow {
	name: string;
	pageviews: number;
	products: string[];
	visitors: number;
}

const READ_FORMATS: ContentFormat[] = ["llms", "markdown", "html"];
const READ_ROWS = 8;
const ROW_HEIGHT_PX = 36;
const ROW_GAP_PX = 4;
const TIP_DELAY_MS = 200;

function Tip({ lines = [], title }: { lines?: string[]; title: string }) {
	return (
		<div className="max-w-72 space-y-0.5 py-0.5">
			<p className="break-words font-medium">{title}</p>
			{lines.map((line) => (
				<p className="break-words text-background/70" key={line}>
					{line}
				</p>
			))}
		</div>
	);
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

const landingColumns: ColumnDef<LandingPageRow>[] = [
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
	{
		id: "products",
		accessorKey: "products",
		header: "Sent by",
		cell: ({ row }) => (
			<div className="flex items-center gap-1">
				{row.original.products.map((product) => (
					<Tooltip
						content={<Tip title={product} />}
						delay={TIP_DELAY_MS}
						key={product}
					>
						<span>
							<AiProductIcon name={product} size="sm" />
						</span>
					</Tooltip>
				))}
			</div>
		),
	},
	numberColumn<LandingPageRow>("visitors", "AI visitors"),
	numberColumn<LandingPageRow>("pageviews", "Pageviews"),
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

const PURPOSE_LABELS: Record<AgentPurpose, string> = {
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

function robotsStatus(agent: ReadingAgent): {
	color: "destructive" | "success" | "warning";
	label: string;
} | null {
	if (!agent.robots) {
		return null;
	}
	if (
		agent.robots === "blocked" &&
		dayjs().diff(agent.last_seen, "hour") < 24
	) {
		return { color: "destructive", label: "Blocked, still crawling" };
	}
	return {
		color: agent.robots === "allowed" ? "success" : "warning",
		label: ROBOTS_LABELS[agent.robots],
	};
}

interface FormatRow {
	format: ContentFormat;
	pages: number;
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

type LandingPageResult = Omit<LandingPageRow, "name"> & { page: string };
type OutcomeResult = Omit<OutcomeRow, "name" | "revenue"> & {
	product: string;
};

const NON_ID_CHARS = /[^a-zA-Z0-9_-]/g;

const CHART_PRODUCTS = 4;
const SHARE_BARS = 6;

const RANKED_ROWS = 6;

interface ShareRow {
	change: number | "new" | null;
	product: string;
	share: number;
	visitors: number;
}

interface VisitorShare {
	previousTotal: number;
	rows: ShareRow[];
	total: number;
}

function formatShare(share: number): string {
	return `${share.toFixed(1)}%`;
}

const SETUP_STACKS = [
	{
		env: "NEXT_PUBLIC_DATABUDDY_CLIENT_ID",
		file: "proxy.ts",
		id: "next",
		label: "Next.js 16",
		code: 'export { proxy } from "@databuddy/sdk/agents";',
	},
	{
		env: "NEXT_PUBLIC_DATABUDDY_CLIENT_ID",
		file: "middleware.ts",
		id: "next15",
		label: "Next.js 15",
		code: 'export { proxy as middleware } from "@databuddy/sdk/agents";',
	},
	{
		env: "DATABUDDY_WEBSITE_ID",
		file: "middleware.ts",
		id: "vercel",
		label: "Vercel",
		code: 'export { proxy as default } from "@databuddy/sdk/agents";',
	},
	{
		env: "DATABUDDY_WEBSITE_ID",
		file: "worker.ts",
		id: "workers",
		label: "Cloudflare",
		code: `import { trackAgents } from "@databuddy/sdk/agents";

export default {
	async fetch(request, env, ctx) {
		const websiteId = env.DATABUDDY_WEBSITE_ID;
		ctx.waitUntil(trackAgents(request, { websiteId }));
		return fetch(request);
	},
};`,
	},
	{
		env: "DATABUDDY_WEBSITE_ID",
		file: "server.ts",
		id: "express",
		label: "Express",
		code: `import { trackAgents } from "@databuddy/sdk/agents";

app.use((req, _res, next) => {
	trackAgents(req);
	next();
});`,
	},
] as const;

const SETUP_CHECKS = [
	{
		key: "homepage",
		label: "Homepage",
		hint: "deploy the file above and set the environment variable",
	},
	{
		key: "llmsTxt",
		label: "llms.txt",
		hint: "make sure your proxy or middleware matcher doesn't skip .txt files",
	},
] as const;

function SetupStep({
	children,
	step,
	title,
}: {
	children: React.ReactNode;
	step: number;
	title: string;
}) {
	return (
		<div className="space-y-2">
			<p className="font-medium text-sm">
				<span className="mr-2 text-muted-foreground tabular-nums">{step}</span>
				{title}
			</p>
			{children}
		</div>
	);
}

function SetupCode({
	code,
	language,
}: {
	code: string;
	language: "bash" | "tsx";
}) {
	return (
		<CodeBlock code={code} language={language}>
			<CodeBlockCopyButton aria-label="Copy" />
		</CodeBlock>
	);
}

function AgentSetupSheet({
	label = "Set up",
	websiteId,
}: {
	label?: string;
	websiteId: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const check = useMutation(orpc.websites.checkAgentSetup.mutationOptions());
	const isWorking = check.data?.homepage && check.data.llmsTxt;

	return (
		<>
			<Button onClick={() => setIsOpen(true)} size="md" variant="secondary">
				{label}
			</Button>
			<Sheet onOpenChange={setIsOpen} open={isOpen}>
				<Sheet.Content side="right">
					<Sheet.Header>
						<Sheet.Title>Track AI crawlers</Sheet.Title>
						<Sheet.Description>
							Crawlers like GPTBot and ClaudeBot don't run JavaScript. Add one
							line to your server to see which pages they read.
						</Sheet.Description>
					</Sheet.Header>
					<Sheet.Body className="space-y-5">
						<Tabs defaultValue={SETUP_STACKS[0].id}>
							<Tabs.List className="max-w-full overflow-x-auto">
								{SETUP_STACKS.map((stack) => (
									<Tabs.Tab key={stack.id} value={stack.id}>
										{stack.label}
									</Tabs.Tab>
								))}
							</Tabs.List>
							{SETUP_STACKS.map((stack) => (
								<Tabs.Panel
									className="mt-4 space-y-5"
									key={stack.id}
									value={stack.id}
								>
									<SetupStep step={1} title="Install the SDK">
										<SetupCode
											code="bun add @databuddy/sdk@latest"
											language="bash"
										/>
									</SetupStep>
									<SetupStep step={2} title={`Add ${stack.file}`}>
										<SetupCode code={stack.code} language="tsx" />
									</SetupStep>
									<SetupStep step={3} title="Set your website ID">
										<SetupCode
											code={
												stack.id === "workers"
													? `# wrangler.toml\n[vars]\n${stack.env} = "${websiteId}"`
													: `${stack.env}=${websiteId}`
											}
											language="bash"
										/>
									</SetupStep>
								</Tabs.Panel>
							))}
						</Tabs>

						<SetupStep step={4} title="Deploy, then test it">
							<Button
								loading={check.isPending}
								onClick={() => check.mutate({ websiteId })}
								size="md"
								variant="secondary"
							>
								Test setup
							</Button>
							{check.data
								? SETUP_CHECKS.map((item) => (
										<p
											className="flex items-center gap-1.5 text-xs"
											key={item.key}
										>
											<StatusDot
												color={check.data[item.key] ? "success" : "warning"}
											/>
											{check.data[item.key]
												? `${item.label} recorded`
												: `${item.label} not recorded: ${item.hint}`}
										</p>
									))
								: null}
							{isWorking ? (
								<p className="text-pretty text-muted-foreground text-xs">
									Setup works. Crawler data shows up here as soon as an AI agent
									visits.
								</p>
							) : null}
							{check.isError ? (
								<p className="text-destructive text-xs">
									Couldn't run the check. Try again in a moment.
								</p>
							) : null}
						</SetupStep>

						<a
							className="block text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
							href="https://www.databuddy.cc/docs/sdk/ai-agents"
							rel="noopener"
							target="_blank"
						>
							Other setups and details in the docs
						</a>
					</Sheet.Body>
				</Sheet.Content>
			</Sheet>
		</>
	);
}

function mainPurpose(row: ProductRow): string | null {
	const purposes = [
		{ label: PURPOSE_LABELS.training, value: row.training },
		{ label: PURPOSE_LABELS.search_index, value: row.search_index },
		{ label: PURPOSE_LABELS.user_fetch, value: row.on_demand },
	].sort((a, b) => b.value - a.value);
	return purposes[0].value > 0 ? purposes[0].label.toLowerCase() : null;
}

function emptyProduct(product: string): ProductRow {
	return {
		has_proxy: 0,
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
	isHourly,
	isLoading,
	row,
	trend,
}: {
	isHourly: boolean;
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
					<Tooltip
						content={
							<Tip
								lines={[
									`${row.product} made ${formatNumber(row.requests)} requests to your pages and sent ${formatNumber(row.visitors)} ${row.visitors === 1 ? "visitor" : "visitors"}`,
								]}
								title="Reads per visitor"
							/>
						}
						delay={TIP_DELAY_MS}
					>
						<span className="ml-auto shrink-0 cursor-default text-muted-foreground text-xs tabular-nums">
							{formatNumber(Math.round(row.requests / row.visitors) || 1)} reads
							per visitor
						</span>
					</Tooltip>
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
							formatLabelAction: (label) =>
								dayjs(label).format(isHourly ? "ddd HH:mm" : "ddd, MMM D"),
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

function ShareChange({ change }: { change: ShareRow["change"] }) {
	if (change === "new") {
		return <span className="text-muted-foreground text-xs">New</span>;
	}
	if (change === null || Math.abs(change) < 0.05) {
		return <MinusIcon className="size-3.5 text-muted-foreground" />;
	}
	const Icon = change > 0 ? TrendUpIcon : TrendDownIcon;
	return (
		<span className="flex items-center gap-1 text-muted-foreground text-xs tabular-nums">
			<Icon className="size-3.5" />
			{Math.abs(change).toFixed(1)} pts
		</span>
	);
}

function TotalChange({
	current,
	previous,
}: {
	current: number;
	previous: number;
}) {
	const change = calculatePercentChange(current, previous);
	if (Math.abs(change) < 0.5) {
		return null;
	}
	const Icon = change > 0 ? TrendUpIcon : TrendDownIcon;
	return (
		<span
			className={cn(
				"flex items-center gap-1 font-medium text-xs tabular-nums",
				change > 0 ? "text-success" : "text-destructive"
			)}
		>
			<Icon className="size-3.5" />
			{Math.abs(change).toFixed(0)}%
		</span>
	);
}

function ShareBars({ rows }: { rows: ShareRow[] }) {
	const maxShare = Math.max(...rows.map((row) => row.share));
	return (
		<div>
			<div className="flex h-48 items-end gap-3 border-b">
				{rows.map((row) => (
					<Tooltip
						content={
							<Tip
								lines={[
									`${formatNumber(row.visitors)} ${row.visitors === 1 ? "visitor" : "visitors"}`,
									`${formatShare(row.share)} of AI visitors`,
								]}
								title={row.product}
							/>
						}
						delay={TIP_DELAY_MS}
						key={row.product}
					>
						<div className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
							<span className="text-muted-foreground text-xs tabular-nums group-hover:text-foreground">
								{formatShare(row.share)}
							</span>
							<div
								className="w-full max-w-10 rounded-t bg-foreground/80 group-hover:bg-foreground"
								style={{
									height: `${Math.max((row.share / maxShare) * 80, 1)}%`,
								}}
							/>
						</div>
					</Tooltip>
				))}
			</div>
			<div className="mt-2.5 flex gap-3">
				{rows.map((row) => (
					<div className="flex flex-1 justify-center" key={row.product}>
						<AiProductIcon name={row.product} size="md" />
					</div>
				))}
			</div>
		</div>
	);
}

function ShareRanking({ rows }: { rows: ShareRow[] }) {
	const [isExpanded, setIsExpanded] = useState(false);
	const visibleRows = isExpanded ? rows : rows.slice(0, RANKED_ROWS);
	return (
		<div className="flex flex-col">
			<ol className="divide-y">
				{visibleRows.map((row, index) => (
					<li className="flex h-11 items-center gap-3" key={row.product}>
						<span className="w-5 text-muted-foreground text-sm tabular-nums">
							{index + 1}
						</span>
						<AiProductIcon name={row.product} size="sm" />
						<span className="min-w-0 flex-1 truncate font-medium text-sm">
							{row.product}
						</span>
						<span className="text-muted-foreground text-xs tabular-nums">
							{formatNumber(row.visitors)}
						</span>
						<span className="w-14 text-right font-medium text-sm tabular-nums">
							{formatShare(row.share)}
						</span>
						<span className="flex w-16 justify-end">
							<ShareChange change={row.change} />
						</span>
					</li>
				))}
			</ol>
			{rows.length > RANKED_ROWS ? (
				<Button
					className="mt-2 self-center"
					onClick={() => setIsExpanded((expanded) => !expanded)}
					size="sm"
					variant="ghost"
				>
					{isExpanded ? "Show less" : `Show all ${rows.length}`}
				</Button>
			) : null}
		</div>
	);
}

function VisitorSharePanel({
	children,
	isLoading,
	previousRange,
	share,
}: {
	children?: React.ReactNode;
	isLoading: boolean;
	previousRange: { end_date: string; start_date: string };
	share: VisitorShare;
}) {
	const hasComparison = share.previousTotal > 0;
	return (
		<div className="grid gap-1.5 rounded-xl bg-secondary p-1.5 lg:grid-cols-2">
			<div className="flex flex-col gap-5 rounded-lg bg-background p-4">
				<div>
					<p className="font-semibold text-sm">Share of AI visitors</p>
					<div className="mt-2 flex h-8 items-center gap-2">
						{isLoading ? (
							<Skeleton className="h-7 w-28" />
						) : (
							<>
								<p className="font-semibold text-2xl tabular-nums">
									{formatNumber(share.total)}
									<span className="ml-1.5 font-normal text-muted-foreground text-xs">
										AI visitors
									</span>
								</p>
								{hasComparison ? (
									<TotalChange
										current={share.total}
										previous={share.previousTotal}
									/>
								) : null}
							</>
						)}
					</div>
					{isLoading ? (
						<Skeleton className="mt-1 h-4 w-48" />
					) : (
						<p className="mt-1 text-muted-foreground text-xs">
							{share.rows.length} AI products · compared with{" "}
							{dayjs(previousRange.start_date).format("MMM D")} to{" "}
							{dayjs(previousRange.end_date).format("MMM D")}
						</p>
					)}
				</div>
				{isLoading ? (
					<Skeleton className="h-56 w-full" />
				) : (
					<ShareBars rows={share.rows.slice(0, SHARE_BARS)} />
				)}
				{isLoading || hasComparison ? null : (
					<p className="text-pretty text-muted-foreground text-xs">
						No AI visitors in the previous period, so changes appear once there
						is one to compare against.
					</p>
				)}
			</div>
			<div className="flex flex-col gap-3 rounded-lg bg-background p-4">
				<div>
					<p className="font-semibold text-sm">Ranking</p>
					<p className="text-muted-foreground text-xs">
						Change in share since the previous period
					</p>
				</div>
				{isLoading ? (
					<div className="space-y-2">
						{Array.from({ length: RANKED_ROWS }, (_, index) => (
							<Skeleton className="h-9 w-full" key={index} />
						))}
					</div>
				) : (
					<ShareRanking rows={share.rows} />
				)}
			</div>
			{children ? <div className="lg:col-span-2">{children}</div> : null}
		</div>
	);
}

function BarRow({
	children,
	fraction,
	isDimmed = false,
	isSelected = false,
	onClick,
	rank,
	tooltip,
	value,
}: {
	children: React.ReactNode;
	fraction: number;
	isDimmed?: boolean;
	isSelected?: boolean;
	onClick?: () => void;
	rank: number;
	tooltip: React.ReactNode;
	value: number;
}) {
	const content = (
		<>
			<span className="w-5 shrink-0 text-muted-foreground text-sm tabular-nums">
				{rank}
			</span>
			<span className="relative flex h-9 min-w-0 flex-1 items-center gap-2 px-2.5">
				<span
					className={cn(
						"absolute inset-0 origin-left rounded transition-[transform,background-color] duration-(--duration-base) ease-(--ease-smooth) motion-reduce:transition-none",
						isSelected
							? "bg-foreground/15"
							: "bg-secondary group-hover:bg-interactive-hover"
					)}
					style={{ transform: `scaleX(${Math.max(fraction, 0.02)})` }}
				/>
				{children}
			</span>
			<span className="w-10 shrink-0 text-right font-medium text-sm tabular-nums">
				{formatNumber(value)}
			</span>
		</>
	);
	const className = cn(
		"group flex w-full items-center gap-3 text-left transition-opacity duration-(--duration-quick) ease-(--ease-smooth)",
		isDimmed && "opacity-40"
	);
	return (
		<Tooltip content={tooltip} delay={TIP_DELAY_MS}>
			{onClick ? (
				<Button
					aria-pressed={isSelected}
					className={cn(
						className,
						"h-auto justify-start px-0 font-normal text-foreground hover:bg-transparent hover:opacity-100 active:scale-100 active:bg-transparent"
					)}
					onClick={onClick}
					variant="ghost"
				>
					{content}
				</Button>
			) : (
				<div className={cn(className, "cursor-default")}>{content}</div>
			)}
		</Tooltip>
	);
}

function purposeDescription(agent: ReadingAgent): string {
	if (agent.product === UNIDENTIFIED_AGENTS_PRODUCT) {
		return "Not a known agent. It asked for markdown before HTML, which AI tools do.";
	}
	if (!agent.operator) {
		return `Signed its requests as ${agent.product}`;
	}
	switch (agent.purpose) {
		case "training":
			return `Collects pages to train ${agent.operator}'s AI models`;
		case "search_index":
			return `Indexes pages for ${agent.product} search results`;
		case "user_fetch":
			return `Opens a page when someone asks ${agent.product} about it`;
		default:
			return "Reads pages while doing a task for someone";
	}
}

interface RobotsCheck {
	hasRobotsTxt: boolean | undefined;
	isPending: boolean;
}

function listHeight(rows: number): number {
	return rows * ROW_HEIGHT_PX + Math.max(rows - 1, 0) * ROW_GAP_PX;
}

function ShowAllButton({
	count,
	isExpanded,
	label,
	onToggle,
}: {
	count: number;
	isExpanded: boolean;
	label: string;
	onToggle: () => void;
}) {
	return count > READ_ROWS ? (
		<Button
			className="self-center"
			onClick={onToggle}
			size="sm"
			variant="ghost"
		>
			{isExpanded ? "Show less" : label}
		</Button>
	) : (
		<div aria-hidden className="h-8" />
	);
}

function ListSkeleton({ rows }: { rows: number }) {
	return (
		<div className="flex flex-col gap-1">
			{Array.from({ length: rows }, (_, index) => (
				<Skeleton className="h-9 w-full" key={index} />
			))}
		</div>
	);
}

function formatSplit(agent: ReadingAgent): string {
	return READ_FORMATS.filter((format) => agent[format] > 0)
		.map((format) => `${FORMAT_LABELS[format]} ${formatNumber(agent[format])}`)
		.join(" · ");
}

function AgentDetail({
	agent,
	robots,
}: {
	agent: ReadingAgent;
	robots: RobotsCheck;
}) {
	const status = robotsStatus(agent);
	const robotsLabel =
		status?.label ??
		(robots.isPending
			? "Checking…"
			: robots.hasRobotsTxt === false
				? "No robots.txt"
				: null);
	const facts = [
		{ label: "Formats", value: formatSplit(agent) },
		{ label: "Pages", value: formatNumber(agent.pages) },
		{ label: "Last read", value: fromNow(agent.last_seen) },
	];
	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-x-5 gap-y-1">
				{facts.map((fact) => (
					<span className="flex items-center gap-1.5 text-xs" key={fact.label}>
						<span className="text-muted-foreground">{fact.label}</span>
						<span className="font-medium tabular-nums">{fact.value}</span>
					</span>
				))}
				{robotsLabel ? (
					<span className="flex items-center gap-1.5 text-xs">
						<span className="text-muted-foreground">robots.txt</span>
						{status ? <StatusDot color={status.color} /> : null}
						<span className="font-medium">{robotsLabel}</span>
					</span>
				) : null}
			</div>
			<Tooltip
				content={<Tip lines={[agent.user_agent]} title="User agent" />}
				delay={TIP_DELAY_MS}
			>
				<p className="cursor-default truncate font-mono text-muted-foreground text-xs">
					{agent.user_agent}
				</p>
			</Tooltip>
		</div>
	);
}

function AgentReadsPanel({
	agents,
	formats,
	isLoading,
	reads,
	robots,
}: {
	agents: ReadingAgent[];
	formats: FormatRow[];
	isLoading: boolean;
	reads: PageRead[];
	robots: RobotsCheck;
}) {
	const available = READ_FORMATS.filter((format) =>
		formats.some((row) => row.format === format && Number(row.requests) > 0)
	);
	const options: ReadFocus[] =
		available.length > 1 ? [...available, "all"] : available;
	const [chosenFocus, setChosenFocus] = useState<ReadFocus | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [areAgentsExpanded, setAreAgentsExpanded] = useState(false);
	const [arePagesExpanded, setArePagesExpanded] = useState(false);
	const focus: ReadFocus =
		chosenFocus && options.includes(chosenFocus)
			? chosenFocus
			: (options[0] ?? "all");
	const label = focus === "all" ? "AI" : FORMAT_LABELS[focus];

	const rankedAgents = agents
		.map((agent) => ({
			...agent,
			value: focus === "all" ? agent.requests : agent[focus],
		}))
		.filter((agent) => agent.value > 0)
		.sort((a, b) => b.value - a.value);
	const selected = rankedAgents.find((agent) => agent.agent_id === selectedId);
	const restricted = rankedAgents.filter(
		(agent) => agent.robots === "blocked" || agent.robots === "partial"
	).length;

	const pagesByFocus = useMemo(() => {
		const byPage = new Map<string, { page: string; readers: PageReader[] }>();
		for (const read of reads) {
			if (focus !== "all" && read.format !== focus) {
				continue;
			}
			const row = byPage.get(read.page) ?? { page: read.page, readers: [] };
			row.readers.push(...(read.agents ?? []));
			byPage.set(read.page, row);
		}
		return [...byPage.values()];
	}, [reads, focus]);
	const pages = pagesByFocus
		.map((row) => {
			const readers = selected
				? row.readers.filter((reader) => reader.agent_id === selected.agent_id)
				: row.readers;
			const requestsByReader = new Map<string, number>();
			for (const reader of readers) {
				requestsByReader.set(
					reader.name,
					(requestsByReader.get(reader.name) ?? 0) +
						(Number(reader.requests) || 0)
				);
			}
			return {
				page: row.page,
				readers: [...requestsByReader]
					.map(([name, requests]) => ({ name, requests }))
					.sort((a, b) => b.requests - a.requests),
				value: [...requestsByReader.values()].reduce(
					(sum, requests) => sum + requests,
					0
				),
			};
		})
		.filter((row) => row.value > 0)
		.sort((a, b) => b.value - a.value);

	const distinctPages = useMemo(
		() => new Set(reads.map((read) => read.page)).size,
		[reads]
	);
	const rowSlots = Math.max(
		Math.min(READ_ROWS, Math.max(agents.length, distinctPages)),
		1
	);
	const listStyle = { minHeight: listHeight(rowSlots) };

	const total =
		focus === "all"
			? formats.reduce((sum, row) => sum + (Number(row.requests) || 0), 0)
			: Number(formats.find((row) => row.format === focus)?.requests) || 0;
	const focusPageTotal =
		focus === "all"
			? distinctPages
			: Number(formats.find((row) => row.format === focus)?.pages) ||
				pages.length;
	const pageTotal = selected ? pages.length : focusPageTotal;
	const maxAgentValue = rankedAgents[0]?.value || 1;
	const maxPageValue = pages[0]?.value || 1;
	const visibleAgents = areAgentsExpanded
		? rankedAgents
		: rankedAgents.slice(0, READ_ROWS);
	const visiblePages = arePagesExpanded ? pages : pages.slice(0, READ_ROWS);
	const pageNoun = focus === "llms" ? "files" : "pages";
	const readScope = focus === "all" ? "the site" : `${label} content`;
	const askSubject = selected
		? `${selected.name} (${selected.product}) reading ${readScope}`
		: `AI crawlers and agents reading ${readScope}`;

	return (
		<div className="grid gap-1.5 rounded-xl bg-secondary p-1.5 lg:grid-cols-2">
			<div className="flex flex-col gap-4 rounded-lg bg-background p-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p className="font-semibold text-sm">Who reads your content</p>
						<div className="mt-2 flex h-8 items-center">
							{isLoading ? (
								<Skeleton className="h-7 w-28" />
							) : (
								<p className="font-semibold text-2xl tabular-nums">
									{formatNumber(total)}
									<span className="ml-1.5 font-normal text-muted-foreground text-xs">
										{label} requests
									</span>
								</p>
							)}
						</div>
						{isLoading ? (
							<Skeleton className="mt-1 h-4 w-40" />
						) : (
							<p className="mt-1 text-muted-foreground text-xs">
								from {rankedAgents.length}{" "}
								{rankedAgents.length === 1 ? "agent" : "agents"}
								{restricted > 0 ? ` · ${restricted} limited by robots.txt` : ""}
							</p>
						)}
					</div>
					<div className="flex items-center gap-1">
						{isLoading ? (
							<Skeleton className="h-8 w-56" />
						) : options.length > 1 ? (
							<SegmentedControl
								onChange={(value) => {
									setChosenFocus(value);
									setSelectedId(null);
									setAreAgentsExpanded(false);
									setArePagesExpanded(false);
								}}
								options={options.map((value) => ({
									label: value === "all" ? "All" : FORMAT_LABELS[value],
									value,
								}))}
								size="sm"
								value={focus}
							/>
						) : null}
						<AskAgentButton subject={askSubject} />
					</div>
				</div>
				<div style={listStyle}>
					{isLoading ? (
						<ListSkeleton rows={rowSlots} />
					) : (
						<div className="flex flex-col gap-1">
							{visibleAgents.map((agent, index) => {
								const status = robotsStatus(agent);
								const isSelected = selected?.agent_id === agent.agent_id;
								return (
									<BarRow
										fraction={agent.value / maxAgentValue}
										isDimmed={Boolean(selected) && !isSelected}
										isSelected={isSelected}
										key={agent.agent_id}
										onClick={() =>
											setSelectedId(isSelected ? null : agent.agent_id)
										}
										rank={index + 1}
										tooltip={
											<Tip
												lines={[
													purposeDescription(agent),
													`${formatNumber(agent.requests)} requests · ${formatNumber(agent.pages)} pages · last read ${fromNow(agent.last_seen)}`,
													status ? `robots.txt: ${status.label}` : "",
													isSelected
														? "Click to show every agent"
														: "Click to see what it read",
												].filter(Boolean)}
												title={
													agent.operator
														? `${agent.name} by ${agent.operator}`
														: agent.name
												}
											/>
										}
										value={agent.value}
									>
										<span className="relative shrink-0">
											<AiProductIcon name={agent.product} size="sm" />
										</span>
										<span className="relative min-w-0 truncate font-medium text-sm">
											{agent.name}
										</span>
										{agent.product === agent.name ? null : (
											<span className="relative hidden shrink-0 text-muted-foreground text-xs md:inline">
												{agent.product}
											</span>
										)}
										<span className="relative ml-auto hidden shrink-0 text-muted-foreground text-xs sm:inline">
											{focus === "all" && agent.markdown + agent.llms > 0
												? formatSplit(agent)
												: PURPOSE_LABELS[agent.purpose]}
										</span>
										<span className="relative flex w-2 shrink-0 justify-center">
											{status && status.color !== "success" ? (
												<StatusDot color={status.color} />
											) : null}
										</span>
									</BarRow>
								);
							})}
						</div>
					)}
				</div>
				<ShowAllButton
					count={rankedAgents.length}
					isExpanded={areAgentsExpanded}
					label={`Show all ${rankedAgents.length} agents`}
					onToggle={() => setAreAgentsExpanded((expanded) => !expanded)}
				/>
			</div>

			<div className="flex flex-col gap-4 rounded-lg bg-background p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						{selected ? (
							<div className="flex items-center gap-2">
								<AiProductIcon name={selected.product} size="sm" />
								<p className="truncate font-semibold text-sm">
									{selected.name}
								</p>
								<span className="shrink-0 text-muted-foreground text-xs">
									{selected.product === selected.name
										? PURPOSE_LABELS[selected.purpose]
										: `${selected.product} · ${PURPOSE_LABELS[selected.purpose]}`}
								</span>
							</div>
						) : (
							<p className="font-semibold text-sm">
								{focus === "llms"
									? "llms.txt files"
									: focus === "all"
										? "Pages"
										: `${label} pages`}
							</p>
						)}
						<p className="text-muted-foreground text-xs">
							{selected
								? `${formatNumber(selected.value)} ${label} requests across ${formatNumber(pages.length)} ${pageNoun}`
								: `${formatNumber(pageTotal)} ${pageNoun} · pick an agent to see what it read`}
						</p>
					</div>
					{selected ? (
						<Button
							onClick={() => setSelectedId(null)}
							size="sm"
							variant="ghost"
						>
							Show all agents
						</Button>
					) : null}
				</div>
				{selected ? <AgentDetail agent={selected} robots={robots} /> : null}
				<div style={listStyle}>
					{isLoading ? (
						<ListSkeleton rows={rowSlots} />
					) : (
						<div className="flex flex-col gap-1">
							{visiblePages.map((page, index) => (
								<BarRow
									fraction={page.value / maxPageValue}
									key={page.page}
									rank={index + 1}
									tooltip={
										<Tip
											lines={
												selected
													? [
															`${formatNumber(page.value)} ${label} requests from ${selected.name}`,
														]
													: [
															...page.readers
																.slice(0, 5)
																.map(
																	(reader) =>
																		`${reader.name} · ${formatNumber(reader.requests)}`
																),
															page.readers.length > 5
																? `+${page.readers.length - 5} more agents`
																: "",
														].filter(Boolean)
											}
											title={page.page}
										/>
									}
									value={page.value}
								>
									<span className="relative min-w-0 flex-1 truncate text-sm">
										{page.page}
									</span>
									{selected ? null : (
										<span className="relative hidden max-w-[45%] shrink-0 truncate text-muted-foreground text-xs sm:inline">
											{page.readers.map((reader) => reader.name).join(", ")}
										</span>
									)}
								</BarRow>
							))}
						</div>
					)}
				</div>
				<ShowAllButton
					count={pages.length}
					isExpanded={arePagesExpanded}
					label={
						pages.length < pageTotal
							? `Show top ${formatNumber(pages.length)} of ${formatNumber(pageTotal)}`
							: `Show all ${formatNumber(pages.length)} ${pageNoun}`
					}
					onToggle={() => setArePagesExpanded((expanded) => !expanded)}
				/>
			</div>
		</div>
	);
}

export default function AgentsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const { dateRange } = useDateFilters();
	const { chartType, chartStepType } = useChartPreferences("overview-main");

	const previousRange = useMemo(
		() => calculatePreviousPeriod(dateRange),
		[dateRange]
	);

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		[
			{
				id: "products",
				parameters: [
					"ai_products",
					{
						name: "ai_products",
						...previousRange,
						id: "previous_ai_products",
					},
				],
			},
			{ id: "visitors", parameters: ["ai_product_visitors"] },
			{ id: "formats", parameters: ["ai_content_formats"] },
			{ id: "reads", parameters: ["ai_agent_pages"], limit: 1000 },
			{ id: "landing", parameters: ["ai_landing_pages"] },
			{ id: "outcomes", parameters: ["ai_visitor_outcomes"] },
			{ id: "revenue", parameters: ["revenue_by_ai_product"] },
			{ id: "crawlers", parameters: ["ai_crawlers"] },
		]
	);

	const products =
		(getDataForQuery("products", "ai_products") as ProductRow[]) ?? [];
	const previousProducts =
		(getDataForQuery("products", "previous_ai_products") as ProductRow[]) ?? [];
	const formats =
		(getDataForQuery("formats", "ai_content_formats") as FormatRow[]) ?? [];
	const reads =
		(getDataForQuery("reads", "ai_agent_pages") as PageRead[]) ?? [];
	const landingPages =
		(getDataForQuery("landing", "ai_landing_pages") as LandingPageResult[]) ??
		[];
	const outcomes =
		(getDataForQuery("outcomes", "ai_visitor_outcomes") as OutcomeResult[]) ??
		[];
	const crawlers =
		(getDataForQuery("crawlers", "ai_crawlers") as CrawlerResult[]) ?? [];
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

	const visitorShare = useMemo((): VisitorShare => {
		const previousVisitors = new Map(
			previousProducts.map((row) => [row.product, Number(row.visitors) || 0])
		);
		const previousTotal = [...previousVisitors.values()].reduce(
			(sum, visitors) => sum + visitors,
			0
		);
		const ranked = products
			.map((row) => ({
				product: row.product,
				visitors: Number(row.visitors) || 0,
			}))
			.filter((row) => row.visitors > 0)
			.sort((a, b) => b.visitors - a.visitors);
		const total = ranked.reduce((sum, row) => sum + row.visitors, 0);
		return {
			previousTotal,
			total,
			rows: ranked.map((row) => {
				const share = (row.visitors / total) * 100;
				const previous = previousVisitors.get(row.product) ?? 0;
				return {
					...row,
					share,
					change:
						previousTotal === 0
							? null
							: previous === 0
								? "new"
								: share - (previous / previousTotal) * 100,
				};
			}),
		};
	}, [products, previousProducts]);

	const featured = FEATURED_AI_PRODUCTS.map(
		(name) => products.find((row) => row.product === name) ?? emptyProduct(name)
	);
	const outcomeRows = outcomes.map(
		({ product, ...row }): OutcomeRow => ({
			...row,
			name: product,
			revenue: revenue
				.filter((item) => item.name === product)
				.map((item) => formatRevenueCurrency(item.revenue, item.currency))
				.join(", "),
		})
	);

	const readingAgents = crawlers.map((crawler, index): ReadingAgent => {
		const markdown = Number(crawler.markdown) || 0;
		const llms = Number(crawler.llms) || 0;
		const requests = Number(crawler.requests) || 0;
		return {
			...crawler,
			html: Math.max(requests - markdown - llms, 0),
			llms,
			markdown,
			pages: Number(crawler.pages) || 0,
			requests,
			robots: robots.data?.access[index],
		};
	});
	const landingRows = landingPages.map(
		({ page, ...row }): LandingPageRow => ({ ...row, name: page })
	);

	if (!isLoading && products.length === 0) {
		return (
			<div className="flex h-full flex-col p-4">
				<EmptyState
					action={<AgentSetupSheet websiteId={websiteId} />}
					description="ChatGPT, Claude and Perplexity show up here when they read your pages or send you visitors. Crawlers don't run JavaScript, so they need one line on your server."
					icon={<BrainIcon />}
					isMainContent
					title="No AI activity yet"
				/>
			</div>
		);
	}

	const topSender = products.reduce<ProductRow | null>(
		(top, row) => (row.visitors > (top?.visitors ?? 0) ? row : top),
		null
	);
	const hasProxy = products.some((row) => Boolean(row.has_proxy));
	const needsProxy = !isLoading && topSender !== null && !hasProxy;

	return (
		<div className="relative flex h-full flex-col">
			<div className="space-y-4 p-4">
				{needsProxy && topSender ? (
					<NoticeBanner
						description="Add one line to your site to also see which pages AI reads, and whether it gets markdown or HTML."
						icon={<BrainIcon />}
						title={`${topSender.product} sent you ${formatNumber(topSender.visitors)} ${topSender.visitors === 1 ? "visitor" : "visitors"}`}
					>
						<AgentSetupSheet websiteId={websiteId} />
					</NoticeBanner>
				) : null}

				<div className="grid gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2 lg:grid-cols-3">
					{featured.map((row) => (
						<ProductCard
							isHourly={isHourly}
							isLoading={isLoading}
							key={row.product}
							row={row}
							trend={trendFor(row.product)}
						/>
					))}
				</div>

				{isLoading || reads.length > 0 ? (
					<AgentReadsPanel
						agents={readingAgents}
						formats={formats}
						isLoading={isLoading}
						reads={reads}
						robots={{
							hasRobotsTxt: robots.data?.hasRobotsTxt,
							isPending: robots.isFetching,
						}}
					/>
				) : null}

				{isLoading || visitorShare.rows.length > 0 ? (
					<VisitorSharePanel
						isLoading={isLoading}
						previousRange={previousRange}
						share={visitorShare}
					>
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
					</VisitorSharePanel>
				) : null}

				{isLoading || outcomeRows.length > 1 ? (
					<DataTable
						columns={outcomeColumns}
						data={outcomeRows}
						description="How visitors from AI browse and buy, next to everyone else"
						isLoading={isLoading}
						title="What AI visitors do"
					/>
				) : null}

				{isLoading || landingRows.length > 0 ? (
					<DataTable
						columns={landingColumns}
						data={landingRows}
						description="Pages people from AI products view"
						initialPageSize={10}
						isLoading={isLoading}
						title="Where AI sends visitors"
					/>
				) : null}

				{needsProxy ? null : (
					<div className="space-y-2">
						<p className="text-pretty text-muted-foreground text-xs">
							{hasProxy
								? "Server-side tracking is on, so crawlers that don't run JavaScript, like GPTBot and ClaudeBot, show up here."
								: "Crawlers that don't run JavaScript, like GPTBot and ClaudeBot, only appear once @databuddy/sdk/agents runs on your server."}
						</p>
						<AgentSetupSheet
							label={hasProxy ? "Test setup" : "Set up"}
							websiteId={websiteId}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
