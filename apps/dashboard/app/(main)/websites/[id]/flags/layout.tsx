"use client";

import { useFlag } from "@databuddy/sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
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
	InfoIcon,
	LayoutIcon,
	PlusIcon,
	UsersThreeIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Skeleton, Tooltip, useHydrated } from "@databuddy/ui";

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

	const isGroupsPage = pathname?.includes("/groups");
	const isTemplatesPage = pathname?.includes("/templates");
	const isArchivePage = pathname?.includes("/archive");
	const { on: isExperimentOn, loading: experimentLoading } =
		useFlag("experiment-50");
	const isHydrated = useHydrated();

	const showExperimentBanner =
		isHydrated && !experimentLoading && flags !== undefined;

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
							input: { websiteId, days: 30 },
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
							} else {
								setIsFlagSheetOpen(true);
							}
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

			{/* Experiment Flag Banner — defer until hydrated so SDK/flags match SSR */}
			<div className="flex h-10 items-center border-border border-b bg-accent px-4">
				{showExperimentBanner ? (
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
								<Badge
									className="bg-blue-500/15 text-blue-600 dark:text-blue-400"
									variant="default"
								>
									Blue Team
								</Badge>
							)}
						</div>
						<Tooltip
							content={
								<div className="space-y-2">
									<p className="font-medium">A/B Test Experiment</p>
									<p className="text-xs leading-relaxed">
										Live demo: ~50% of users see Red Team, ~50% see Blue Team.
									</p>
								</div>
							}
							delay={500}
						>
							<button
								className="flex items-center gap-1.5 text-foreground text-sm hover:text-foreground/80"
								type="button"
							>
								<InfoIcon className="size-4" weight="duotone" />
								<span className="hidden sm:inline">A/B Test Experiment</span>
							</button>
						</Tooltip>
					</div>
				) : (
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<Skeleton className="size-4 rounded" />
							<Skeleton className="h-5 w-20 rounded" />
						</div>
						<Skeleton className="h-4 w-32 rounded sm:w-40" />
					</div>
				)}
			</div>

			<div className="min-h-0 flex-1 overflow-hidden">{children}</div>
		</div>
	);
}
