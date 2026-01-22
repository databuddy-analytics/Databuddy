"use client";

import type { IconProps } from"@phosphor-icons/react";
import { ArrowClockwiseIcon, PlusIcon } from"@phosphor-icons/react";
import { cloneElement, type ReactNode } from"react";
import { Button } from"@/components/ui/button";
import { Skeleton } from"@/components/ui/skeleton";
import { cn } from"@/lib/utils";

interface LinksPageHeaderProps {
	title: string;
	description?: string;
	icon: React.ReactElement<IconProps>;

	isLoading?: boolean;
	isRefreshing?: boolean;

	onRefreshAction?: () => void;
	onCreateAction?: () => void;
	createActionLabel?: string;

	subtitle?: string | ReactNode;
	currentCount?: number;
}

export function LinksPageHeader({
	title,
	description,
	icon,
	isLoading = false,
	isRefreshing = false,
	onRefreshAction,
	onCreateAction,
	createActionLabel ="Create",
	subtitle,
	currentCount,
}: LinksPageHeaderProps) {
	const renderSubtitle = () => {
		const showSubtitleSkeleton = isLoading && !description;

		if (showSubtitleSkeleton) {
			return (
				<div className="h-5 sm:h-6">
					<Skeleton className="h-4 w-48" />
				</div>
			);
		}

		if (subtitle) {
			return typeof subtitle ==="string" ? (
				<p className="h-5 truncate text-muted-foreground text-sm sm:h-6 sm:text-base">
					{subtitle}
				</p>
			) : (
				<div className="h-5 sm:h-6">{subtitle}</div>
			);
		}

		if (description) {
			return (
				<p className="h-5 truncate text-muted-foreground text-sm sm:h-6 sm:text-base">
					{description}
				</p>
			);
		}

		return null;
	};

	return (
		<div className="flex h-[88px] items-center border-b px-3 sm:px-4">
			<div className="flex w-full flex-col justify-between gap-4 sm:flex-row sm:items-center">
				<div className="space-y-2">
					<div className="flex items-center gap-3">
						<div className=" border border-accent-foreground/10 bg-secondary p-2.5">
							{cloneElement(icon, {
								...icon.props,
								className: cn(
									"size-5 text-accent-foreground",
									icon.props.className
								),
								"aria-hidden":"true",
								size: 24,
								weight:"duotone",
							})}
						</div>
						<div>
							<div className="flex items-center gap-2">
								<h1 className="truncate font-medium text-foreground text-xl sm:text-2xl">
									{title}
								</h1>
								{typeof currentCount ==="number" && !isLoading && (
									<span className=" bg-muted px-2 py-0.5 font-mono text-muted-foreground text-sm">
										{currentCount}
									</span>
								)}
							</div>
							{renderSubtitle()}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-3">
					{onRefreshAction && (
						<Button
							disabled={isRefreshing}
							onClick={onRefreshAction}
							variant="secondary"
						>
							<ArrowClockwiseIcon
								className={isRefreshing ?"animate-spin" :""}
								size={16}
							/>
							Refresh
						</Button>
					)}
					{onCreateAction && (
						<Button onClick={onCreateAction}>
							<PlusIcon size={16} />
							{createActionLabel}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

export function LinksPageHeaderSkeleton() {
	return (
		<div className="flex h-[88px] items-center border-b px-3 sm:px-4">
			<div className="flex w-full flex-col justify-between gap-4 sm:flex-row sm:items-center">
				<div className="space-y-2">
					<div className="flex items-center gap-3">
						<Skeleton className="size-12" />
						<div>
							<Skeleton className="mb-2 h-7 w-32" />
							<Skeleton className="h-5 w-48" />
						</div>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<Skeleton className="h-10 w-24" />
					<Skeleton className="h-10 w-28" />
				</div>
			</div>
		</div>
	);
}
