"use client";

import { LockIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { getFeatureDescription, getFeatureLabel } from "@/lib/feature-gates";

interface FeatureAccessGateProps {
	children: ReactNode;
	flagKey: string;
	loadingFallback?: ReactNode;
}

export function FeatureLockedPanel({ flagKey }: { flagKey: string }) {
	const label = getFeatureLabel(flagKey);
	const description = getFeatureDescription(flagKey);

	return (
		<div className="flex flex-1 items-center justify-center p-4 sm:p-8">
			<div className="w-full max-w-sm space-y-6 text-center">
				<div className="flex justify-center">
					<div className="rounded border bg-secondary p-4">
						<LockIcon
							className="size-8 text-accent-foreground"
							weight="duotone"
						/>
					</div>
				</div>

				<div className="space-y-3 text-balance">
					<h2 className="font-medium text-foreground text-xl">{label}</h2>
					<p className="text-muted-foreground text-sm">{description}</p>
					<Badge variant="secondary">Coming soon</Badge>
				</div>

				<p className="text-muted-foreground text-xs">
					You need an invite to access this feature.
				</p>
			</div>
		</div>
	);
}

export function FeatureAccessGate({
	flagKey,
	children,
	loadingFallback = null,
}: FeatureAccessGateProps) {
	const { hasAccess, isLoading } = useFeatureAccess(flagKey);

	if (isLoading) {
		return <>{loadingFallback}</>;
	}

	if (!hasAccess) {
		return <FeatureLockedPanel flagKey={flagKey} />;
	}

	return <>{children}</>;
}
