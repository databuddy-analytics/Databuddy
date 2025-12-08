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

type Check = {
	timestamp: string;
	status: number; // 1 = up, 0 = down, 2 = pending
	total_ms: number;
	http_code: number;
	probe_region: string;
	error?: string;
};

type RecentActivityProps = {
	checks: Check[];
	isLoading?: boolean;
};

export function RecentActivity({ checks, isLoading }: RecentActivityProps) {
	if (isLoading) {
		return (
			<>
				<div className="border-b px-4 py-3">
					<h3 className="font-semibold text-lg text-sidebar-foreground tracking-tight">
						Recent Activity
					</h3>
				</div>
				<div className="p-4">
					<div className="space-y-4">
						{[...Array(5)].map((_, i) => (
							<div
								key={i}
								className="h-10 w-full animate-pulse rounded bg-muted"
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
				<h3 className="font-semibold text-lg text-sidebar-foreground tracking-tight">
					Recent Activity
				</h3>
			</div>
			<div className="p-0">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="w-[50px]"></TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Time</TableHead>
							<TableHead>Region</TableHead>
							<TableHead className="text-right">Duration</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{checks.length === 0 ? (
							<TableRow>
								<TableCell colSpan={5} className="h-24 text-center">
									No recent checks found.
								</TableCell>
							</TableRow>
						) : (
							checks.map((check, i) => (
								<TableRow key={`${check.timestamp}-${i}`}>
									<TableCell>
										{check.status === 1 ? (
											<CheckCircleIcon
												size={18}
												className="text-emerald-500"
												weight="fill"
											/>
										) : check.status === 2 ? (
											<WarningCircleIcon
												size={18}
												className="text-amber-500"
												weight="fill"
											/>
										) : (
											<XCircleIcon
												size={18}
												className="text-red-500"
												weight="fill"
											/>
										)}
									</TableCell>
									<TableCell>
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
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{dayjs(check.timestamp).format("MMM D, HH:mm:ss")}
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										<Badge variant="outline" className="font-mono text-[10px]">
											{check.probe_region || "Global"}
										</Badge>
									</TableCell>
									<TableCell className="text-right font-mono text-xs">
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
