'use client';

import { WarningIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useBillingData } from '@/app/(main)/billing/data/billing-data';
import { Button } from '@/components/ui/button';

export function EventLimitIndicator() {
	const { usage } = useBillingData();
	const router = useRouter();

	const eventsUsage = usage?.features?.find((f) => f.id === 'events');

	if (!eventsUsage || eventsUsage.unlimited) {
		return null;
	}

	const usagePercentage = (eventsUsage.used / eventsUsage.limit) * 100;
	const isNearLimit = usagePercentage >= 80;
	const isAtLimit = usagePercentage >= 100;

	if (!(isNearLimit || isAtLimit)) {
		return null;
	}

	const isDestructive = isAtLimit || usagePercentage >= 95;

	return (
		<div className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/20">
			<div className="flex items-center gap-2">
				<WarningIcon
					className={`h-4 w-4 ${isDestructive ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
					weight="fill"
				/>
				<span className="text-muted-foreground">
					{eventsUsage.used.toLocaleString()}/
					{eventsUsage.limit.toLocaleString()} events
				</span>
				<span
					className={`font-medium ${isDestructive ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
				>
					({usagePercentage.toFixed(1)}%)
				</span>
			</div>
			<Button
				className="h-6 cursor-pointer px-2 text-xs"
				onClick={() => router.push('/billing?tab=plans')}
				size="sm"
				variant="ghost"
			>
				Upgrade
			</Button>
		</div>
	);
}
