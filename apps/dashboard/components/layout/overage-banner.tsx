"use client";

import { Button, Text } from "@databuddy/ui";
import { TriangleWarningIcon, XMarkIcon } from "@databuddy/ui/icons";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useBillingContext } from "@/components/providers/billing-provider";
import {
	calculateFeatureUsage,
	formatCompactNumber,
} from "@/app/(main)/billing/utils/feature-usage";

const EVENTS_FEATURE_ID = "events";
const DISMISS_KEY_PREFIX = "databuddy:overage-banner:";

function formatCost(amount: number): string {
	return amount >= 1 ? `$${amount.toFixed(2)}` : `$${amount.toFixed(4)}`;
}

export function OverageBanner() {
	const { customer } = useBillingContext();
	const [dismissedKey, setDismissedKey] = useState<string | null>(null);

	const overage = useMemo(() => {
		const balance = customer?.balances?.[EVENTS_FEATURE_ID];
		if (!balance) {
			return null;
		}
		const feature = calculateFeatureUsage(balance);
		if (!(feature.overage && feature.hasPricedOverage)) {
			return null;
		}
		return {
			amount: feature.overage.amount,
			cost: feature.overage.cost,
			key: `${DISMISS_KEY_PREFIX}${feature.resetAt ?? "current"}`,
		};
	}, [customer?.balances]);

	useEffect(() => {
		if (!overage) {
			return;
		}
		setDismissedKey(window.localStorage.getItem(overage.key));
	}, [overage]);

	if (!overage || dismissedKey === overage.key) {
		return null;
	}

	return (
		<output
			className="flex h-12 shrink-0 items-center gap-3 border-warning/25 border-b bg-warning/5 px-4"
			aria-live="polite"
		>
			<TriangleWarningIcon className="size-4 shrink-0 text-warning" />
			<Text className="min-w-0 flex-1 truncate" variant="caption">
				<span className="font-medium text-foreground">
					Still tracking, now billing overage.
				</span>{" "}
				<span className="text-muted-foreground">
					Nothing is dropped. {formatCompactNumber(overage.amount)} events past
					your plan, about {formatCost(overage.cost)} so far this period.
				</span>
			</Text>
			<Link
				className="shrink-0 font-medium text-primary text-xs hover:underline"
				href="/billing"
			>
				See breakdown
			</Link>
			<Button
				aria-label="Dismiss overage notice"
				className="shrink-0"
				onClick={() => {
					window.localStorage.setItem(overage.key, overage.key);
					setDismissedKey(overage.key);
				}}
				size="sm"
				variant="ghost"
			>
				<XMarkIcon size={14} />
			</Button>
		</output>
	);
}
