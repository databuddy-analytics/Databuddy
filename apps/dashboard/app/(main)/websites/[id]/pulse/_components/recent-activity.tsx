"use client";

import {
	CheckCircleIcon,
	ClockCounterClockwiseIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import type { RefCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatLocalTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface RecentActivityCheck {
	error?: string;
	http_code: number;
	probe_ip?: string;
	probe_region: string;
	status: number; // 1 = up, 0 = down, 2 = pending
	timestamp: string;
	total_ms: number;
}

interface RecentActivityProps {
	checks: RecentActivityCheck[];
	hasMore?: boolean;
	isLoading?: boolean;
	isLoadingMore?: boolean;
	loadMoreRef?: RefCallback<HTMLTableCellElement | null>;
}

export function recentActivityCheckKey(check: RecentActivityCheck) {
	return `${check.timestamp}-${check.probe_region}-${check.probe_ip ?? ""}-${check.http_code}-${check.total_ms}`;
}

function resolveCheckDisplay(check: RecentActivityCheck) {
	if (check.status === 1) {
		return { label: "Operational", tone: "up" } as const;
	}
	if (check.status === 2) {
		return { label: "Pending", tone: "pending" } as const;
	}
	if (check.http_code > 0 && check.http_code < 500) {
		return { label: "Degraded", tone: "degraded" } as const;
	}
	return { label: "Downtime", tone: "down" } as const;
}

function LoadMoreSkeletonRow() {
	return (
		<TableRow className="h-[52px] border-b hover:bg-transparent">
			<TableCell className="py-2.5">
				<div className="flex items-center gap-2.5">
					<Skeleton className="size-4 shrink-0 rounded" />
					<Skeleton className="h-4 w-28 rounded" />
				</div>
			</TableCell>
			<TableCell className="py-2.5">
				<Skeleton className="mx-auto h-4 w-28 rounded" />
			</TableCell>
			<TableCell className="py-2.5">
				<Skeleton className="mx-auto h-5 w-16 rounded" />
			</TableCell>
			<TableCell className="py-2.5">
				<Skeleton className="mx-auto h-4 w-24 rounded" />
			</TableCell>
			<TableCell className="py-2.5">
				<Skeleton className="mx-auto h-4 w-14 rounded" />
			</TableCell>
		</TableRow>
	);
}

function InitialTableSkeleton({ rows }: { rows: number }) {
	return (
		<div className="bg-card">
			<div className="border-b bg-card px-3">
				<div className="flex h-10 items-center gap-6 border-transparent border-b">
					<Skeleton className="h-4 w-14 rounded" />
					<Skeleton className="h-4 w-12 rounded" />
					<Skeleton className="h-4 w-16 rounded" />
					<Skeleton className="h-4 w-8 rounded" />
					<Skeleton className="h-4 w-16 rounded" />
				</div>
			</div>
			<Table>
				<TableBody>
					{Array.from({ length: rows }).map((_, i) => (
						<LoadMoreSkeletonRow key={`sk-${i}`} />
					))}
				</TableBody>
			</Table>
		</div>
	);
}

export function RecentActivityTableSkeleton({ rows = 8 }: { rows?: number }) {
	return <InitialTableSkeleton rows={rows} />;
}

export function RecentActivity({
	checks,
	hasMore = false,
	isLoadingMore = false,
	loadMoreRef,
}: RecentActivityProps) {
	return (
		<section aria-label="Recent activity">
			<div className="p-0">
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
						<TableRow className="border-b-0 hover:bg-transparent">
							<TableHead className="text-balance text-left text-xs sm:text-sm">
								Status
							</TableHead>
							<TableHead className="text-balance text-center text-xs sm:text-sm">
								Time
							</TableHead>
							<TableHead className="hidden text-balance text-center text-xs sm:table-cell sm:text-sm">
								Region
							</TableHead>
							<TableHead className="hidden text-balance text-center text-xs md:table-cell md:text-sm">
								IP
							</TableHead>
							<TableHead className="text-balance text-center text-xs sm:text-sm">
								Duration
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{checks.length === 0 ? (
							<TableRow className="hover:bg-transparent">
								<TableCell className="h-auto py-14 text-center" colSpan={5}>
									<div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4">
										<div className="flex size-11 items-center justify-center rounded border bg-muted/50 text-muted-foreground">
											<ClockCounterClockwiseIcon
												aria-hidden
												size={22}
												weight="duotone"
											/>
										</div>
										<div className="space-y-1">
											<p className="text-balance font-medium text-foreground text-sm">
												No checks in this range
											</p>
											<p className="text-pretty text-muted-foreground text-xs leading-relaxed">
												Widen the date filter or wait for the next scheduled run
												to see results here.
											</p>
										</div>
									</div>
								</TableCell>
							</TableRow>
						) : (
							checks.map((check) => (
								<TableRow key={recentActivityCheckKey(check)}>
									<TableCell className="max-w-[min(100%,14rem)] align-middle">
										{(() => {
											const display = resolveCheckDisplay(check);
											const iconMap = {
												up: (
													<CheckCircleIcon
														aria-hidden
														className="mt-0.5 shrink-0 text-emerald-500 sm:mt-0"
														size={18}
														weight="fill"
													/>
												),
												pending: (
													<WarningCircleIcon
														aria-hidden
														className="mt-0.5 shrink-0 text-amber-500 sm:mt-0"
														size={18}
														weight="fill"
													/>
												),
												degraded: (
													<WarningCircleIcon
														aria-hidden
														className="mt-0.5 shrink-0 text-amber-500 sm:mt-0"
														size={18}
														weight="fill"
													/>
												),
												down: (
													<XCircleIcon
														aria-hidden
														className="mt-0.5 shrink-0 text-red-500 sm:mt-0"
														size={18}
														weight="fill"
													/>
												),
											};

											return (
												<div className="flex items-start gap-2.5 sm:items-center">
													{iconMap[display.tone]}
													<div className="flex min-w-0 flex-col gap-0.5">
														<span className="font-medium text-sm leading-tight">
															{display.label}
														</span>
														{display.tone === "down" && check.error ? (
															<span
																className="line-clamp-2 text-pretty text-destructive text-xs leading-snug"
																title={check.error}
															>
																{check.error}
															</span>
														) : display.tone === "degraded" ? (
															<span className="text-muted-foreground text-xs leading-snug">
																HTTP {check.http_code}
															</span>
														) : null}
													</div>
												</div>
											);
										})()}
									</TableCell>
									<TableCell className="text-center align-middle text-muted-foreground text-xs tabular-nums">
										{formatLocalTime(check.timestamp, "MMM D, HH:mm:ss")}
									</TableCell>
									<TableCell className="hidden text-center align-middle sm:table-cell">
										<Badge
											className="font-mono text-[10px] tabular-nums"
											variant="outline"
										>
											{check.probe_region || "Global"}
										</Badge>
									</TableCell>
									<TableCell className="hidden text-center align-middle font-mono text-muted-foreground text-xs tabular-nums md:table-cell">
										{check.probe_ip || "—"}
									</TableCell>
									<TableCell className="text-center align-middle font-mono text-xs tabular-nums">
										<span
											className={cn(
												check.total_ms < 200 && "text-emerald-600",
												check.total_ms >= 200 &&
													check.total_ms < 500 &&
													"text-amber-600",
												check.total_ms >= 500 && "text-red-600"
											)}
										>
											{Math.round(check.total_ms)}ms
										</span>
									</TableCell>
								</TableRow>
							))
						)}
						{hasMore && loadMoreRef ? (
							<>
								<TableRow className="hover:bg-transparent">
									<TableCell
										className="h-px p-0"
										colSpan={5}
										ref={loadMoreRef}
									/>
								</TableRow>
								{isLoadingMore ? (
									<>
										<LoadMoreSkeletonRow />
										<LoadMoreSkeletonRow />
									</>
								) : null}
							</>
						) : null}
					</TableBody>
				</Table>
			</div>
		</section>
	);
}
