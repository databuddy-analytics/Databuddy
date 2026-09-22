"use client";

import { FLAG_STATS_WINDOW_DAYS } from "@databuddy/shared/flags";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { usePlanLimitMessage } from "@/components/feature-gate";
import { PageNavigation } from "@/components/layout/page-navigation";
import { orpc } from "@/lib/orpc";
import { isAnalyticsRefreshingAtom } from "@/stores/jotai/filterAtoms";
import {
	isFlagSheetOpenAtom,
	isGroupSheetOpenAtom,
} from "@/stores/jotai/flagsAtoms";
import { TopBar } from "@/components/layout/top-bar";
import { cn } from "@/lib/utils";
import { HARDCODED_TEMPLATES } from "./templates/_data/templates";
import {
	ArchiveIcon,
	ArrowClockwiseIcon,
	FlagIcon,
	LayoutIcon,
	PlusIcon,
	UsersThreeIcon,
} from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

export default function FlagsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { id } = useParams();
	const websiteId = id as string;
	const pathname = usePathname();
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const queryClient = useQueryClient();
	const [, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [, setIsGroupSheetOpen] = useAtom(isGroupSheetOpenAtom);

	const { data: flags, refetch: refetchFlags } = useQuery({
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
	});

	const { data: groups, refetch: refetchGroups } = useQuery({
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

	const planLimitMessage = usePlanLimitMessage(
		GATED_FEATURES.FEATURE_FLAGS,
		activeFlags.length
	);

	const isGroupsPage = pathname?.includes("/groups");
	const isTemplatesPage = pathname?.includes("/templates");
	const isArchivePage = pathname?.includes("/archive");

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			if (isGroupsPage) {
				await refetchGroups();
			} else if (!isTemplatesPage) {
				await Promise.all([
					refetchFlags(),
					queryClient.refetchQueries({
						queryKey: orpc.flags.stats.key({
							input: { websiteId, days: FLAG_STATS_WINDOW_DAYS },
						}),
					}),
				]);
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
		queryClient,
		websiteId,
	]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<TopBar.Title>
				<h1 className="font-medium text-sm">
					{isTemplatesPage
						? "Flag Templates"
						: isGroupsPage
							? "Target Groups"
							: isArchivePage
								? "Archived Flags"
								: "Feature Flags"}
				</h1>
			</TopBar.Title>
			<TopBar.Actions>
				{!isTemplatesPage && (
					<Button
						aria-label="Refresh"
						disabled={isRefreshing}
						onClick={handleRefresh}
						size="sm"
						variant="secondary"
					>
						<ArrowClockwiseIcon
							className={cn("size-4 shrink-0", isRefreshing && "animate-spin")}
						/>
					</Button>
				)}
				{!(isTemplatesPage || isArchivePage) && (
					<Button
						onClick={() => {
							if (isGroupsPage) {
								setIsGroupSheetOpen(true);
								return;
							}
							if (planLimitMessage) {
								toast.info(planLimitMessage);
								return;
							}
							setIsFlagSheetOpen(true);
						}}
						size="sm"
					>
						<PlusIcon className="size-4 shrink-0" />
						{isGroupsPage ? "Create Group" : "Create Flag"}
					</Button>
				)}
			</TopBar.Actions>

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

			<div className="min-h-0 flex-1 overflow-hidden">{children}</div>
		</div>
	);
}
