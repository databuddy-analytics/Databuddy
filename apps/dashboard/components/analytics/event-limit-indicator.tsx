"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatLocaleNumber } from "@/lib/format-locale-number";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { WarningIcon } from "@databuddy/ui/icons";
import { buttonVariants } from "@databuddy/ui";

export function EventLimitIndicator() {
	const pathname = usePathname();
	const isDemoRoute = pathname?.startsWith("/demo/");

	const { data } = useQuery({
		...orpc.organizations.getUsage.queryOptions(),
		enabled: !isDemoRoute,
	});

	if (!data || data.unlimited) {
		return null;
	}

	const balance = Number(data.balance ?? 0);
	const planLimit = Number(data.includedUsage ?? 0);
	const overageAllowed = Boolean(data.overageAllowed);

	if (balance < 0 && overageAllowed) {
		return null;
	}

	const isOverage = balance < 0;
	const overage = Math.abs(balance);
	const remaining = balance;
	const used = planLimit > 0 ? planLimit - balance : 0;
	const percentage = planLimit > 0 ? (used / planLimit) * 100 : 0;

	if (!isOverage && percentage < 80) {
		return null;
	}

	const isDestructive = isOverage || percentage >= 95;

	return (
		<div
			className={cn(
				"flex items-center justify-between rounded-md border px-3 py-2",
				isDestructive
					? "border-destructive/30 bg-destructive/5"
					: "border-warning/30 bg-warning/5"
			)}
		>
			<div className="flex items-center gap-2">
				<WarningIcon
					className={cn(
						"size-4 shrink-0",
						isDestructive ? "text-destructive" : "text-warning"
					)}
				/>
				{isOverage ? (
					<p className="font-medium text-destructive text-xs">
						{formatLocaleNumber(overage)} events over limit
					</p>
				) : (
					<p className="text-muted-foreground text-xs">
						{formatLocaleNumber(remaining)} events remaining
						<span
							className={cn(
								"ml-1.5 font-medium",
								isDestructive ? "text-destructive" : "text-warning"
							)}
						>
							({percentage.toFixed(0)}% used)
						</span>
					</p>
				)}
			</div>
			{data.canUserUpgrade ? (
				<Link
					className={buttonVariants({
						variant: "secondary",
						size: "sm",
						className: "h-6 px-2 text-xs",
					})}
					href="/billing/plans"
				>
					Upgrade
				</Link>
			) : (
				<span className="text-muted-foreground text-xs">Contact owner</span>
			)}
		</div>
	);
}
