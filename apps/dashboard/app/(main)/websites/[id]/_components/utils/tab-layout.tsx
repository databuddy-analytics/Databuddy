import type React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BORDER_RADIUS } from "./ui-components";

interface TabLayoutProps {
	title?: string;
	description?: string;
	isLoading?: boolean;
	children: React.ReactNode;
	className?: string;
	actions?: React.ReactNode;
}

export function TabLayout({
	title,
	description,
	isLoading = false,
	children,
	className = "",
	actions,
}: TabLayoutProps) {
	if (isLoading) {
		return <TabLoadingSkeleton />;
	}

	return (
		<div className={`space-y-3 pt-2 ${className}`}>
			{(title || description || actions) && (
				<div className="mb-2 flex items-center justify-between">
					{(title || description) && (
						<div>
							{title && <h2 className="font-semibold text-lg">{title}</h2>}
							{description && (
								<p className="text-muted-foreground text-sm">{description}</p>
							)}
						</div>
					)}
					{actions && <div>{actions}</div>}
				</div>
			)}
			{children}
		</div>
	);
}

export function TabLoadingSkeleton() {
	const loadingSkeletonIds = [
		"loading-skeleton-1",
		"loading-skeleton-2",
		"loading-skeleton-3",
		"loading-skeleton-4",
	];
	return (
		<div className="space-y-4 pt-2">
			<div className="grid grid-cols-4 gap-2">
				{loadingSkeletonIds.map((id) => (
					<Skeleton className={`h-24 w-full ${BORDER_RADIUS.card}`} key={id} />
				))}
			</div>
			<Skeleton className={`h-64 w-full ${BORDER_RADIUS.container}`} />
			<div className="grid grid-cols-2 gap-3">
				<Skeleton className={`h-40 w-full ${BORDER_RADIUS.container}`} />
				<Skeleton className={`h-40 w-full ${BORDER_RADIUS.container}`} />
			</div>
		</div>
	);
}
