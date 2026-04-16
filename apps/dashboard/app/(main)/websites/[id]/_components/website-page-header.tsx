"use client";

import {
	type GatedFeatureId,
	getPlanFeatureLimit,
	isWithinLimit,
} from "@databuddy/shared/types/features";
import type { IconProps } from "@phosphor-icons/react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { BookIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react";
import { WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { cloneElement, type ReactNode } from "react";
import { useBillingContext } from "@/components/providers/billing-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHydrated } from "@/hooks/use-hydrated";
import { formatLocaleNumber } from "@/lib/format-locale-number";
import { cn } from "@/lib/utils";

function WebsitePageHeaderSubtitle({
	description,
	isLoading,
	subtitle,
}: {
	description?: string;
	isLoading?: boolean;
	subtitle?: string | ReactNode;
}) {
	const showSubtitleSkeleton = isLoading && !description;
	if (showSubtitleSkeleton) {
		return (
			<div className="h-5 sm:h-6">
				<Skeleton className="h-4 w-48" />
			</div>
		);
	}
	if (subtitle) {
		return typeof subtitle === "string" ? (
			<p className="text-pretty text-muted-foreground text-sm sm:h-6 sm:truncate sm:text-base">
				{subtitle}
			</p>
		) : (
			<div className="min-w-0 sm:h-6">{subtitle}</div>
		);
	}
	if (description) {
		return (
			<p className="text-pretty text-muted-foreground text-sm sm:h-6 sm:truncate sm:text-base">
				{description}
			</p>
		);
	}
	return null;
}

interface WebsitePageHeaderProps {
	additionalActions?: ReactNode;
	createActionLabel?: string;
	currentUsage?: number;
	description?: string;

	docsUrl?: string;
	errorMessage?: string;

	// NEW: Feature usage tracking
	feature?: GatedFeatureId;

	hasError?: boolean;
	icon: React.ReactElement<IconProps>;

	isLoading?: boolean;
	isRefreshing?: boolean;
	onCreateAction?: () => void;

	onRefreshAction?: () => void;

	showBackButton?: boolean;

	subtitle?: string | ReactNode;
	title: string;
	variant?: "default" | "minimal";

	websiteId: string;
	websiteName?: string;
}

export function WebsitePageHeader({
	title,
	description,
	icon,
	websiteId,
	isLoading = false,
	isRefreshing = false,
	hasError = false,
	errorMessage,
	onRefreshAction,
	onCreateAction,
	createActionLabel = "Create",
	subtitle,
	showBackButton = false,
	variant = "default",
	additionalActions,
	docsUrl,
	feature,
	currentUsage,
}: WebsitePageHeaderProps) {
	const { currentPlanId, isLoading: isBillingLoading } = useBillingContext();
	const isHydrated = useHydrated();

	const showUsageBadge =
		Boolean(feature) &&
		typeof currentUsage === "number" &&
		!isLoading &&
		isHydrated &&
		!isBillingLoading;
	const limit =
		showUsageBadge && feature
			? getPlanFeatureLimit(currentPlanId, feature)
			: null;
	const withinLimit =
		showUsageBadge && onCreateAction && feature
			? isWithinLimit(currentPlanId, feature, currentUsage)
			: true;

	const getUsageBadgeColor = () => {
		if (!showUsageBadge || limit === "unlimited" || limit === false) {
			return null;
		}
		if (typeof currentUsage !== "number" || typeof limit !== "number") {
			return null;
		}
		const percentUsed = (currentUsage / limit) * 100;
		if (percentUsed >= 100) {
			return "destructive" as const;
		}
		if (percentUsed >= 80) {
			return "amber" as const;
		}
		return "secondary" as const;
	};

	const usageBadge = showUsageBadge ? (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge
						className="cursor-help font-mono"
						variant={
							getUsageBadgeColor() as
								| "default"
								| "secondary"
								| "destructive"
								| "outline"
								| "green"
								| "amber"
								| "gray"
								| null
								| undefined
						}
					>
						{!withinLimit && (
							<WarningIcon className="mr-1 size-3" weight="fill" />
						)}
						{currentUsage} /{" "}
						{limit === "unlimited"
							? "∞"
							: limit === false
								? "—"
								: typeof limit === "number"
									? formatLocaleNumber(limit)
									: "0"}
					</Badge>
				</TooltipTrigger>
				<TooltipContent>
					{limit === "unlimited" ? (
						<p>Unlimited on your current plan</p>
					) : withinLimit && typeof limit === "number" ? (
						<p className="max-w-xs">
							You've created {currentUsage} out of {formatLocaleNumber(limit)}{" "}
							available on your current plan.
							{currentUsage / limit >= 0.8 && (
								<>
									<br />
									<span className="text-amber-600">
										You're approaching your limit.
									</span>
								</>
							)}
						</p>
					) : (
						<p className="max-w-xs">
							<span className="font-semibold text-red-600">Limit reached!</span>
							<br />
							You've used all{" "}
							{typeof limit === "number"
								? formatLocaleNumber(limit)
								: "available"}{" "}
							slots.
							<br />
							<Link className="underline" href="/billing">
								Upgrade your plan
							</Link>{" "}
							to create more.
						</p>
					)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	) : null;

	if (variant === "minimal") {
		return (
			<div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-3">
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-3">
						{showBackButton ? (
							<Button asChild size="sm" variant="ghost">
								<Link href={`/websites/${websiteId}`}>
									<ArrowLeftIcon size={16} />
									<span className="xs:inline hidden">Back</span>
								</Link>
							</Button>
						) : null}
						<div className="rounded border border-primary/10 bg-primary/5 p-3">
							{icon}
						</div>
					</div>

					<div className="flex-1">
						<h1 className="font-semibold text-xl">{title}</h1>
						{usageBadge}
						<WebsitePageHeaderSubtitle
							description={description}
							isLoading={isLoading}
							subtitle={subtitle}
						/>
					</div>
				</div>

				<div className="flex items-center gap-3">
					{docsUrl ? (
						<Button asChild variant="outline">
							<Link
								className="cursor-pointer gap-2 transition-all duration-300 hover:border-primary/50 hover:bg-primary/5"
								href={docsUrl}
								rel="noopener noreferrer"
								target="_blank"
							>
								<BookIcon size={16} />
								<span className="xs:inline hidden">Docs</span>
							</Link>
						</Button>
					) : null}
					{onRefreshAction ? (
						<Button
							className="cursor-pointer gap-2 transition-all duration-300 hover:border-primary/50 hover:bg-primary/5"
							disabled={isRefreshing}
							onClick={onRefreshAction}
							variant="outline"
						>
							<ArrowClockwiseIcon
								className={isRefreshing ? "animate-spin" : ""}
								size={16}
							/>
							<span className="xs:inline hidden">Refresh</span>
						</Button>
					) : null}
					{additionalActions}
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-[88px] shrink-0 flex-col border-b px-3 py-3 sm:px-4 sm:py-3">
			<div className="flex w-full min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
				<div className="min-w-0 flex-1 space-y-2">
					<div className="flex items-start gap-3 sm:items-center">
						{showBackButton ? (
							<Button
								asChild
								className="mr-2 shrink-0"
								size="sm"
								variant="ghost"
							>
								<Link
									aria-label="Back to website overview"
									href={`/websites/${websiteId}`}
								>
									<ArrowLeftIcon size={16} />
									<span className="hidden sm:inline">Back</span>
								</Link>
							</Button>
						) : null}
						<div className="shrink-0 rounded-lg border border-accent-foreground/10 bg-secondary p-2.5">
							{cloneElement(icon, {
								...icon.props,
								className: cn(
									"size-5 text-accent-foreground",
									icon.props.className
								),
								"aria-hidden": "true",
								size: 24,
								weight: icon.props.weight ?? "duotone",
							})}
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
								<h1 className="min-w-0 max-w-full text-balance font-medium text-foreground text-xl sm:text-2xl">
									{title}
								</h1>
								{usageBadge}
							</div>
							<WebsitePageHeaderSubtitle
								description={description}
								isLoading={isLoading}
								subtitle={subtitle}
							/>
						</div>
					</div>
				</div>
				<div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end sm:gap-3">
					{docsUrl ? (
						<Button asChild variant="outline">
							<Link
								className="cursor-pointer select-none gap-2 border-border/50"
								href={docsUrl}
								rel="noopener noreferrer"
								target="_blank"
							>
								<BookIcon size={16} />
								<span className="sm:hidden">Docs</span>
								<span className="hidden sm:inline">Documentation</span>
							</Link>
						</Button>
					) : null}
					{onRefreshAction ? (
						<Button
							disabled={isRefreshing}
							onClick={onRefreshAction}
							variant="outline"
						>
							<ArrowClockwiseIcon
								className={isRefreshing ? "animate-spin" : ""}
								size={16}
							/>
							<span className="sm:hidden">Refresh</span>
							<span className="hidden sm:inline">Refresh Data</span>
						</Button>
					) : null}
					{onCreateAction ? (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<div>
										<Button disabled={!withinLimit} onClick={onCreateAction}>
											<PlusIcon size={16} />
											{createActionLabel}
										</Button>
									</div>
								</TooltipTrigger>
								{!withinLimit && (
									<TooltipContent>
										<p>
											You've reached your limit of{" "}
											{typeof limit === "number"
												? formatLocaleNumber(limit)
												: "available"}
											.
											<br />
											<Link className="underline" href="/billing">
												Upgrade to create more
											</Link>
											.
										</p>
									</TooltipContent>
								)}
							</Tooltip>
						</TooltipProvider>
					) : null}
					{additionalActions}
				</div>
			</div>

			{hasError ? (
				<div className="px-3 pt-4 sm:px-4">
					<Card className="rounded border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
						<CardContent className="pt-6">
							<div className="flex flex-col items-center space-y-3 text-center">
								<div className="rounded-full border border-destructive/10 bg-destructive/5 p-3">
									{icon}
								</div>
								<div>
									<h4 className="font-semibold text-destructive">
										Error loading {title.toLowerCase()}
									</h4>
									<p className="mt-1 text-destructive/80 text-sm">
										{errorMessage ||
											`There was an issue loading your ${title.toLowerCase()}. Please try refreshing the page.`}
									</p>
								</div>
								{onRefreshAction ? (
									<Button
										className="cursor-pointer select-none gap-2 rounded transition-all duration-300 hover:border-primary/20 hover:bg-primary/10"
										onClick={onRefreshAction}
										size="sm"
										variant="outline"
									>
										<ArrowClockwiseIcon className="size-4" size={16} />
										Retry
									</Button>
								) : null}
							</div>
						</CardContent>
					</Card>
				</div>
			) : null}
		</div>
	);
}

export function WebsitePageHeaderSkeleton() {
	return (
		<div className="space-y-4">
			<div className="border-b pb-4">
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
					<div className="space-y-2">
						<div className="flex items-center gap-3">
							<div className="size-12 animate-pulse rounded bg-muted" />
							<div>
								<div className="mb-2 h-8 w-48 animate-pulse rounded bg-muted" />
								<div className="h-4 w-64 animate-pulse rounded bg-muted" />
							</div>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<div className="h-10 w-32 animate-pulse rounded bg-muted" />
						<div className="h-10 w-36 animate-pulse rounded bg-muted" />
					</div>
				</div>
			</div>
		</div>
	);
}
