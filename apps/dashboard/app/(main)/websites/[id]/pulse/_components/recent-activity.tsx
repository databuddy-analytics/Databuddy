"use client";

import {
	CheckCircleIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Check {
	timestamp: string;
	status: number; // 1 = up, 0 = down, 2 = pending
	total_ms: number;
	http_code: number;
	probe_region: string;
	probe_ip?: string;
	error?: string;
}

interface RecentActivityProps {
	checks: Check[];
	isLoading?: boolean;
}

export function RecentActivity({ checks, isLoading }: RecentActivityProps) {
	if (isLoading) {
		return (
			<>
				<div className="border-b px-4 py-3">
					<h3 className="font-semibold text-lg text-sidebar-foreground">
						Recent Activity
					</h3>
				</div>
				<div className="p-4">
					<div className="space-y-4">
						{[...new Array(5)].map((_, i) => (
							<div
								className="h-10 w-full animate-pulse rounded bg-muted"
								key={i}
							/>
						))}
					</div>
				</div>
			</>
		);
	}

	return (
		<>
			<div className="border-b px-4 py-3">
				<h3 className="font-semibold text-lg text-sidebar-foreground">
					Recent Activity
				</h3>
			</div>
			<div className="p-0">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="text-balance text-left">Status</TableHead>
							<TableHead className="text-balance text-center">Time</TableHead>
							<TableHead className="text-balance text-center">Region</TableHead>
							<TableHead className="text-balance text-center">IP</TableHead>
							<TableHead className="text-balance text-center">
								Duration
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{checks.length === 0 ? (
							<TableRow>
								<TableCell className="h-24 text-center" colSpan={5}>
									No recent checks found.
								</TableCell>
							</TableRow>
						) : (
							checks.map((check, i) => (
								<TableRow key={`${check.timestamp}-${i}`}>
									<TableCell className="items-left flex text-balance text-left">
										<div className="flex items-center justify-center gap-2">
											{check.status === 1 ? (
												<CheckCircleIcon
													className="text-emerald-500"
													size={18}
													weight="fill"
												/>
											) : check.status === 2 ? (
												<WarningCircleIcon
													className="text-amber-500"
													size={18}
													weight="fill"
												/>
											) : (
												<XCircleIcon
													className="text-red-500"
													size={18}
													weight="fill"
												/>
											)}
											<div className="flex flex-col">
												<span className="font-medium text-sm">
													{check.status === 1
														? "Operational"
														: check.status === 2
															? "Pending"
															: "Downtime"}
												</span>
												{check.status !== 1 && check.error && (
													<span className="max-w-[150px] truncate text-destructive text-xs">
														{check.error}
													</span>
												)}
											</div>
										</div>
									</TableCell>
									<TableCell className="text-center text-muted-foreground text-xs">
										{dayjs(check.timestamp).format("MMM D, HH:mm:ss")}
									</TableCell>
									<TableCell className="text-center text-muted-foreground text-xs">
										<Badge className="font-mono text-[10px]" variant="outline">
											{check.probe_region || "Global"}
										</Badge>
									</TableCell>
									<TableCell className="text-center font-mono text-muted-foreground text-xs">
										{check.probe_ip || "—"}
									</TableCell>
									<TableCell className="text-center font-mono text-xs">
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
					</TableBody>
				</Table>
			</div>
		</>
	);
}
