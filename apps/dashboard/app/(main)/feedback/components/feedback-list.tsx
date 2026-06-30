"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
	BookOpenIcon,
	BugIcon,
	CaretDownIcon,
	ChatTextIcon,
	FlagIcon,
	GaugeIcon,
	LightbulbIcon,
	WrenchIcon,
} from "@databuddy/ui/icons";
import { DropdownMenu } from "@databuddy/ui/client";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FieldTriggerButton,
	Skeleton,
	dayjs,
} from "@databuddy/ui";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { FeedbackStatusBadge } from "./feedback-status-badge";

type FeedbackStatus = "pending" | "approved" | "rejected";
type StatusFilter = FeedbackStatus | "all";

interface FeedbackItem {
	category: string;
	createdAt: Date | string;
	creditsAwarded: number;
	description: string;
	id: string;
	status: FeedbackStatus;
	title: string;
}

const STATUS_FILTERS: Array<{ label: string; value: StatusFilter }> = [
	{ label: "All", value: "all" },
	{ label: "Pending", value: "pending" },
	{ label: "Approved", value: "approved" },
	{ label: "Rejected", value: "rejected" },
];

const CATEGORY_CONFIG: Record<
	string,
	{ color: string; icon: typeof BugIcon; label: string }
> = {
	bug_report: {
		label: "Bug Report",
		icon: BugIcon,
		color: "bg-destructive/10 text-destructive",
	},
	feature_request: {
		label: "Feature Request",
		icon: LightbulbIcon,
		color: "bg-warning/10 text-warning",
	},
	ux_improvement: {
		label: "UX Improvement",
		icon: WrenchIcon,
		color: "bg-sky-500/10 text-sky-500",
	},
	performance: {
		label: "Performance",
		icon: GaugeIcon,
		color: "bg-emerald-500/10 text-emerald-500",
	},
	documentation: {
		label: "Documentation",
		icon: BookOpenIcon,
		color: "bg-violet-500/10 text-violet-500",
	},
	other: {
		label: "Other",
		icon: FlagIcon,
		color: "bg-sidebar-accent text-sidebar-foreground/55",
	},
};

function FeedbackRowSkeleton() {
	return (
		<div className="grid gap-3 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_7rem]">
			<Skeleton className="size-8 rounded" />
			<div className="min-w-0 space-y-1.5">
				<Skeleton className="h-3.5 w-56 max-w-full rounded" />
				<Skeleton className="h-3 w-full max-w-96 rounded" />
			</div>
			<Skeleton className="hidden h-7 rounded sm:block" />
		</div>
	);
}

function StatusFilterButton({
	active,
	count,
	label,
	onClick,
}: {
	active: boolean;
	count: number;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			className={cn(
				"h-7 gap-1.5 px-2 text-xs",
				active && "bg-sidebar text-sidebar-foreground shadow-xs"
			)}
			onClick={onClick}
			size="sm"
			variant={active ? "secondary" : "ghost"}
		>
			{label}
			<span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] text-sidebar-foreground/45 tabular-nums">
				{count}
			</span>
		</Button>
	);
}

function FeedbackRow({
	item,
	isExpanded,
	onToggle,
}: {
	isExpanded: boolean;
	item: FeedbackItem;
	onToggle: () => void;
}) {
	const config = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.other;
	const Icon = config.icon;
	const creditsText =
		item.status === "approved" && item.creditsAwarded > 0
			? `+${item.creditsAwarded.toLocaleString()}`
			: null;

	return (
		<button
			aria-expanded={isExpanded}
			className="group w-full text-left transition-colors hover:bg-sidebar-accent/35"
			onClick={onToggle}
			type="button"
		>
			<div className="grid gap-3 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
				<div
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded",
						config.color
					)}
				>
					<Icon className="size-4" />
				</div>

				<div className="min-w-0">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<p className="min-w-0 flex-1 truncate font-semibold text-foreground text-sm">
							{item.title}
						</p>
						<FeedbackStatusBadge status={item.status} />
					</div>

					{isExpanded ? (
						<div className="mt-2 rounded border border-sidebar-border/50 bg-sidebar-accent/25 px-3 py-2 text-muted-foreground text-sm leading-6">
							{item.description}
						</div>
					) : (
						<p className="mt-1 line-clamp-1 text-muted-foreground text-sm">
							{item.description}
						</p>
					)}

					<div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
						<span>{config.label}</span>
						<span className="text-muted-foreground/40">/</span>
						<span>{dayjs(item.createdAt).fromNow()}</span>
						{creditsText && (
							<>
								<span className="text-muted-foreground/40">/</span>
								<span className="text-success tabular-nums">
									{creditsText} credits
								</span>
							</>
						)}
					</div>
				</div>

				<div className="hidden items-start gap-2 sm:flex">
					{creditsText && (
						<Badge className="tabular-nums" size="sm" variant="success">
							{creditsText}
						</Badge>
					)}
					<CaretDownIcon
						className={cn(
							"mt-1 size-3.5 shrink-0 text-muted-foreground/45 transition-transform",
							isExpanded && "rotate-180"
						)}
					/>
				</div>
			</div>
		</button>
	);
}

