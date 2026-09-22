"use client";

import { FEATURE_IDS } from "@databuddy/shared/types/features";
import { Button, Text } from "@databuddy/ui";
import { TriangleWarningIcon, XMarkIcon } from "@databuddy/ui/icons";
import Link from "next/link";
import { useState } from "react";
import {
	calculateFeatureUsage,
	formatCompactNumber,
	formatCurrency,
} from "@/app/(main)/billing/utils/feature-usage";
import { useBillingContext } from "@/components/providers/billing-provider";

const DISMISS_KEY_PREFIX = "databuddy:overage-banner:";

export function OverageBanner() {
	const { customer } = useBillingContext();
	const [dismissed, setDismissed] = useState(false);

	const balance = customer?.balances?.[FEATURE_IDS.EVENTS];
	const feature = balance ? calculateFeatureUsage(balance) : null;

	if (!(feature?.overage && feature.hasPricedOverage) || dismissed) {
		return null;
	}

	const periodKey = feature.resetAt;
	const storageKey = periodKey
		? `${DISMISS_KEY_PREFIX}${customer?.id}:${periodKey}`
		: null;
	if (storageKey && window.localStorage.getItem(storageKey)) {
		return null;
	}

	return (
		<output className="flex h-12 shrink-0 items-center gap-3 border-warning/25 border-b bg-warning/5 px-4">
			<TriangleWarningIcon className="size-4 shrink-0 text-warning" />
			<Text className="min-w-0 flex-1 truncate" variant="caption">
				<span className="font-medium text-foreground">
					Still tracking, now billing overage.
				</span>{" "}
				<span className="text-muted-foreground">
					Nothing is dropped. {formatCompactNumber(feature.overage.amount)}{" "}
					events past your plan, about {formatCurrency(feature.overage.cost)} so
					far this period.
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
					if (storageKey) {
						window.localStorage.setItem(storageKey, "1");
					}
					setDismissed(true);
				}}
				size="sm"
				variant="ghost"
			>
				<XMarkIcon size={14} />
			</Button>
		</output>
	);
}
