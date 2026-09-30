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
import {
	type AgentPurpose,
	type ContentFormat,
	FEATURED_AI_PRODUCTS,
	type RobotsAccess,
	UNIDENTIFIED_AGENTS_PRODUCT,
} from "@databuddy/shared/bot-detection/types";
import { publicConfig } from "@databuddy/env/public";
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

type ReadFocus = ContentFormat | "all";

const FOCUS: Record<
	ReadFocus,
	{
		column: "requests" | ContentFormat;
		label: string;
		noun: string;
		scope: string;
		tab: string;
		title: string;
	}
> = {
	all: {
		column: "requests",
		label: "AI",
		noun: "pages",
		scope: "the site",
		tab: "All",
		title: "Pages",
	},
	html: {
		column: "html",
		label: "HTML",
		noun: "pages",
		scope: "HTML content",
		tab: "HTML",
		title: "HTML pages",
	},
	llms: {
		column: "llms",
		label: "llms.txt",
		noun: "files",
		scope: "llms.txt content",
		tab: "llms.txt",
		title: "llms.txt files",
	},
	markdown: {
		column: "markdown",
		label: "Markdown",
		noun: "pages",
		scope: "Markdown content",
		tab: "Markdown",
		title: "Markdown pages",
	},
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
const ALL_AI_VISITORS = "All AI visitors";

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

interface LandingSender {
	product: string;
	reads: number;
	visitors: number;
}

interface LandingPageRow {
	page: string;
	pageviews: number;
	senders: LandingSender[];
	visitors: number;
}

const READ_FORMATS: ContentFormat[] = ["llms", "markdown", "html"];
const READ_ROWS = 8;
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

interface OutcomeRow {
	engaged_rate: number;
	pages_per_visit: number;
	product: string;
	revenue?: string;
	visitors: number;
}

const OUTCOME_GRID =
	"grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1.2fr)_5.5rem] items-center gap-3";

interface RevenueRow {
	currency: string;
	name: string;
	revenue: number;
}

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

interface ActivityRow {
	date: string;
	html: number;
	llms: number;
	markdown: number;
	requests: number;
}

interface ActivityTimeline {
	bucketFormat: string;
	buckets: string[];
	isHourly: boolean;
}

interface TrendPoint {
	date: string;
	value: number;
}

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
							line to your server, or send your Vercel logs, to see which pages
							they read.
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
								<Tabs.Tab value="vercel-drain">Vercel drain</Tabs.Tab>
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
							<Tabs.Panel className="mt-4 space-y-5" value="vercel-drain">
								<SetupStep step={1} title="Add a drain in Vercel">
									<p className="text-pretty text-muted-foreground text-xs">
										Team Settings → Drains → Add Drain, then choose Logs and
										Custom Endpoint. No code change needed. Drains need a Pro or
										Enterprise plan, and Vercel bills them by volume.
									</p>
								</SetupStep>
								<SetupStep step={2} title="Paste this endpoint">
									<SetupCode
										code={`${publicConfig.urls.basket}/vercel/${websiteId}`}
										language="bash"
									/>
								</SetupStep>
								<SetupStep step={3} title="Choose what to send">
									<p className="text-pretty text-muted-foreground text-xs">
										Sources: Static Files, Functions, Edge Functions and
										Rewrites. Environment: Production. Format: JSON or NDJSON.
										Leave sampling off so every AI request arrives. Drains also
										report the status each agent got, so you can see 404s.
									</p>
								</SetupStep>
							</Tabs.Panel>
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
				<div className="my-1.5">
					<Sparkline
						color={aiProductColor(row.product)}
						id={`ai-product-${row.product}`}
						isHourly={isHourly}
						trend={trend}
						unit="visitors"
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
	suffix,
}: {
	current: number;
	previous: number;
	suffix?: string;
}) {
	const change = calculatePercentChange(current, previous);
	if (Math.abs(change) < 0.5) {
		return null;
	}
	const Icon = change > 0 ? TrendUpIcon : TrendDownIcon;
	return (
		<span className="flex items-center gap-1.5 text-xs">
			<span
				className={cn(
					"flex items-center gap-1 font-medium tabular-nums",
					change > 0 ? "text-success" : "text-destructive"
				)}
			>
				<Icon className="size-3.5" />
				{Math.abs(change).toFixed(0)}%
			</span>
			{suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
		</span>
	);
}

function Headline({
	aside,
	change,
	detail,
	isLoading = false,
	title,
	unit,
	value,
}: {
	aside?: React.ReactNode;
	change?: React.ReactNode;
	detail: string;
	isLoading?: boolean;
	title: string;
	unit?: string;
	value?: string;
}) {
	const hasValue = isLoading || value !== undefined;
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div>
				<p className="font-semibold text-sm">{title}</p>
				{hasValue ? (
					<div className="mt-2 flex h-8 items-center gap-2">
						{isLoading ? (
							<Skeleton className="h-7 w-28" />
						) : (
							<>
								<p className="font-semibold text-2xl tabular-nums">
									{value}
									<span className="ml-1.5 font-normal text-muted-foreground text-xs">
										{unit}
									</span>
								</p>
								{change}
							</>
						)}
					</div>
				) : null}
				{isLoading ? (
					<Skeleton className="mt-1 h-4 w-48" />
				) : (
					<p
						className={cn(
							"text-pretty text-muted-foreground text-xs tabular-nums",
							hasValue && "mt-1"
						)}
					>
						{detail}
					</p>
				)}
			</div>
			{aside}
		</div>
	);
}

