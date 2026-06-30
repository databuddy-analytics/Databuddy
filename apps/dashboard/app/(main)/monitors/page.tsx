"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
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
import { Button, Card, EmptyState, Skeleton } from "@databuddy/ui";
import { MonitorsSearchBar } from "./_components/monitors-search-bar";
import type { Monitor } from "./_components/types";
import {
	type SortOption,
	type StatusFilter,
	useFilteredMonitors,
} from "./_components/use-filtered-monitors";

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
		jsonParsingConfig?: {
			enabled: boolean;
		} | null;
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
			jsonParsingConfig: schedule.jsonParsingConfig,
		});
		setIsSheetOpen(true);
	};

	const handleDelete = () => {
		schedulesQuery.refetch();
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

	const monitors = (schedulesQuery.data ?? []) as Monitor[];
	const filtered = useFilteredMonitors(monitors, search, sort, statusFilter);
	const isLoading = schedulesQuery.isLoading;
	const hasPaused = monitors.some((m) => m.isPaused);
	const hasMonitors = monitors.length > 0;
	const noResults = !isLoading && hasMonitors && filtered.length === 0;

	return (
		<ErrorBoundary>
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-2xl space-y-6 p-5">
					<Card>
						<Card.Header className="flex-row items-start justify-between gap-4">
							<div>
								<Card.Title>Monitors</Card.Title>
								<Card.Description>
									{isLoading
										? "Loading monitors\u2026"
										: monitors.length === 0
											? "Track availability and receive alerts"
											: `${monitors.length} monitor${monitors.length === 1 ? "" : "s"}`}
								</Card.Description>
							</div>
							<div className="flex items-center gap-2">
								<Button
									aria-label="Refresh monitors"
									disabled={
										schedulesQuery.isLoading || schedulesQuery.isFetching
									}
									onClick={() => schedulesQuery.refetch()}
									size="sm"
									variant="ghost"
								>
									<ArrowClockwiseIcon
										className={cn(
											"size-3.5",
											(schedulesQuery.isLoading || schedulesQuery.isFetching) &&
												"animate-spin"
										)}
									/>
								</Button>
								<Button onClick={handleCreate} size="sm">
									<PlusIcon className="size-3.5" />
									Create Monitor
								</Button>
							</div>
						</Card.Header>
						<Card.Content className="p-0">
							{isLoading && (
								<div className="divide-y">
									{Array.from({ length: 3 }).map((_, i) => (
										<div
											className="flex items-center gap-4 px-5 py-3"
											key={`skel-${i + 1}`}
										>
											<Skeleton className="size-10 shrink-0 rounded-lg" />
											<div className="min-w-0 flex-1 space-y-2">
												<div className="flex items-center gap-2">
													<Skeleton className="h-4 w-40" />
													<Skeleton className="h-4 w-16 rounded-full" />
												</div>
												<Skeleton className="h-3.5 w-56" />
											</div>
										</div>
									))}
								</div>
							)}

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
										description="Create your first uptime monitor to start tracking availability and receive alerts when services go down."
										icon={<HeartbeatIcon weight="duotone" />}
										title="No monitors yet"
									/>
								</div>
							)}

							{!isLoading && hasMonitors && (
								<>
									<div className="border-b px-4 py-2">
										<MonitorsSearchBar
											hasPaused={hasPaused}
											onSearchQueryChangeAction={setSearch}
											onSortByChangeAction={setSort}
											onStatusFilterChangeAction={setStatusFilter}
											searchQuery={search}
											sortBy={sort}
											statusFilter={statusFilter}
										/>
									</div>
									{noResults ? (
										<div className="px-5 py-12">
											<EmptyState
												description={`No monitors match \u201c${search}\u201d`}
												icon={<MagnifyingGlassIcon weight="duotone" />}
												title="No results"
												variant="minimal"
											/>
										</div>
									) : (
										<div className="divide-y">
											{filtered.map((monitor) => (
												<MonitorRow
													key={monitor.id}
													onDeleteAction={handleDelete}
													onEditAction={() => handleEdit(monitor)}
													onRefetchAction={schedulesQuery.refetch}
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
							onSaveAction={schedulesQuery.refetch}
							open={isSheetOpen}
							schedule={editingSchedule}
						/>
					</Suspense>
				)}
			</div>
		</ErrorBoundary>
	);
}
