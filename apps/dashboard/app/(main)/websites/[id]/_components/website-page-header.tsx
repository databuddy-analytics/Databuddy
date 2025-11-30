"use client";

import type { IconProps } from "@phosphor-icons/react";
import {
	ArrowClockwiseIcon,
	ArrowLeftIcon,
	BookIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { cloneElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type WebsitePageHeaderProps = {
	title: string;
	description?: string;
	icon: React.ReactElement<IconProps>;

	websiteId: string;
	websiteName?: string;

	isLoading?: boolean;
	isRefreshing?: boolean;

	hasError?: boolean;
	errorMessage?: string;

	onRefresh?: () => void;
	onCreateAction?: () => void;
	createActionLabel?: string;

	subtitle?: string | ReactNode;

	showBackButton?: boolean;
	variant?: "default" | "minimal";

	additionalActions?: ReactNode;

	docsUrl?: string;
};

export function WebsitePageHeader({
	title,
	description,
	icon,
	websiteId,
	isLoading = false,
	isRefreshing = false,
	hasError = false,
	errorMessage,
	onRefresh,
	onCreateAction,
	createActionLabel = "Create",
	subtitle,
	showBackButton = false,
	variant = "default",
	additionalActions,
	docsUrl,
}: WebsitePageHeaderProps) {
	const renderSubtitle = () => {
		if (isLoading) {
			return <Skeleton className="h-4 w-48" />;
		}

		if (subtitle) {
			return typeof subtitle === "string" ? (
				<p className="text-muted-foreground text-sm sm:text-base">{subtitle}</p>
			) : (
				subtitle
			);
		}

		if (description) {
			return (
				<p className="text-muted-foreground text-sm sm:text-base">
					{description}
				</p>
			);
		}

		return null;
	};

	if (variant === "minimal") {
		return (
			<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-3">
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-3">
						{showBackButton && (
							<Button asChild size="sm" variant="ghost">
								<Link href={`/websites/${websiteId}`}>
									<ArrowLeftIcon size={16} />
									<span className="xs:inline hidden">Back</span>
								</Link>
							</Button>
						)}
						<div className="rounded-xl border border-primary/10 bg-primary/5 p-3">
							{icon}
						</div>
					</div>

					<div className="flex-1">
						<h1 className="font-semibold text-xl">{title}</h1>
						{renderSubtitle()}
					</div>
				</div>

				<div className="flex items-center gap-3">
					{docsUrl && (
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
					)}
					{onRefresh && (
						<Button
							className="cursor-pointer gap-2 transition-all duration-300 hover:border-primary/50 hover:bg-primary/5"
							disabled={isRefreshing}
							onClick={onRefresh}
							variant="outline"
						>
							<ArrowClockwiseIcon
								className={isRefreshing ? "animate-spin" : ""}
								size={16}
							/>
							<span className="xs:inline hidden">Refresh</span>
						</Button>
					)}
					{additionalActions}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="border-b p-3 sm:p-4">
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
					<div className="space-y-2">
						<div className="flex items-center gap-3">
							{showBackButton && (
								<Button asChild className="mr-2" size="sm" variant="ghost">
									<Link href={`/websites/${websiteId}`}>
										<ArrowLeftIcon size={16} />
										Back
									</Link>
								</Button>
							)}
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
								<h1 className="truncate font-medium text-foreground text-xl tracking-tight sm:text-2xl">
									{title}
								</h1>
								{renderSubtitle()}
							</div>
						</div>
					</div>
					<div className="flex items-center gap-3">
						{docsUrl && (
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
						)}
						{onRefresh && (
							<Button
								disabled={isRefreshing}
								onClick={onRefresh}
								variant="secondary"
							>
								<ArrowClockwiseIcon
									className={isRefreshing ? "animate-spin" : ""}
									size={16}
								/>
								Refresh Data
							</Button>
						)}
						{onCreateAction && (
							<Button onClick={onCreateAction}>
								<PlusIcon size={16} />
								{createActionLabel}
							</Button>
						)}
						{additionalActions}
					</div>
				</div>
			</div>

			{hasError && (
				<Card className="rounded-xl border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
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
							{onRefresh && (
								<Button
									className="cursor-pointer select-none gap-2 rounded transition-all duration-300 hover:border-primary/20 hover:bg-primary/10"
									onClick={onRefresh}
									size="sm"
									variant="outline"
								>
									<ArrowClockwiseIcon className="h-4 w-4" size={16} />
									Retry
								</Button>
							)}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

export function WebsitePageHeaderSkeleton() {
	return (
		<div className="space-y-6">
			<div className="border-b pb-6">
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
					<div className="space-y-2">
						<div className="flex items-center gap-3">
							<div className="h-12 w-12 animate-pulse rounded-xl bg-muted" />
							<div>
								<div className="mb-2 h-8 w-48 animate-pulse rounded bg-muted" />
								<div className="h-4 w-64 animate-pulse rounded bg-muted" />
							</div>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
						<div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
					</div>
				</div>
			</div>
		</div>
	);
}
