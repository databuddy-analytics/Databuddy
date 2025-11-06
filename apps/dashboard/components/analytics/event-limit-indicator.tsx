"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export function EventLimitIndicator() {
	const router = useRouter();
	const { data } = trpc.organizations.getUsage.useQuery();

	// Only show if there's usage and it's concerning
	if (!data || data.unlimited || !data.used) {
		return null;
	}

	const actualLimit =
		data.limit && data.limit > 0 ? data.limit : data.includedUsage;
	const percentage = actualLimit > 0 ? (data.used / actualLimit) * 100 : 100;
	const showWarning = percentage >= 80;

	if (!showWarning) {
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
					<div className="text-sm">
						{data.used}
						{data.limit && data.limit > 0
							? `/${data.limit}`
							: data.includedUsage > 0
								? `/${data.includedUsage}`
								: ""}{" "}
						events
						<span
							className={`ml-2 font-medium ${isDestructive ? "text-red-600" : "text-amber-600"}`}
						>
							({percentage.toFixed(1)}%)
						</span>
					</div>
					{((data.remaining !== null && data.remaining > 0) ||
						data.balance > 0) && (
						<div className="mt-1 text-xs">
							{data.remaining !== null && data.remaining > 0 && (
								<span className="text-green-600">
									{data.remaining} remaining
								</span>
							)}
							{data.balance > 0 && (
								<span className="ml-2 text-muted-foreground">
									{data.balance} balance
								</span>
							)}
						</div>
					)}
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
