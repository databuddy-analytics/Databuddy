"use client";

import { useFeature } from "@databuddy/sdk/react";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import {
	ArchiveIcon,
	FlagIcon,
	InfoIcon,
	LayoutIcon,
	UsersThreeIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { PageNavigation } from "@/components/layout/page-navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { isAnalyticsRefreshingAtom } from "@/stores/jotai/filterAtoms";
import {
	isFlagSheetOpenAtom,
	isGroupSheetOpenAtom,
} from "@/stores/jotai/flagsAtoms";
import { WebsitePageHeader } from "../_components/website-page-header";
import { HARDCODED_TEMPLATES } from "./templates/_data/templates";

export default function FlagsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { id } = useParams();
	const websiteId = id as string;
	const pathname = usePathname();
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [, setIsGroupSheetOpen] = useAtom(isGroupSheetOpenAtom);

	const { data: website } = useWebsite(websiteId);

	const {
		data: flags,
		isLoading: flagsLoading,
		refetch: refetchFlags,
	} = useQuery({
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
	});

	const {
		data: groups,
		isLoading: groupsLoading,
		refetch: refetchGroups,
	} = useQuery({
		...orpc.targetGroups.list.queryOptions({ input: { websiteId } }),
	});

	const templates = HARDCODED_TEMPLATES;

	const activeFlags = useMemo(
		() => flags?.filter((f) => f.status !== "archived") ?? [],
		[flags]
	);
	const archivedFlags = useMemo(
		() => flags?.filter((f) => f.status === "archived") ?? [],
		[flags]
	);

	const isGroupsPage = pathname?.includes("/groups");
	const isTemplatesPage = pathname?.includes("/templates");
	const isArchivePage = pathname?.includes("/archive");
	const isLoading = isTemplatesPage
		? false
		: isGroupsPage
			? groupsLoading
			: flagsLoading;

	const { on: isExperimentOn, loading: experimentLoading } =
		useFeature("experiment-50");

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			if (isGroupsPage) {
				await refetchGroups();
			} else if (!isTemplatesPage) {
				await refetchFlags();
			}
		} catch {
			// Error handled by refetch
		}
		setIsRefreshing(false);
	}, [
		isTemplatesPage,
		isGroupsPage,
		refetchFlags,
		refetchGroups,
		setIsRefreshing,
	]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<WebsitePageHeader
				createActionLabel={
					isTemplatesPage || isArchivePage
						? undefined
						: isGroupsPage
							? "Create Group"
							: "Create Flag"
				}
				currentUsage={
					isTemplatesPage
						? templates?.length
						: isGroupsPage
							? groups?.length
							: isArchivePage
								? archivedFlags.length
								: activeFlags.length
				}
				description={
					isTemplatesPage
						? "Pre-configured flag templates for common use cases"
						: isGroupsPage
							? "Reusable targeting rules for your flags"
							: isArchivePage
								? "Flags that have been archived"
								: "Control feature rollouts and A/B testing"
				}
				docsUrl="https://www.databuddy.cc/docs/sdk/feature-flags"
				feature={
					isGroupsPage || isTemplatesPage || isArchivePage
						? undefined
						: GATED_FEATURES.FEATURE_FLAGS
				}
				icon={
					isTemplatesPage ? (
						<LayoutIcon className="size-6 text-accent-foreground" />
					) : isGroupsPage ? (
						<UsersThreeIcon className="size-6 text-accent-foreground" />
					) : isArchivePage ? (
						<ArchiveIcon className="size-6 text-accent-foreground" />
					) : (
						<FlagIcon className="size-6 text-accent-foreground" />
					)
				}
				isLoading={isLoading}
				isRefreshing={isRefreshing}
				onCreateAction={
					isTemplatesPage || isArchivePage
						? undefined
						: () => {
								if (isGroupsPage) {
									setIsGroupSheetOpen(true);
								} else {
									setIsFlagSheetOpen(true);
								}
							}
				}
				onRefreshAction={isTemplatesPage ? undefined : handleRefresh}
				subtitle={
					isLoading
						? undefined
						: isTemplatesPage
							? `${templates?.length ?? 0} template${(templates?.length ?? 0) === 1 ? "" : "s"}`
							: isGroupsPage
								? `${groups?.length ?? 0} group${(groups?.length ?? 0) === 1 ? "" : "s"}`
								: isArchivePage
									? `${archivedFlags.length} archived`
									: `${activeFlags.length} flag${activeFlags.length === 1 ? "" : "s"}`
				}
				title={
					isTemplatesPage
						? "Flag Templates"
						: isGroupsPage
							? "Target Groups"
							: isArchivePage
								? "Archived Flags"
								: "Feature Flags"
				}
				websiteId={websiteId}
				websiteName={website?.name ?? undefined}
			/>

			{/* Navigation Tabs */}
			<PageNavigation
				tabs={[
					{
						id: "flags",
						label: "Flags",
						href: `/websites/${websiteId}/flags`,
						icon: FlagIcon,
						count: activeFlags.length,
					},
					{
						id: "groups",
						label: "Groups",
						href: `/websites/${websiteId}/flags/groups`,
						icon: UsersThreeIcon,
						count: groups?.length,
					},
					{
						id: "templates",
						label: "Templates",
						href: `/websites/${websiteId}/flags/templates`,
						icon: LayoutIcon,
						count: templates?.length,
					},
					{
						id: "archive",
						label: "Archive",
						href: `/websites/${websiteId}/flags/archive`,
						icon: ArchiveIcon,
						count: archivedFlags.length,
					},
				]}
				variant="tabs"
			/>

			{/* Experiment Flag Banner */}
			<div className="flex h-10 items-center border-border border-b bg-accent px-4">
				{experimentLoading || !flags ? (
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<Skeleton className="size-4 rounded" />
							<Skeleton className="h-5 w-20 rounded" />
						</div>
						<Skeleton className="h-4 w-32 rounded sm:w-40" />
					</div>
				) : (
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							{isExperimentOn ? (
								<FlagIcon className="size-4 text-destructive" weight="fill" />
							) : (
								<FlagIcon className="size-4 text-blue-600" weight="fill" />
							)}
							{isExperimentOn ? (
								<Badge variant="destructive">Red Team</Badge>
							) : (
								<Badge variant="blue">Blue Team</Badge>
							)}
						</div>
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<button
									className="flex items-center gap-1.5 text-foreground text-sm hover:text-foreground/80"
									type="button"
								>
									<InfoIcon className="size-4" weight="duotone" />
									<span className="hidden sm:inline">A/B Test Experiment</span>
								</button>
							</TooltipTrigger>
							<TooltipContent className="max-w-xs">
								<div className="space-y-2">
									<p className="font-medium">A/B Test Experiment</p>
									<p className="text-xs leading-relaxed">
										This is a proof-of-concept feature flag demonstrating A/B
										testing capabilities. Approximately 50% of users are
										randomly assigned to the "Red Team" experience, while the
										other 50% see the "Blue Team" experience.
									</p>
								</div>
							</TooltipContent>
						</Tooltip>
					</div>
				)}
			</div>

			{/* Page Content */}
			<div className="min-h-0 flex-1 overflow-hidden">{children}</div>
		</div>
	);
}