export function FeedbackList() {
	const { data: items, isLoading } = useQuery(
		orpc.feedback.list.queryOptions({ input: {} })
	);

	const [categoryFilter, setCategoryFilter] = useState("all");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const categories = useMemo(() => {
		if (!items) {
			return [];
		}
		return Array.from(new Set(items.map((i) => i.category))).toSorted();
	}, [items]);

	const statusCounts = useMemo<Record<StatusFilter, number>>(() => {
		const source = items ?? [];
		return {
			all: source.length,
			pending: source.filter((item) => item.status === "pending").length,
			approved: source.filter((item) => item.status === "approved").length,
			rejected: source.filter((item) => item.status === "rejected").length,
		};
	}, [items]);

	const filtered = useMemo(() => {
		if (!items) {
			return [];
		}
		return items.filter((item) => {
			const categoryMatches =
				categoryFilter === "all" || item.category === categoryFilter;
			const statusMatches =
				statusFilter === "all" || item.status === statusFilter;
			return categoryMatches && statusMatches;
		});
	}, [items, categoryFilter, statusFilter]);

	const hasItems = !!items?.length;
	const hasFilters = categoryFilter !== "all" || statusFilter !== "all";
	const categoryLabel =
		categoryFilter === "all"
			? "All categories"
			: (CATEGORY_CONFIG[categoryFilter]?.label ?? categoryFilter);

	return (
		<Card className="min-h-[520px] border-sidebar-border/60 bg-sidebar">
			<Card.Header className="border-sidebar-border/50 border-b bg-sidebar px-4 py-3">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<Card.Title>Feedback queue</Card.Title>
						<Card.Description>
							{isLoading
								? "Loading submissions"
								: `${statusCounts.all.toLocaleString()} submissions / ${statusCounts.pending.toLocaleString()} pending`}
						</Card.Description>
					</div>

					{hasItems && (
						<Badge className="w-fit tabular-nums" variant="muted">
							{filtered.length.toLocaleString()} shown
						</Badge>
					)}
				</div>

				{hasItems && (
					<div className="mt-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
						<div className="flex w-full gap-0.5 overflow-x-auto rounded bg-sidebar-accent/40 p-0.5 xl:w-fit">
							{STATUS_FILTERS.map((filter) => (
								<StatusFilterButton
									active={statusFilter === filter.value}
									count={statusCounts[filter.value]}
									key={filter.value}
									label={filter.label}
									onClick={() => setStatusFilter(filter.value)}
								/>
							))}
						</div>

						<div className="flex items-center gap-2">
							{categories.length > 1 && (
								<DropdownMenu>
									<DropdownMenu.Trigger
										render={
											<FieldTriggerButton className="h-8 w-auto gap-1.5">
												<span>{categoryLabel}</span>
												<CaretDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
											</FieldTriggerButton>
										}
									/>
									<DropdownMenu.Content align="end">
										<DropdownMenu.RadioGroup
											onValueChange={setCategoryFilter}
											value={categoryFilter}
										>
											<DropdownMenu.RadioItem value="all">
												All categories
											</DropdownMenu.RadioItem>
											{categories.map((cat) => (
												<DropdownMenu.RadioItem key={cat} value={cat}>
													{CATEGORY_CONFIG[cat]?.label ?? cat}
												</DropdownMenu.RadioItem>
											))}
										</DropdownMenu.RadioGroup>
									</DropdownMenu.Content>
								</DropdownMenu>
							)}

							{hasFilters && (
								<Button
									onClick={() => {
										setCategoryFilter("all");
										setStatusFilter("all");
									}}
									size="sm"
									variant="ghost"
								>
									Clear
								</Button>
							)}
						</div>
					</div>
				)}
			</Card.Header>

			<Card.Content className="p-0">
				{isLoading ? (
					<div className="divide-y divide-sidebar-border/40">
						<FeedbackRowSkeleton />
						<FeedbackRowSkeleton />
						<FeedbackRowSkeleton />
					</div>
				) : !items || items.length === 0 ? (
					<div className="py-12">
						<EmptyState
							description="Submitted items will appear here."
							icon={<ChatTextIcon />}
							title="No feedback yet"
						/>
					</div>
				) : filtered.length === 0 ? (
					<div className="py-12">
						<EmptyState
							action={
								<Button
									onClick={() => {
										setCategoryFilter("all");
										setStatusFilter("all");
									}}
									size="sm"
									variant="ghost"
								>
									Clear filters
								</Button>
							}
							icon={<ChatTextIcon />}
							title="No matching feedback"
						/>
					</div>
				) : (
					<div className="divide-y divide-sidebar-border/40">
						{filtered.map((item) => (
							<FeedbackRow
								isExpanded={expandedId === item.id}
								item={item}
								key={item.id}
								onToggle={() =>
									setExpandedId(expandedId === item.id ? null : item.id)
								}
							/>
						))}
					</div>
				)}
			</Card.Content>
		</Card>
	);
}
