"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc";

export function EventLimitIndicator() {
	const router = useRouter();
	const { data } = useQuery({
		...orpc.organizations.getUsage.queryOptions(),
	});

	if (!data || data.unlimited) {
		return null;
	}

	const balance = data.balance ?? 0;
	const planLimit = data.includedUsage ?? 0;

	// Balance > Plan limit = Bonus credits, show remaining
	// Balance < Plan limit = Normal usage, balance is remaining
	// Balance < 0 = Overage

	if (balance < 0) {
		// Overage state
		const overage = Math.abs(balance);
		return (
			<div className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm dark:border-red-800 dark:bg-red-950/20">
				<div className="flex items-center gap-2">
					<WarningIcon
						className="h-4 w-4 text-red-600 dark:text-red-400"
						weight="fill"
					/>
					<div>
						<span className="font-medium text-red-600 dark:text-red-400">
							{overage.toLocaleString()} events over limit
						</span>
					</div>
				</div>
				{data.canUserUpgrade ? (
					<Button
						className="h-6 px-2 text-xs"
						onClick={() => router.push("/billing?tab=plans")}
						size="sm"
						variant="ghost"
					>
						Upgrade
					</Button>
				) : (
					<span className="text-muted-foreground text-xs">Contact owner</span>
				)}
			</div>
		);
	}

	// Calculate percentage of limit used
	const remaining = balance;
	const used = planLimit > 0 ? planLimit - balance : 0;
	const percentage = planLimit > 0 ? (used / planLimit) * 100 : 0;

	// Only show warning at 80%+ usage
	if (percentage < 80) {
		return null;
	}

	const isDestructive = percentage >= 95;

	return (
		<div className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/20">
			<div className="flex items-center gap-2">
				<WarningIcon
					className={`h-4 w-4 ${isDestructive ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}
					weight="fill"
				/>
				<div className="text-muted-foreground">
					<span>
						{remaining.toLocaleString()} events remaining
						<span
							className={`ml-2 font-medium ${isDestructive ? "text-red-600" : "text-amber-600"}`}
						>
							({percentage.toFixed(0)}% used)
						</span>
					</span>
				</div>
			</div>
			{data.canUserUpgrade ? (
				<Button
					className="h-6 px-2 text-xs"
					onClick={() => router.push("/billing?tab=plans")}
					size="sm"
					variant="ghost"
				>
					Upgrade
				</Button>
			) : (
				<span className="text-muted-foreground text-xs">Contact owner</span>
			)}
		</div>
	);
}
