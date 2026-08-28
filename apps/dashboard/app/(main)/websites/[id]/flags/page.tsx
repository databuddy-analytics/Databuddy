"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { FLAG_STATS_WINDOW_DAYS } from "@databuddy/shared/flags";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureGate, usePlanLimitMessage } from "@/components/feature-gate";
import { orpc } from "@/lib/orpc";
import { isFlagSheetOpenAtom } from "@/stores/jotai/flagsAtoms";
import { FlagSheet } from "./_components/flag-sheet";
import { FlagsList, FlagsListSkeleton } from "./_components/flags-list";
import type { Flag, FlagStats, TargetGroup } from "./_components/types";
import { FlagIcon } from "@databuddy/ui/icons";
import { EmptyState } from "@databuddy/ui";
import { DeleteDialog } from "@databuddy/ui/client";

export default function FlagsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const queryClient = useQueryClient();
	const [isFlagSheetOpen, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [editingFlag, setEditingFlag] = useState<Flag | null>(null);
	const [flagToDelete, setFlagToDelete] = useState<Flag | null>(null);

	const { data: flags, isLoading: flagsLoading } = useQuery({
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
	});
	const {
		data: flagStats,
		isError: flagStatsError,
		isLoading: flagStatsLoading,
		refetch: refetchFlagStats,
	} = useQuery({
		...orpc.flags.stats.queryOptions({
			input: { websiteId, days: FLAG_STATS_WINDOW_DAYS },
		}),
	});

	const activeFlags = useMemo(
		() => flags?.filter((f) => f.status !== "archived") ?? [],
		[flags]
	);

	const groupsMap = useMemo(() => {
		const map = new Map<string, TargetGroup[]>();
		for (const flag of activeFlags) {
			if (
				Array.isArray(flag.targetGroups) &&
				flag.targetGroups.length > 0 &&
				typeof flag.targetGroups[0] === "object"
			) {
				map.set(
					flag.id as string,
					flag.targetGroups as unknown as TargetGroup[]
				);
			} else {
				map.set(flag.id as string, []);
			}
		}
		return map;
	}, [activeFlags]);

	const statsMap = useMemo(() => {
		const map = new Map<string, FlagStats>();
		for (const stat of flagStats ?? []) {
			map.set(stat.key, stat);
		}
		return map;
	}, [flagStats]);

	const deleteFlagMutation = useMutation({
		...orpc.flags.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
		},
	});

	const planLimitMessage = usePlanLimitMessage(
		GATED_FEATURES.FEATURE_FLAGS,
		activeFlags.length
	);

	const handleCreateFlag = () => {
		if (planLimitMessage) {
			toast.info(planLimitMessage);
			return;
		}
		setEditingFlag(null);
		setIsFlagSheetOpen(true);
	};

	const handleEditFlag = (flag: Flag) => {
		setEditingFlag(flag);
		setIsFlagSheetOpen(true);
	};

	const handleDeleteFlagRequest = (flagId: string) => {
		const flag = flags?.find((f) => f.id === flagId);
		if (flag) {
			setFlagToDelete(flag as unknown as Flag);
		}
	};

	const handleConfirmDelete = async () => {
		if (flagToDelete) {
			await deleteFlagMutation.mutateAsync({ id: flagToDelete.id });
			setFlagToDelete(null);
		}
	};

	const handleFlagSheetClose = () => {
		setIsFlagSheetOpen(false);
		setEditingFlag(null);
	};

	return (
		<FeatureGate feature={GATED_FEATURES.FEATURE_FLAGS}>
			<ErrorBoundary>
				<div className="flex h-full flex-col overflow-y-auto">
					<Suspense fallback={<FlagsListSkeleton />}>
						{flagsLoading ? (
							<FlagsListSkeleton />
						) : activeFlags.length === 0 ? (
							<div className="flex flex-1 items-center justify-center py-16">
								<EmptyState
									action={{
										label: "Create a flag",
										onClick: handleCreateFlag,
									}}
									description="Flags let you roll out features gradually or run A/B tests."
									icon={<FlagIcon weight="duotone" />}
									title="No feature flags yet"
									variant="minimal"
								/>
							</div>
						) : (
							<FlagsList
								flags={activeFlags as unknown as Flag[]}
								groups={groupsMap}
								websiteId={websiteId}
								stats={statsMap}
								statsError={flagStatsError}
								statsLoading={flagStatsLoading}
								onRetryStats={refetchFlagStats}
								onDelete={handleDeleteFlagRequest}
								onEdit={handleEditFlag}
							/>
						)}
					</Suspense>

					{isFlagSheetOpen && (
						<Suspense fallback={null}>
							<FlagSheet
								flag={editingFlag}
								isOpen={isFlagSheetOpen}
								onCloseAction={handleFlagSheetClose}
								websiteId={websiteId}
							/>
						</Suspense>
					)}

					<DeleteDialog
						isDeleting={deleteFlagMutation.isPending}
						isOpen={flagToDelete !== null}
						itemName={flagToDelete?.name || flagToDelete?.key}
						onClose={() => setFlagToDelete(null)}
						onConfirm={handleConfirmDelete}
						title="Delete Feature Flag"
					/>
				</div>
			</ErrorBoundary>
		</FeatureGate>
	);
}
