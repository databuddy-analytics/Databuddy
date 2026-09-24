"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { ErrorBoundary } from "@/components/error-boundary";
import { MonitorRow } from "@/components/monitors/monitor-row";
import { MonitorSheet } from "@/components/monitors/monitor-sheet";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	ArrowClockwiseIcon,
	HeartbeatIcon,
	MagnifyingGlassIcon,
	PlusIcon,
} from "@databuddy/ui/icons";
import { List } from "@/components/ui/composables/list";
import { Button, Card, EmptyState } from "@databuddy/ui";
import { ListSearchBar } from "./_components/monitors-search-bar";
import {
	type SortOption,
	useFilteredList,
} from "./_components/use-filtered-monitors";

type Monitor = Awaited<
	ReturnType<typeof orpc.uptime.listSchedules.call>
>[number];
type StatusFilter = "all" | "active" | "paused";

const STATUS_LABELS: Record<StatusFilter, string> = {
	all: "All",
	active: "Active",
	paused: "Paused",
};

const monitorSearchFields = (m: Monitor): [string, ...(string | null)[]] => [
	m.name || m.url || "",
	m.url,
	m.website?.name ?? null,
	m.website?.domain ?? null,
];

export default function MonitorsPage() {
	return (
		<Suspense fallback={null}>
			<MonitorsPageContent />
		</Suspense>
	);
}

function MonitorsPageContent() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<SortOption>("newest");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [editingSchedule, setEditingSchedule] = useState<{
		id: string;
		url: string;
		name?: string | null;
		granularity: string;
		timeout?: number | null;
		cacheBust?: boolean;
	} | null>(null);

	const schedulesQuery = useQuery({
		...orpc.uptime.listSchedules.queryOptions({ input: {} }),
	});

	const clearCommandParam = useCallback(() => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("command");
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}, [pathname, router, searchParams]);

	const handleCreate = useCallback(() => {
		setEditingSchedule(null);
		setIsSheetOpen(true);
	}, []);

	const handleEdit = (schedule: Monitor) => {
		setEditingSchedule({
			id: schedule.id,
			url: schedule.url ?? "",
			name: schedule.name,
			granularity: schedule.granularity,
			timeout: schedule.timeout,
			cacheBust: schedule.cacheBust,
		});
		setIsSheetOpen(true);
	};

	const handleSheetClose = () => {
		setIsSheetOpen(false);
		setEditingSchedule(null);
	};

	useEffect(() => {
		if (searchParams.get("command") !== "create-monitor") {
			return;
		}
		handleCreate();
		clearCommandParam();
	}, [clearCommandParam, handleCreate, searchParams]);

	const monitors = schedulesQuery.data ?? [];
	const filtered = useFilteredList(
		statusFilter === "all"
			? monitors
			: monitors.filter((m) => m.isPaused === (statusFilter === "paused")),
		search,
		sort,
		monitorSearchFields
	);
	const isLoading = schedulesQuery.isLoading;
	const hasPaused = monitors.some((m) => m.isPaused);
	const hasMonitors = monitors.length > 0;
	const noResults = !isLoading && hasMonitors && filtered.length === 0;

	return (
		<ErrorBoundary>
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Monitors</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					aria-label="Refresh monitors"
					disabled={schedulesQuery.isLoading || schedulesQuery.isFetching}
					onClick={() => schedulesQuery.refetch()}
					size="sm"
					variant="secondary"
				>
					<ArrowClockwiseIcon
						className={cn(
							"size-4 shrink-0",
							(schedulesQuery.isLoading || schedulesQuery.isFetching) &&
								"animate-spin"
						)}
					/>
				</Button>
				<Button onClick={handleCreate} size="sm">
					<PlusIcon className="size-4 shrink-0" />
					Create Monitor
				</Button>
			</TopBar.Actions>
			<div className="flex-1 overflow-y-auto">
				<div className="space-y-6 p-5">
					<Card>
						<Card.Content className="p-0">
							{isLoading && <List.DefaultLoading />}

							{!(isLoading || hasMonitors) && (
								<div className="px-5 py-12">
									<EmptyState
										action={
											<Button
												onClick={handleCreate}
												size="sm"
												variant="secondary"
											>
												<PlusIcon className="size-3.5" />
												Create Monitor
											</Button>
										}
										description="Create your first uptime monitor to track availability, then link an alert to get notified when services go down."
										icon={<HeartbeatIcon />}
										title="No monitors yet"
									/>
								</div>
							)}

							{!isLoading && hasMonitors && (
								<>
									<div className="border-b px-4 py-2">
										<ListSearchBar
											onSearchQueryChangeAction={setSearch}
											onSortByChangeAction={setSort}
											onStatusFilterChangeAction={setStatusFilter}
											placeholder="Search monitors"
											searchQuery={search}
											showStatusFilter={hasPaused || statusFilter !== "all"}
											sortBy={sort}
											statusFilter={statusFilter}
											statusLabels={STATUS_LABELS}
										/>
									</div>
									{noResults ? (
										<div className="px-5 py-12">
											<EmptyState
												description={
													search
														? `No monitors match \u201c${search}\u201d`
														: "No monitors match the current filter"
												}
												icon={<MagnifyingGlassIcon />}
												title="No results"
												variant="minimal"
											/>
										</div>
									) : (
										<div className="divide-y">
											{filtered.map((monitor) => (
												<MonitorRow
													key={monitor.id}
													onEditAction={() => handleEdit(monitor)}
													schedule={monitor}
												/>
											))}
										</div>
									)}
								</>
							)}
						</Card.Content>
					</Card>
				</div>

				{isSheetOpen && (
					<Suspense fallback={null}>
						<MonitorSheet
							onCloseAction={handleSheetClose}
							open={isSheetOpen}
							schedule={editingSchedule}
						/>
					</Suspense>
				)}
			</div>
		</ErrorBoundary>
	);
}