function useShowAll<T>(items: T[], rows = READ_ROWS) {
	const [isExpanded, setIsExpanded] = useState(false);
	return {
		canExpand: items.length > rows,
		collapse: () => setIsExpanded(false),
		isExpanded,
		toggle: () => setIsExpanded((expanded) => !expanded),
		visible: isExpanded ? items : items.slice(0, rows),
	};
}

function ShowAllButton({
	label,
	list,
}: {
	label: string;
	list: { canExpand: boolean; isExpanded: boolean; toggle: () => void };
}) {
	return list.canExpand ? (
		<Button
			className="self-center"
			onClick={list.toggle}
			size="sm"
			variant="ghost"
		>
			{list.isExpanded ? "Show less" : label}
		</Button>
	) : (
		<div aria-hidden className="h-8" />
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
	const list = useShowAll(rows, RANKED_ROWS);
	return (
		<div className="flex flex-col gap-2">
			<ol className="divide-y">
				{list.visible.map((row, index) => (
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
			<ShowAllButton label={`Show all ${rows.length}`} list={list} />
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
				<Headline
					change={
						hasComparison ? (
							<TotalChange
								current={share.total}
								previous={share.previousTotal}
							/>
						) : null
					}
					detail={`${share.rows.length} AI products · compared with ${dayjs(previousRange.start_date).format("MMM D")} to ${dayjs(previousRange.end_date).format("MMM D")}`}
					isLoading={isLoading}
					title="Share of AI visitors"
					unit="AI visitors"
					value={formatNumber(share.total)}
				/>
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
				<Headline
					detail="Change in share since the previous period"
					title="Ranking"
				/>
				{isLoading ? (
					<ListSkeleton rows={RANKED_ROWS} />
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
		.map((format) => `${FOCUS[format].label} ${formatNumber(agent[format])}`)
		.join(" · ");
}

function activityTrend(
	rows: ActivityRow[],
	timeline: ActivityTimeline,
	focus: ReadFocus
): TrendPoint[] {
	const { column } = FOCUS[focus];
	const valueByBucket = new Map(
		rows.map((row) => [
			dayjs(row.date).format(timeline.bucketFormat),
			row[column],
		])
	);
	return timeline.buckets.map((date) => ({
		date,
		value: valueByBucket.get(date) ?? 0,
	}));
}

function Sparkline({
	color = "var(--color-foreground)",
	id,
	isHourly,
	trend,
	unit,
}: {
	color?: string;
	id: string;
	isHourly: boolean;
	trend: TrendPoint[] | null;
	unit: string;
}) {
	if (!trend) {
		return <Skeleton className="h-9 w-full" />;
	}
	return (
		<div className="h-9">
			<Chart.SingleSeries
				color={color}
				data={trend}
				height={36}
				id={id.replace(NON_ID_CHARS, "-")}
				tooltip={{
					formatLabelAction: (value) =>
						dayjs(value).format(isHourly ? "ddd HH:mm" : "ddd, MMM D"),
					formatValue: formatNumber,
					valueSuffixLabel: unit,
				}}
				yDomain={[0, "dataMax + 1"]}
			/>
		</div>
	);
}

function AgentDetail({
	agent,
	isHourly,
	label,
	robots,
	trend,
}: {
	agent: ReadingAgent;
	isHourly: boolean;
	label: string;
	robots: RobotsCheck;
	trend: TrendPoint[] | null;
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
			<Sparkline
				id={`ai-agent-${agent.agent_id}`}
				isHourly={isHourly}
				trend={trend}
				unit={`${label} requests`}
			/>
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
	activity,
	agents,
	formats,
	isLoading,
	reads,
	robots,
	timeline,
	websiteId,
}: {
	activity: ActivityRow[];
	agents: ReadingAgent[];
	formats: FormatRow[];
	isLoading: boolean;
	reads: PageRead[];
	robots: RobotsCheck;
	timeline: ActivityTimeline;
	websiteId: string;
}) {
	const { dateRange } = useDateFilters();
	const available = READ_FORMATS.filter((format) =>
		formats.some((row) => row.format === format && row.requests > 0)
	);
	const options: ReadFocus[] =
		available.length > 1 ? [...available, "all"] : available;
	const [chosenFocus, setChosenFocus] = useState<ReadFocus | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const focus: ReadFocus =
		chosenFocus && options.includes(chosenFocus)
			? chosenFocus
			: (options[0] ?? "all");
	const { column, label, noun, scope, title } = FOCUS[focus];

	const rankedAgents = agents
		.map((agent) => ({
			...agent,
			value: agent[column],
		}))
		.filter((agent) => agent.value > 0)
		.sort((a, b) => b.value - a.value);
	const selected = rankedAgents.find((agent) => agent.agent_id === selectedId);
	const restricted = rankedAgents.filter(
		(agent) => agent.robots === "blocked" || agent.robots === "partial"
	).length;

	const readersByPage = new Map<string, Map<string, number>>();
	for (const read of reads) {
		if (focus !== "all" && read.format !== focus) {
			continue;
		}
		const readers = readersByPage.get(read.page) ?? new Map<string, number>();
		for (const reader of read.agents ?? []) {
			if (!selected || reader.agent_id === selected.agent_id) {
				readers.set(
					reader.name,
					(readers.get(reader.name) ?? 0) + Number(reader.requests)
				);
			}
		}
		readersByPage.set(read.page, readers);
	}
	const pages = [...readersByPage]
		.map(([page, readers]) => ({
			page,
			readers: [...readers]
				.map(([name, requests]) => ({ name, requests }))
				.sort((a, b) => b.requests - a.requests),
			value: [...readers.values()].reduce((sum, requests) => sum + requests, 0),
		}))
		.filter((row) => row.value > 0)
		.sort((a, b) => b.value - a.value);

	const distinctPages = new Set(reads.map((read) => read.page)).size;
	const rowSlots = Math.max(
		Math.min(READ_ROWS, Math.max(agents.length, distinctPages)),
		1
	);
	const focusFormat = formats.find((row) => row.format === focus);
	const total =
		focus === "all"
			? formats.reduce((sum, row) => sum + row.requests, 0)
			: (focusFormat?.requests ?? 0);
	const pageTotal = selected
		? Math.max(pages.length, focus === "all" ? selected.pages : 0)
		: focus === "all"
			? distinctPages
			: focusFormat?.pages || pages.length;
	const maxAgentValue = rankedAgents[0]?.value || 1;
	const maxPageValue = pages[0]?.value || 1;
	const agentList = useShowAll(rankedAgents);
	const pageList = useShowAll(pages);
	const agentActivity = useBatchDynamicQuery(
		websiteId,
		dateRange,
		[
			{
				id: "agent-activity",
				parameters: ["ai_crawler_activity"],
				filters: selectedId
					? [{ field: "agent_id", operator: "eq", value: selectedId }]
					: [],
			},
		],
		{ enabled: Boolean(selectedId) }
	);
	const agentActivityRows = agentActivity.getDataForQuery(
		"agent-activity",
		"ai_crawler_activity"
	) as ActivityRow[];
	const askSubject = selected
		? `${selected.name} (${selected.product}) reading ${scope}`
		: `AI crawlers and agents reading ${scope}`;

	return (
		<div className="grid gap-1.5 rounded-xl bg-secondary p-1.5 lg:grid-cols-2">
			<div className="flex flex-col gap-4 rounded-lg bg-background p-4">
				<Headline
					aside={
						<div className="flex items-center gap-1">
							{isLoading ? (
								<Skeleton className="h-8 w-56" />
							) : options.length > 1 ? (
								<SegmentedControl
									onChange={(value) => {
										setChosenFocus(value);
										setSelectedId(null);
										agentList.collapse();
										pageList.collapse();
									}}
									options={options.map((value) => ({
										label: FOCUS[value].tab,
										value,
									}))}
									size="sm"
									value={focus}
								/>
							) : null}
							<AskAgentButton subject={askSubject} />
						</div>
					}
					detail={`from ${rankedAgents.length} ${rankedAgents.length === 1 ? "agent" : "agents"}${restricted > 0 ? ` · ${restricted} limited by robots.txt` : ""}`}
					isLoading={isLoading}
					title="Who reads your content"
					unit={`${label} requests`}
					value={formatNumber(total)}
				/>
				<Sparkline
					id="ai-reads-trend"
					isHourly={timeline.isHourly}
					trend={isLoading ? null : activityTrend(activity, timeline, focus)}
					unit={`${label} requests`}
				/>
				<div>
					{isLoading ? (
						<ListSkeleton rows={rowSlots} />
					) : (
						<div className="flex flex-col gap-1">
							{agentList.visible.map((agent, index) => {
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
					label={`Show all ${rankedAgents.length} agents`}
					list={agentList}
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
							<p className="font-semibold text-sm">{title}</p>
						)}
						<p className="text-muted-foreground text-xs">
							{selected
								? `${formatNumber(selected.value)} ${label} requests across ${formatNumber(pageTotal)} ${noun}`
								: `${formatNumber(pageTotal)} ${noun} · pick an agent to see what it read`}
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
				{selected ? (
					<AgentDetail
						agent={selected}
						isHourly={timeline.isHourly}
						label={label}
						robots={robots}
						trend={
							agentActivity.isLoading
								? null
								: activityTrend(agentActivityRows, timeline, focus)
						}
					/>
				) : null}
				<div>
					{isLoading ? (
						<ListSkeleton rows={rowSlots} />
					) : (
						<div className="flex flex-col gap-1">
							{pageList.visible.map((page, index) => (
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
					label={
						pages.length < pageTotal
							? `Show top ${formatNumber(pages.length)} of ${formatNumber(pageTotal)}`
							: `Show all ${formatNumber(pages.length)} ${noun}`
					}
					list={pageList}
				/>
			</div>
		</div>
	);
}

function RateBar({ baseline, rate }: { baseline: number; rate: number }) {
	return (
		<span className="relative flex h-1.5 min-w-0 flex-1 rounded-full bg-secondary">
			<span
				className="absolute inset-0 origin-left rounded-full bg-foreground/70 transition-transform duration-(--duration-base) ease-(--ease-smooth) motion-reduce:transition-none"
				style={{ transform: `scaleX(${Math.min(rate, 100) / 100})` }}
			/>
			<span
				className="absolute -inset-y-1 w-px bg-foreground"
				style={{ left: `${Math.min(baseline, 100)}%` }}
			/>
		</span>
	);
}

function OutcomeLine({
	baseline,
	row,
}: {
	baseline: OutcomeRow | undefined;
	row: OutcomeRow;
}) {
	const isBaseline = row.product === ALL_VISITORS;
	const isSummary = isBaseline || row.product === ALL_AI_VISITORS;
	const comparison = (value: string, base: string | undefined) =>
		base && !isBaseline ? `${value} (all visitors ${base})` : value;
	return (
		<Tooltip
			content={
				<Tip
					lines={[
						`${formatNumber(row.visitors)} ${row.visitors === 1 ? "visitor" : "visitors"}`,
						comparison(
							`${row.pages_per_visit.toFixed(1)} pages per visit`,
							baseline?.pages_per_visit.toFixed(1)
						),
						comparison(
							`${row.engaged_rate}% viewed 2+ pages`,
							baseline ? `${baseline.engaged_rate}%` : undefined
						),
						row.revenue ? `Revenue ${row.revenue}` : "",
					].filter(Boolean)}
					title={isSummary ? row.product : `Visitors from ${row.product}`}
				/>
			}
			delay={TIP_DELAY_MS}
		>
			<div
				className={cn(
					OUTCOME_GRID,
					"h-10 cursor-default rounded px-1 hover:bg-interactive-hover",
					isSummary && "text-muted-foreground"
				)}
			>
				<span className="flex min-w-0 items-center gap-2">
					{isSummary ? null : <AiProductIcon name={row.product} size="sm" />}
					<span className={cn("truncate text-sm", !isSummary && "font-medium")}>
						{row.product}
					</span>
				</span>
				<span className="text-right text-sm tabular-nums">
					{formatNumber(row.visitors)}
				</span>
				<span className="flex items-center gap-2">
					<RateBar
						baseline={baseline?.engaged_rate ?? row.engaged_rate}
						rate={row.engaged_rate}
					/>
					<span className="w-11 shrink-0 text-right text-xs tabular-nums">
						{row.engaged_rate}%
					</span>
				</span>
				<span className="text-right text-sm tabular-nums">
					{row.pages_per_visit.toFixed(1)}
				</span>
			</div>
		</Tooltip>
	);
}

function AiVisitorsPanel({
	isLoading,
	landing,
	outcomes,
}: {
	isLoading: boolean;
	landing: LandingPageRow[];
	outcomes: OutcomeRow[];
}) {
	const landingList = useShowAll(landing);
	const baseline = outcomes.find((row) => row.product === ALL_VISITORS);
	const allAi = outcomes.find((row) => row.product === ALL_AI_VISITORS);
	const aiOutcomes = outcomes.filter(
		(row) => row.product !== ALL_VISITORS && row.product !== ALL_AI_VISITORS
	);
	const maxLanding = landing[0]?.visitors || 1;

	return (
		<div className="grid gap-1.5 rounded-xl bg-secondary p-1.5 lg:grid-cols-2">
			<div className="flex flex-col gap-4 rounded-lg bg-background p-4">
				<Headline
					aside={
						<AskAgentButton subject="what visitors from AI products do on the site" />
					}
					change={
						allAi && baseline ? (
							<TotalChange
								current={allAi.pages_per_visit}
								previous={baseline.pages_per_visit}
								suffix="vs all visitors"
							/>
						) : null
					}
					detail={
						allAi && baseline
							? `${allAi.engaged_rate}% viewed 2+ pages, against ${baseline.engaged_rate}% of all visitors`
							: "Visitors from AI products, next to everyone else"
					}
					isLoading={isLoading}
					title="What AI visitors do"
					unit="pages per visit from AI"
					value={
						allAi && baseline ? allAi.pages_per_visit.toFixed(1) : undefined
					}
				/>
				{isLoading ? (
					<ListSkeleton rows={3} />
				) : aiOutcomes.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No visitors from AI products in this period.
					</p>
				) : (
					<div className="flex flex-col gap-1">
						<div
							className={cn(OUTCOME_GRID, "px-1 text-muted-foreground text-xs")}
						>
							<span>Visitors from</span>
							<span className="text-right">Visitors</span>
							<span>Viewed 2+ pages</span>
							<span className="whitespace-nowrap text-right">
								Pages per visit
							</span>
						</div>
						{[
							...aiOutcomes,
							...(allAi && aiOutcomes.length > 1 ? [allAi] : []),
							...(baseline ? [baseline] : []),
						].map((row) => (
							<OutcomeLine baseline={baseline} key={row.product} row={row} />
						))}
					</div>
				)}
			</div>

			<div className="flex flex-col gap-4 rounded-lg bg-background p-4">
				<Headline
					aside={
						<AskAgentButton subject="the pages AI products send visitors to" />
					}
					detail="Pages people from AI products view, and how often those products read them"
					title="Where AI sends visitors"
				/>
				{isLoading ? (
					<ListSkeleton rows={3} />
				) : landing.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No visitors from AI products in this period.
					</p>
				) : (
					<div className="flex flex-col gap-1">
						{landingList.visible.map((row, index) => {
							const senders = (row.senders ?? []).map((sender) => ({
								product: sender.product,
								reads: Number(sender.reads),
								visitors: Number(sender.visitors),
							}));
							const reads = senders.reduce(
								(sum, sender) => sum + sender.reads,
								0
							);
							return (
								<BarRow
									fraction={row.visitors / maxLanding}
									key={row.page}
									rank={index + 1}
									tooltip={
										<Tip
											lines={[
												...senders.map(
													(sender) =>
														`${sender.product} · ${formatNumber(sender.visitors)} ${sender.visitors === 1 ? "visitor" : "visitors"} · ${sender.reads > 0 ? `read ${formatNumber(sender.reads)} ${sender.reads === 1 ? "time" : "times"}` : "no reads recorded"}`
												),
												`${formatNumber(row.pageviews)} pageviews from everyone`,
											]}
											title={row.page}
										/>
									}
									value={row.visitors}
								>
									<span className="relative min-w-0 flex-1 truncate text-sm">
										{row.page}
									</span>
									{reads > 0 ? (
										<span className="relative hidden shrink-0 text-muted-foreground text-xs tabular-nums sm:inline">
											read {formatNumber(reads)}×
										</span>
									) : null}
									<span className="relative flex shrink-0 items-center gap-1">
										{senders.slice(0, 3).map((sender) => (
											<AiProductIcon
												key={sender.product}
												name={sender.product}
												size="sm"
											/>
										))}
									</span>
								</BarRow>
							);
						})}
					</div>
				)}
				<ShowAllButton
					label={`Show all ${formatNumber(landing.length)} pages`}
					list={landingList}
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
			{ id: "landing", parameters: ["ai_landing_pages"], limit: 1000 },
			{ id: "outcomes", parameters: ["ai_visitor_outcomes"] },
			{ id: "revenue", parameters: ["revenue_by_ai_product"] },
			{ id: "crawlers", parameters: ["ai_crawlers"], limit: 1000 },
			{ id: "activity", parameters: ["ai_crawler_activity"] },
		]
	);

	const rowsOf = <T,>(queryId: string, name: string) =>
		getDataForQuery(queryId, name) as T[];
	const products = rowsOf<ProductRow>("products", "ai_products");
	const previousProducts = rowsOf<ProductRow>(
		"products",
		"previous_ai_products"
	);
	const formats = rowsOf<FormatRow>("formats", "ai_content_formats");
	const reads = rowsOf<PageRead>("reads", "ai_agent_pages");
	const landingPages = rowsOf<LandingPageRow>("landing", "ai_landing_pages");
	const outcomes = rowsOf<OutcomeRow>("outcomes", "ai_visitor_outcomes");
	const crawlers = rowsOf<CrawlerResult>("crawlers", "ai_crawlers");
	const activity = rowsOf<ActivityRow>("activity", "ai_crawler_activity");
	const revenue = rowsOf<RevenueRow>("revenue", "revenue_by_ai_product");
	const visitorSeries = rowsOf<VisitorSeriesRow>(
		"visitors",
		"ai_product_visitors"
	);
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
			byBucket.set(dayjs(row.date).format(bucketFormat), row.visitors);
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
			previousProducts.map((row) => [row.product, row.visitors])
		);
		const previousTotal = previousProducts.reduce(
			(sum, row) => sum + row.visitors,
			0
		);
		const ranked = products
			.map(({ product, visitors }) => ({ product, visitors }))
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
	const outcomeRows = outcomes.map((row) => ({
		...row,
		revenue: revenue
			.filter((item) => item.name === row.product)
			.map((item) => formatRevenueCurrency(item.revenue, item.currency))
			.join(", "),
	}));
	const readingAgents = crawlers.map(
		(crawler, index): ReadingAgent => ({
			...crawler,
			html: Math.max(crawler.requests - crawler.markdown - crawler.llms, 0),
			robots: robots.data?.access[index],
		})
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
						activity={activity}
						agents={readingAgents}
						formats={formats}
						isLoading={isLoading}
						reads={reads}
						robots={{
							hasRobotsTxt: robots.data?.hasRobotsTxt,
							isPending: robots.isFetching,
						}}
						timeline={{ bucketFormat, buckets, isHourly }}
						websiteId={websiteId}
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

				{isLoading || outcomeRows.length > 1 || landingPages.length > 0 ? (
					<AiVisitorsPanel
						isLoading={isLoading}
						landing={landingPages}
						outcomes={outcomeRows}
					/>
				) : null}

				{needsProxy ? null : (
					<div className="space-y-2">
						<p className="text-pretty text-muted-foreground text-xs">
							{hasProxy
								? "Server-side tracking is on, so crawlers that don't run JavaScript, like GPTBot and ClaudeBot, show up here."
								: "Crawlers that don't run JavaScript, like GPTBot and ClaudeBot, only appear once @databuddy/sdk/agents runs on your server or a Vercel log drain sends your logs."}
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
