"use client";

import {
	type GatedFeatureId,
	getPlanFeatureLimit,
	isWithinLimit,
} from "@databuddy/shared/types/features";
import type { IconProps } from "@phosphor-icons/react";
import {
	ArrowClockwiseIcon,
	ArrowLeftIcon,
	BookIcon,
	PlusIcon,
	WarningIcon,
} from "@phosphor-icons/react";
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
import { cn } from "@/lib/utils";

interface WebsitePageHeaderProps {
	title: string;
	description?: string;
	icon: React.ReactElement<IconProps>;

	websiteId: string;
	websiteName?: string;

	isLoading?: boolean;
	isRefreshing?: boolean;

	hasError?: boolean;
	errorMessage?: string;

	onRefreshAction?: () => void;
	onCreateAction?: () => void;
	createActionLabel?: string;

	subtitle?: string | ReactNode;

	showBackButton?: boolean;
	variant?: "default" | "minimal";

	additionalActions?: ReactNode;

	docsUrl?: string;

	// NEW: Feature usage tracking
	feature?: GatedFeatureId;
	currentUsage?: number;
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
	const { currentPlanId } = useBillingContext();

	// Calculate usage badge
	const showUsageBadge =
		feature && typeof currentUsage === "number" && !isLoading;
	const limit = showUsageBadge
		? getPlanFeatureLimit(currentPlanId, feature)
		: null;
	const withinLimit =
		showUsageBadge && onCreateAction
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
									? limit.toLocaleString()
									: "0"}
					</Badge>
				</TooltipTrigger>
				<TooltipContent>
					{limit === "unlimited" ? (
						<p>Unlimited on your current plan</p>
					) : withinLimit && typeof limit === "number" ? (
						<p className="max-w-xs">
							You've created {currentUsage} out of {limit.toLocaleString()}{" "}
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
							{typeof limit === "number" ? limit.toLocaleString() : "available"}{" "}
							slots.
							<br />
							<a className="underline" href="/billing">
								Upgrade your plan
							</a>{" "}
							to create more.
						</p>
					)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	) : null;
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
			return typeof subtitle === "string" ? (
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
						{renderSubtitle()}
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
		<div className="flex h-[88px] items-center border-b px-3 sm:px-4">
			<div className="flex w-full flex-col justify-between gap-4 sm:flex-row sm:items-center">
				<div className="space-y-2">
					<div className="flex items-center gap-3">
						{showBackButton ? (
							<Button asChild className="mr-2" size="sm" variant="ghost">
								<Link href={`/websites/${websiteId}`}>
									<ArrowLeftIcon size={16} />
									Back
								</Link>
							</Button>
						) : null}
						<div className="rounded-lg border border-accent-foreground/10 bg-secondary p-2.5">
							{cloneElement(icon, {
								...icon.props,
								className: cn(
									"size-5 text-accent-foreground",
									icon.props.className
								),
								"aria-hidden": "true",
								size: 24,
								weight: "fill",
							})}
						</div>
						<div>
							<div className="flex items-center gap-2">
								<h1 className="truncate font-medium text-foreground text-xl sm:text-2xl">
									{title}
								</h1>
								{usageBadge}
							</div>
							{renderSubtitle()}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-3">
					{docsUrl ? (
						<Button asChild variant="outline">
							<Link
								className="cursor-pointer select-none gap-2 border-border/50"
								href={docsUrl}
								rel="noopener noreferrer"
								target="_blank"
							>
								<BookIcon size={16} />
								Documentation
							</Link>
						</Button>
					) : null}
					{onRefreshAction ? (
						<Button
							disabled={isRefreshing}
							onClick={onRefreshAction}
							variant="secondary"
						>
							<ArrowClockwiseIcon
								className={isRefreshing ? "animate-spin" : ""}
								size={16}
							/>
							Refresh Data
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
												? limit.toLocaleString()
												: "available"}
											.
											<br />
											<a className="underline" href="/billing">
												Upgrade to create more
											</a>
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
