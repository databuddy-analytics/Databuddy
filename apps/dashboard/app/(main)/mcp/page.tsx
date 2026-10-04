"use client";

import {
	Badge,
	Button,
	Card,
	EmptyState,
	fromNow,
	Progress,
	Skeleton,
	Tooltip,
} from "@databuddy/ui";
import { DropdownMenu, Tabs } from "@databuddy/ui/client";
import {
	CaretRightIcon,
	CaretUpDownIcon,
	ChartBarIcon,
	CheckIcon,
	OpenExternalIcon,
	PlugIcon,
	XMarkIcon,
} from "@databuddy/ui/icons";
import { isSelfHosted } from "@databuddy/env/public";
import { useFlag } from "@databuddy/sdk/react";
import {
	keepPreviousData,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { parseAsString, useQueryStates } from "nuqs";
import { Suspense, useMemo, useState } from "react";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import json from "shiki/langs/json.mjs";
import tsx from "shiki/langs/tsx.mjs";
import vesper from "shiki/themes/vesper.mjs";
import { toast } from "sonner";
import {
	CODING_AGENTS,
	COPY_SUCCESS_TIMEOUT,
} from "@/app/(main)/websites/[id]/_components/constants/settings-constants";
import { formatDateByGranularity } from "@/app/(main)/websites/[id]/_components/utils/analytics-helpers";
import { generateMcpAgentPrompt } from "@/app/(main)/websites/[id]/_components/utils/code-generators";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import { DateRangePicker } from "@/components/date-range-picker";
import { AiProductIcon } from "@/components/icon";
import { TopBar } from "@/components/layout/top-bar";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { List } from "@/components/ui/composables/list";
import { SetupRow, type SetupRowStatus } from "@/components/websites/setup-row";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { useWebsitesLight } from "@/hooks/use-websites";
import { APP_EVENTS, trackAppEvent } from "@/lib/app-events";
import { isDashboardE2E } from "@/lib/e2e-mode";
import { formatCount, formatNumber } from "@/lib/formatters";
import { orpc } from "@/lib/orpc";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import type { DynamicQueryFilter } from "@/types/api";

interface Summary {
	calls: number;
	clients: number;
	environments: string[];
	error_rate: number;
	errors: number;
	last_call: string | null;
	p50_ms: number | null;
	p95_ms: number | null;
	servers: string[];
	sessions: number;
	tools: number;
	tracked: number;
	websites: string[];
}

interface SeriesRow {
	calls: number;
	date: string;
	errors: number;
}

interface ToolRow {
	avg_output_chars: number;
	calls: number;
	clients: string[];
	error_rate: number;
	p50_ms: number;
	p95_ms: number;
	tool: string;
}

interface ClientRow {
	calls: number;
	client: string;
	error_rate: number;
	p95_ms: number;
	user_agents: string[];
	versions: string[];
}

interface ErrorRow {
	clients: string[];
	error_code: string;
	first_seen: string;
	last_seen: string;
	message: string;
	messages: number;
	occurrences: number;
	samples: string[];
	sessions: number;
	tool: string;
}

const FILTERS = {
	client: parseAsString,
	tool: parseAsString,
	server_name: parseAsString,
	environment: parseAsString,
	website_id: parseAsString,
};

const highlighter = createHighlighterCoreSync({
	themes: [vesper],
	langs: [bash, json, tsx],
	engine: createJavaScriptRegexEngine(),
});

const INSTALL_COMMAND = "bun add @databuddy/sdk@latest";
const KEY_PLACEHOLDER = "dbdy_your_key";

const SETUP_SNIPPETS = [
	{
		id: "node",
		label: "Node",
		lang: "tsx",
		note: "Works with McpServer and the low-level Server from @modelcontextprotocol/sdk. Calls go out in batches every second.",
		code: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { trackMcp } from "@databuddy/sdk/mcp";

const server = trackMcp(
  new McpServer({ name: "my-server", version: "1.0.0" })
);`,
	},
	{
		id: "vercel",
		label: "Vercel",
		lang: "tsx",
		note: "waitUntil sends each call before the function stops. With @modelcontextprotocol/server, wrap the server inside the createMcpHandler factory.",
		code: `import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { waitUntil } from "@vercel/functions";
import { trackMcp } from "@databuddy/sdk/mcp";

const handler = createMcpHandler(() =>
  trackMcp(new McpServer({ name: "my-server", version: "1.0.0" }), {
    waitUntil,
  })
);

export const POST = (request: Request) => handler.fetch(request);`,
	},
	{
		id: "cloudflare",
		label: "Cloudflare Workers",
		lang: "tsx",
		note: "Store the key with wrangler secret put DATABUDDY_API_KEY.",
		code: `import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { env, waitUntil } from "cloudflare:workers";
import { trackMcp } from "@databuddy/sdk/mcp";

const handler = createMcpHandler(() =>
  trackMcp(new McpServer({ name: "my-server", version: "1.0.0" }), {
    apiKey: env.DATABUDDY_API_KEY,
    waitUntil,
  })
);

export default {
  fetch: (request: Request) => handler.fetch(request),
};`,
	},
	{
		id: "stdio",
		label: "stdio",
		lang: "json",
		note: "Clients that start a stdio server pass it only the variables in their config, so the key goes in the server's env.",
		code: `{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "DATABUDDY_API_KEY": "${KEY_PLACEHOLDER}",
        "NODE_ENV": "production"
      }
    }
  }
}`,
	},
] as const;

function SnippetBlock({
	code,
	isCopied,
	lang,
	onCopy,
}: {
	code: string;
	isCopied: boolean;
	lang: "bash" | "json" | "tsx";
	onCopy: () => void;
}) {
	const html = useMemo(
		() => highlighter.codeToHtml(code, { lang, theme: "vesper" }),
		[code, lang]
	);
	return (
		<div className="group relative overflow-hidden rounded border border-border">
			<div
				className={cn(
					"overflow-x-auto font-mono text-[13px] leading-relaxed",
					"[&>pre]:m-0 [&>pre]:overflow-visible [&>pre]:p-4 [&>pre]:leading-relaxed",
					"[&>pre>code]:block [&>pre>code]:w-full"
				)}
				dangerouslySetInnerHTML={{ __html: html }}
			/>
			<Button
				className="absolute top-2 right-2"
				onClick={onCopy}
				size="sm"
				variant="secondary"
			>
				{isCopied ? "Copied" : "Copy"}
			</Button>
		</div>
	);
}

function formatMs(ms: number | null) {
	if (ms === null) {
		return "–";
	}
	return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function ClientIcon({ client, size = 20 }: { client: string; size?: number }) {
	return (
		<AiProductIcon
			fallback={
				<span
					className="flex shrink-0 items-center justify-center rounded bg-secondary"
					style={{ height: size, width: size }}
				>
					<PlugIcon className="size-3 text-muted-foreground" />
				</span>
			}
			name={client || "Unknown client"}
			size={size}
		/>
	);
}

function ErrorRate({ className, rate }: { className?: string; rate: number }) {
	return (
		<span
			className={cn(
				"text-muted-foreground tabular-nums",
				className,
				rate >= 5 && "text-destructive"
			)}
		>
			{rate}%
		</span>
	);
}

function RowButton({
	align,
	className,
	density,
	isSelected,
	...props
}: React.ComponentProps<"button"> & {
	align?: "center" | "start";
	density?: "comfortable" | "compact";
	isSelected?: boolean;
}) {
	return (
		<List.Row
			align={align}
			asChild
			className={cn(
				"text-left focus-visible:ring-inset focus-visible:ring-offset-0",
				isSelected && "bg-accent hover:bg-accent",
				className
			)}
			density={density}
		>
			{/* policy-ignore dashboard/no-raw-interactive-html: full-width list row; Button variants add padding and focus styles that fight the row layout */}
			<button aria-pressed={isSelected} type="button" {...props} />
		</List.Row>
	);
}

function FocusChip({
	children,
	label,
	onClear,
}: {
	children: React.ReactNode;
	label: string;
	onClear: () => void;
}) {
	return (
		<Button aria-label={label} onClick={onClear} size="sm" variant="secondary">
			{children}
			<XMarkIcon className="size-3 text-muted-foreground" />
		</Button>
	);
}

function FilterMenu({
	allLabel,
	labelOf = (option) => option,
	onChange,
	options = [],
	value,
}: {
	allLabel: string;
	labelOf?: (option: string) => string;
	onChange: (value: string | null) => void;
	options?: string[];
	value: string | null;
}) {
	if (options.length < 2 && value === null) {
		return null;
	}
	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				render={
					<Button size="sm" variant="secondary">
						{value === null ? allLabel : labelOf(value)}
						<CaretUpDownIcon className="size-3 text-muted-foreground" />
					</Button>
				}
			/>
			<DropdownMenu.Content align="end">
				<DropdownMenu.RadioGroup
					onValueChange={(next) =>
						onChange(typeof next === "string" && next ? next : null)
					}
					value={value ?? ""}
				>
					<DropdownMenu.RadioItem value="">{allLabel}</DropdownMenu.RadioItem>
					{options.map((option) => (
						<DropdownMenu.RadioItem key={option} value={option}>
							{labelOf(option)}
						</DropdownMenu.RadioItem>
					))}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

function Stat({
	detail,
	isLoading,
	label,
	value,
}: {
	detail: string;
	isLoading: boolean;
	label: string;
	value: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1 rounded-lg bg-background p-3">
			<p className="text-muted-foreground text-xs">{label}</p>
			{isLoading ? (
				<Skeleton className="h-13 w-28" />
			) : (
				<>
					<p className="font-semibold text-2xl tabular-nums">{value}</p>
					<p className="truncate text-muted-foreground text-xs tabular-nums">
						{detail}
					</p>
				</>
			)}
		</div>
	);
}

function Panel({
	children,
	description,
	empty,
	isError,
	isLoading,
	title,
}: {
	children: React.ReactNode;
	description: string;
	empty: string | false;
	isError: boolean;
	isLoading: boolean;
	title: string;
}) {
	return (
		<section className="flex min-w-0 flex-col gap-3 rounded-xl bg-secondary p-1.5">
			<div className="px-2 pt-2">
				<p className="font-semibold text-sm">{title}</p>
				<p className="text-pretty text-muted-foreground text-xs">
					{description}
				</p>
			</div>
			<List className="rounded-lg bg-background">
				{isLoading ? (
					Array.from({ length: 3 }, (_, index) => (
						<List.Row interactive={false} key={`skeleton-${index + 1}`}>
							<Skeleton className="h-5 w-32" />
							<Skeleton className="ml-auto h-5 w-16" />
						</List.Row>
					))
				) : isError || empty ? (
					<p className="px-4 py-8 text-center text-muted-foreground text-xs">
						{isError ? "Couldn't load this panel." : empty}
					</p>
				) : (
					children
				)}
			</List>
		</section>
	);
}

type SetupRowId = "key" | "wrap";

function Setup({ organizationId }: { organizationId?: string }) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState<SetupRowId | null>("key");
	const createKey = useMutation({
		...orpc.apikeys.create.mutationOptions(),
		meta: { suppressGlobalErrorToast: true },
		onSuccess: () => {
			setOpen("wrap");
			return queryClient.invalidateQueries({
				queryKey: orpc.apikeys.list.key(),
			});
		},
	});
	const secret = createKey.data?.secret;
	const envLine = `DATABUDDY_API_KEY=${secret ?? KEY_PLACEHOLDER}`;
	const [hasOwnKey, setHasOwnKey] = useState(false);
	const [copied, setCopied] = useState<string | null>(null);
	const [promptAgent, setPromptAgent] = useState<string | null>(null);
	const [isManualOpen, setIsManualOpen] = useState(false);

	const copy = async (id: string, text: string, method: "ai" | "manual") => {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			toast.error("Copy failed. Select the text and copy it manually.");
			return;
		}
		setCopied(id);
		setTimeout(() => setCopied(null), COPY_SUCCESS_TIMEOUT);
		trackAppEvent(APP_EVENTS.mcpSetupCopied, { block: id, method });
		if (method === "ai") {
			setPromptAgent(id);
		}
	};
	const withKey = (code: string) =>
		secret ? code.replace(KEY_PLACEHOLDER, secret) : code;

	const keyStatus: SetupRowStatus = secret
		? "done"
		: hasOwnKey
			? "skipped"
			: "active";
	const wrapStatus: SetupRowStatus = promptAgent ? "waiting" : "active";
	const toggle = (id: SetupRowId) => () =>
		setOpen((current) => (current === id ? null : id));
	const agentName = CODING_AGENTS.find(
		(agent) => agent.id === promptAgent
	)?.name;

	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
			<div className="mb-4 flex items-center justify-between gap-3">
				<h1 className="font-semibold text-xl">Set up MCP Analytics</h1>
				<Button asChild size="sm" variant="ghost">
					<a
						href="https://www.databuddy.cc/docs/sdk/mcp"
						rel="noopener"
						target="_blank"
					>
						Docs
						<OpenExternalIcon className="size-3.5" />
					</a>
				</Button>
			</div>
			<Card className="gap-0 py-0">
				<Card.Header className="gap-3 border-border border-b bg-card px-5 py-4">
					<Card.Title>Your first tool call, in three steps</Card.Title>
					<Progress size="sm" value={keyStatus === "active" ? 0 : 100 / 3} />
				</Card.Header>

				<SetupRow
					detail={secret ? "Created" : hasOwnKey ? "Using your key" : undefined}
					expanded={open === "key"}
					onToggle={toggle("key")}
					status={keyStatus}
					title="Create an API key"
				>
					{secret ? (
						<div className="space-y-2">
							<SnippetBlock
								code={envLine}
								isCopied={copied === "api_key"}
								lang="bash"
								onCopy={() => copy("api_key", envLine, "manual")}
							/>
							<p className="text-pretty text-muted-foreground text-xs">
								Shown once. The prompt and snippets below already include it.
							</p>
						</div>
					) : (
						<div className="space-y-3">
							<p className="text-pretty text-muted-foreground text-sm">
								A key with the Event Tracking scope, read from DATABUDDY_API_KEY
								in your server's environment.
							</p>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									disabled={!organizationId}
									loading={createKey.isPending}
									onClick={() =>
										organizationId &&
										createKey.mutate({
											name: "MCP analytics",
											organizationId,
											type: "automation",
											resources: { global: ["track:events"] },
										})
									}
									size="sm"
								>
									Create a key
								</Button>
								<Button
									onClick={() => {
										setHasOwnKey(true);
										setOpen("wrap");
									}}
									size="sm"
									variant="ghost"
								>
									I already have one
								</Button>
							</div>
							{createKey.error ? (
								<p className="text-pretty text-destructive text-xs">
									{getUserFacingErrorMessage(
										createKey.error,
										"Couldn't create an API key."
									)}{" "}
									Ask an organization admin for a key with the Event Tracking
									scope.
								</p>
							) : null}
						</div>
					)}
				</SetupRow>

				<SetupRow
					detail={agentName ? `Prompt copied for ${agentName}` : undefined}
					expanded={open === "wrap"}
					onToggle={toggle("wrap")}
					status={wrapStatus}
					title="Add trackMcp to your server"
				>
					<div className="space-y-5">
						<div className="space-y-2.5">
							<p className="font-medium text-muted-foreground text-xs">
								Send to your coding agent
							</p>
							<p className="text-pretty text-muted-foreground text-xs">
								Your agent wraps your MCP server and makes a test call. Tool
								arguments and results never leave your server.
							</p>
							<div className="flex flex-wrap gap-2">
								{CODING_AGENTS.map((agent) => (
									<Button
										className="border border-border bg-background hover:bg-accent"
										key={agent.id}
										onClick={() =>
											copy(agent.id, generateMcpAgentPrompt(secret), "ai")
										}
										size="sm"
										variant="ghost"
									>
										{copied === agent.id ? (
											<CheckIcon className="size-4 text-success" />
										) : (
											<img
												alt=""
												className={cn("size-4", agent.invert && "dark:invert")}
												height={16}
												src={`/ai/${agent.icon}.svg`}
												width={16}
											/>
										)}
										{agent.name}
									</Button>
								))}
							</div>
						</div>

						<div>
							<Button
								aria-expanded={isManualOpen}
								className="-ml-2.5"
								onClick={() => setIsManualOpen((value) => !value)}
								size="sm"
								variant="ghost"
							>
								<CaretRightIcon
									className={cn(
										"size-3 transition-transform duration-150",
										isManualOpen && "rotate-90"
									)}
								/>
								Or set it up yourself
							</Button>
							<div
								className={cn(
									"grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
									isManualOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
								)}
								inert={!isManualOpen}
							>
								<div className="min-h-0 overflow-hidden">
									<div className="mt-3 space-y-3">
										<SnippetBlock
											code={INSTALL_COMMAND}
											isCopied={copied === "install"}
											lang="bash"
											onCopy={() => copy("install", INSTALL_COMMAND, "manual")}
										/>
										<SnippetBlock
											code={envLine}
											isCopied={copied === "env"}
											lang="bash"
											onCopy={() => copy("env", envLine, "manual")}
										/>
										<Tabs className="w-full" defaultValue="node">
											<Tabs.List>
												{SETUP_SNIPPETS.map((snippet) => (
													<Tabs.Tab key={snippet.id} value={snippet.id}>
														{snippet.label}
													</Tabs.Tab>
												))}
											</Tabs.List>
											{SETUP_SNIPPETS.map((snippet) => (
												<Tabs.Panel
													className="mt-3 space-y-2"
													key={snippet.id}
													value={snippet.id}
												>
													<SnippetBlock
														code={withKey(snippet.code)}
														isCopied={copied === snippet.id}
														lang={snippet.lang}
														onCopy={() =>
															copy(snippet.id, withKey(snippet.code), "manual")
														}
													/>
													<p className="text-pretty text-muted-foreground text-xs">
														{snippet.note}
													</p>
												</Tabs.Panel>
											))}
										</Tabs>
									</div>
								</div>
							</div>
						</div>
					</div>
				</SetupRow>

				<SetupRow
					detail="This page switches to your analytics when it arrives"
					expanded={false}
					status="waiting"
					title="Waiting for the first tool call"
				/>
			</Card>
		</div>
	);
}

export default function McpPage() {
	const flag = useFlag("mcp");
	const organizationId =
		useOrganizationsContext().activeOrganizationId ?? undefined;
	if (!flag.on) {
		return flag.loading && !(isSelfHosted || isDashboardE2E)
			? null
			: notFound();
	}
	return (
		<Suspense fallback={null}>
			<McpAnalytics key={organizationId} organizationId={organizationId} />
		</Suspense>
	);
}

function McpAnalytics({ organizationId }: { organizationId?: string }) {
	const { websites } = useWebsitesLight();
	const { currentDateRange, dateRange, setDateRangeAction } = useDateFilters();
	const { chartType, chartStepType } = useChartPreferences("overview-main");
	const [selected, setSelected] = useQueryStates(FILTERS);
	const [openError, setOpenError] = useState<string | null>(null);

	const filters: DynamicQueryFilter[] = Object.entries(selected).flatMap(
		([field, value]) =>
			value === null ? [] : [{ field, operator: "eq", value }]
	);
	const {
		getDataForQuery,
		isFetching,
		isPending,
		isPlaceholderData,
		refetch,
		results,
	} = useBatchDynamicQuery(
		{ organizationId },
		dateRange,
		[
			{ id: "summary", parameters: ["mcp_summary"], filters },
			...(filters.length > 0
				? [{ id: "facets", parameters: ["mcp_summary"] }]
				: []),
			{ id: "series", parameters: ["mcp_calls_series"], filters },
			{
				id: "tools",
				parameters: ["mcp_tools"],
				filters: filters.filter((filter) => filter.field !== "tool"),
			},
			{
				id: "clients",
				parameters: ["mcp_clients"],
				filters: filters.filter((filter) => filter.field !== "client"),
			},
			{ id: "errors", parameters: ["mcp_errors"], filters, limit: 20 },
		],
		{
			placeholderData: keepPreviousData,
			refetchInterval: (query) =>
				query.state.data?.results
					.find((result) => result.queryId === "summary")
					?.data.find((item) => item.parameter === "mcp_summary")?.data[0]
					?.tracked === 0
					? 5000
					: 10 * 60 * 1000,
		}
	);
	const summary: Summary | undefined = getDataForQuery(
		"summary",
		"mcp_summary"
	)[0];
	const facets: Summary | undefined =
		getDataForQuery("facets", "mcp_summary")[0] ?? summary;
	const series: SeriesRow[] = getDataForQuery("series", "mcp_calls_series");
	const tools: ToolRow[] = getDataForQuery("tools", "mcp_tools");
	const clients: ClientRow[] = getDataForQuery("clients", "mcp_clients");
	const errors: ErrorRow[] = getDataForQuery("errors", "mcp_errors");

	const hasLoadError = !(
		isPending ||
		results.some((result) => result.queryId === "summary" && result.success)
	);
	const hasFailed = (queryId: string) =>
		results.some((result) => result.queryId === queryId && !result.success);
	const totalCalls = clients.reduce((sum, row) => sum + row.calls, 0);

	return (
		<div className="relative flex h-full flex-col overflow-y-auto">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">MCP Analytics</h1>
				<Badge className="h-5 px-2" variant="warning">
					Alpha
				</Badge>
			</TopBar.Title>
			{facets?.tracked === 0 ? null : (
				<TopBar.Actions>
					<FilterMenu
						allLabel="All websites"
						labelOf={(id) => {
							const website = websites.find((item) => item.id === id);
							return website?.name || website?.domain || id;
						}}
						onChange={(website_id) => setSelected({ website_id })}
						options={facets?.websites}
						value={selected.website_id}
					/>
					<FilterMenu
						allLabel="All servers"
						onChange={(server_name) => setSelected({ server_name })}
						options={facets?.servers}
						value={selected.server_name}
					/>
					<FilterMenu
						allLabel="All environments"
						onChange={(environment) => setSelected({ environment })}
						options={facets?.environments}
						value={selected.environment}
					/>
					<DateRangePicker
						className="w-auto"
						maxDate={new Date()}
						onChange={(range) => {
							if (range?.from && range.to) {
								setDateRangeAction({
									startDate: range.from,
									endDate: range.to,
								});
							}
						}}
						value={{
							from: currentDateRange.startDate,
							to: currentDateRange.endDate,
						}}
					/>
				</TopBar.Actions>
			)}

			{hasLoadError ? (
				<div className="flex flex-1 flex-col p-4">
					<EmptyState
						action={
							<Button
								loading={isFetching}
								onClick={() => refetch()}
								size="md"
								variant="secondary"
							>
								Try again
							</Button>
						}
						description="Databuddy couldn't load MCP activity for this organization."
						icon={<ChartBarIcon />}
						isMainContent
						title="Couldn't load MCP activity"
						variant="error"
					/>
				</div>
			) : facets?.tracked === 0 ? (
				<Setup organizationId={organizationId} />
			) : (
				<div
					className={cn(
						"space-y-4 p-4 transition-opacity ease-in-out",
						isPlaceholderData && "opacity-60"
					)}
				>
					{selected.client === null && selected.tool === null ? null : (
						<div className="flex flex-wrap items-center gap-2">
							{selected.client === null ? null : (
								<FocusChip
									label={`${selected.client || "Unknown client"}, show all clients`}
									onClear={() => setSelected({ client: null })}
								>
									<ClientIcon client={selected.client} size={14} />
									{selected.client || "Unknown client"}
								</FocusChip>
							)}
							{selected.tool === null ? null : (
								<FocusChip
									label={`${selected.tool}, show all tools`}
									onClear={() => setSelected({ tool: null })}
								>
									<span className="font-mono">{selected.tool}</span>
								</FocusChip>
							)}
						</div>
					)}

					<div className="grid gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2 lg:grid-cols-4">
						<Stat
							detail={
								summary?.last_call
									? `Last call ${fromNow(summary.last_call)}`
									: "No calls in this period"
							}
							isLoading={isPending}
							label="Tool calls"
							value={formatNumber(summary?.calls)}
						/>
						<Stat
							detail={formatCount(summary?.errors ?? 0, "failed call")}
							isLoading={isPending}
							label="Error rate"
							value={
								<ErrorRate
									className="text-foreground"
									rate={summary?.error_rate ?? 0}
								/>
							}
						/>
						<Stat
							detail={`Median ${formatMs(summary?.p50_ms ?? null)}`}
							isLoading={isPending}
							label="p95 response time"
							value={formatMs(summary?.p95_ms ?? null)}
						/>
						<Stat
							detail={[
								formatCount(summary?.tools ?? 0, "tool"),
								summary?.sessions
									? formatCount(summary.sessions, "session")
									: null,
							]
								.filter(Boolean)
								.join(", ")}
							isLoading={isPending}
							label="Clients"
							value={formatNumber(summary?.clients)}
						/>
					</div>

					<SimpleMetricsChart
						chartStepType={chartStepType}
						className="rounded-xl"
						data={series.map((row) => ({
							...row,
							date: formatDateByGranularity(row.date, dateRange.granularity),
						}))}
						description="Tool calls AI clients made to your servers"
						height={240}
						isLoading={isPending}
						metrics={[
							{ key: "calls", label: "Calls" },
							{
								key: "errors",
								label: "Failed",
								color: "var(--color-destructive)",
							},
						]}
						partialLastSegment
						seriesKind={chartType}
						showYAxis
						title="Tool calls"
					/>

					<Panel
						description="What AI clients call, how long each call takes, and how much context it hands back to the model. Select one to see only its calls."
						empty={tools.length === 0 && "No tool calls in this period."}
						isError={hasFailed("tools")}
						isLoading={isPending}
						title="Tools"
					>
						<List.Head>
							<span className="flex-1">Tool</span>
							<span className="w-16 text-right">Calls</span>
							<span className="w-16 text-right">Failed</span>
							<span className="hidden w-28 text-right sm:block">
								Median · p95
							</span>
							<span className="hidden w-24 text-right md:block">Result</span>
							<span className="hidden w-20 text-right lg:block">Clients</span>
						</List.Head>
						{tools.map((row) => (
							<RowButton
								isSelected={selected.tool === row.tool}
								key={row.tool}
								onClick={() =>
									setSelected({
										tool: selected.tool === row.tool ? null : row.tool,
									})
								}
							>
								<List.Cell grow>
									<span className="truncate font-mono text-xs">{row.tool}</span>
								</List.Cell>
								<List.Cell align="end" className="w-16 text-sm tabular-nums">
									{formatNumber(row.calls)}
								</List.Cell>
								<List.Cell align="end" className="w-16 text-sm">
									<ErrorRate rate={row.error_rate} />
								</List.Cell>
								<List.Cell
									align="end"
									className="hidden w-28 text-muted-foreground text-sm tabular-nums sm:flex"
								>
									{formatMs(row.p50_ms)} · {formatMs(row.p95_ms)}
								</List.Cell>
								<List.Cell
									align="end"
									className="hidden w-24 text-muted-foreground text-sm tabular-nums md:flex"
								>
									<Tooltip
										content={`${formatNumber(row.avg_output_chars)} characters on average`}
									>
										<span className="cursor-default">
											~{formatNumber(Math.round(row.avg_output_chars / 4))}{" "}
											tokens
										</span>
									</Tooltip>
								</List.Cell>
								<List.Cell align="end" className="hidden w-20 gap-1 lg:flex">
									{row.clients.map((name) => (
										<Tooltip content={name} key={name}>
											<span>
												<ClientIcon client={name} size={16} />
											</span>
										</Tooltip>
									))}
								</List.Cell>
							</RowButton>
						))}
					</Panel>

					<div className="grid gap-4 lg:grid-cols-2">
						<Panel
							description="Which AI clients use your servers. Select one to see only its calls."
							empty={clients.length === 0 && "No clients in this period."}
							isError={hasFailed("clients")}
							isLoading={isPending}
							title="Clients"
						>
							{clients.map((row) => {
								const isSelected = selected.client === row.client;
								return (
									<RowButton
										isSelected={isSelected}
										key={row.client}
										onClick={() =>
											setSelected({ client: isSelected ? null : row.client })
										}
									>
										<List.Cell className="gap-2.5" grow>
											<ClientIcon client={row.client} />
											<div className="min-w-0">
												<p className="truncate font-medium text-sm">
													{row.client || "Unknown client"}
												</p>
												<p className="truncate text-muted-foreground text-xs">
													{row.versions.length > 0
														? row.versions
																.map((version) => `v${version}`)
																.join(", ")
														: row.user_agents.join(", ") ||
															"No version reported"}
												</p>
											</div>
										</List.Cell>
										<List.Cell align="end" className="w-24 flex-col items-end">
											<span className="font-medium text-sm tabular-nums">
												{formatNumber(row.calls)}
											</span>
											<span className="text-muted-foreground text-xs tabular-nums">
												{Math.round((row.calls / totalCalls) * 100)}% of calls
											</span>
										</List.Cell>
										<List.Cell
											align="end"
											className="hidden w-24 flex-col items-end text-xs sm:flex"
										>
											<span className="text-muted-foreground">
												<ErrorRate rate={row.error_rate} /> failed
											</span>
											<span className="text-muted-foreground tabular-nums">
												p95 {formatMs(row.p95_ms)}
											</span>
										</List.Cell>
									</RowButton>
								);
							})}
						</Panel>

						<Panel
							description="Why calls fail, by tool and error code. Select one to see its most common messages."
							empty={errors.length === 0 && "No failed calls in this period."}
							isError={hasFailed("errors")}
							isLoading={isPending}
							title="Errors"
						>
							{errors.map((row) => {
								const key = `${row.tool}:${row.error_code}:${row.error_code ? "" : row.message}`;
								const isOpen = openError === key;
								return (
									<div
										className="border-border/80 border-b last:border-b-0"
										key={key}
									>
										<RowButton
											align="start"
											aria-expanded={isOpen}
											className={cn("border-b-0", isOpen && "pb-1")}
											density="compact"
											onClick={() => setOpenError(isOpen ? null : key)}
										>
											<List.Cell className="flex-col items-start gap-1" grow>
												<span className="flex min-w-0 max-w-full items-center gap-2">
													<span className="truncate font-mono text-xs">
														{row.tool}
													</span>
													{row.error_code ? (
														<Badge
															className="font-mono"
															size="sm"
															variant="muted"
														>
															{row.error_code}
														</Badge>
													) : null}
												</span>
												{isOpen ? null : (
													<>
														<span className="wrap-anywhere line-clamp-2 text-muted-foreground text-xs">
															{row.message || "No message"}
														</span>
														{row.messages > 1 ? (
															<span className="text-muted-foreground text-xs">
																{formatCount(row.messages - 1, "other message")}
															</span>
														) : null}
													</>
												)}
											</List.Cell>
											<List.Cell
												align="end"
												className="w-24 flex-col items-end"
											>
												<span className="font-medium text-sm tabular-nums">
													{formatNumber(row.occurrences)}×
												</span>
												<span className="text-muted-foreground text-xs">
													{fromNow(row.last_seen)}
												</span>
											</List.Cell>
										</RowButton>
										{isOpen ? (
											<div className="flex flex-col gap-2 px-3 pb-3 text-muted-foreground text-xs sm:px-4">
												<p className="wrap-anywhere">
													{row.message || "No message"}
												</p>
												{row.samples
													.filter((sample) => sample !== row.message)
													.map((sample) => (
														<p
															className="wrap-anywhere border-border border-l-2 pl-2"
															key={sample}
														>
															{sample || "No message"}
														</p>
													))}
												<div className="flex flex-wrap items-center gap-1.5">
													{row.clients.map((name) => (
														<ClientIcon client={name} key={name} size={14} />
													))}
													First seen {fromNow(row.first_seen)}
													{row.sessions > 0
														? `, ${formatCount(row.sessions, "session")}`
														: null}
												</div>
											</div>
										) : null}
									</div>
								);
							})}
						</Panel>
					</div>
				</div>
			)}
		</div>
	);
}
