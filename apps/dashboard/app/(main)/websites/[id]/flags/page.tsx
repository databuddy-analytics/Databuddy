"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { FlagIcon } from "@phosphor-icons/react/dist/ssr/Flag";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureGate } from "@/components/feature-gate";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { orpc } from "@/lib/orpc";
import { isFlagSheetOpenAtom } from "@/stores/jotai/flagsAtoms";
import { FlagSheet } from "./_components/flag-sheet";
import { FlagsList, FlagsListSkeleton } from "./_components/flags-list";
import {
	FolderSidebar,
	type FolderSelection,
} from "./_components/folder-sidebar";
import type { Flag, TargetGroup } from "./_components/types";

export default function FlagsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const queryClient = useQueryClient();
	const [isFlagSheetOpen, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [editingFlag, setEditingFlag] = useState<Flag | null>(null);
	const [flagToDelete, setFlagToDelete] = useState<Flag | null>(null);
	const [selectedFolder, setSelectedFolder] = useState<FolderSelection>("all");

	const { data: flags, isLoading: flagsLoading } = useQuery({
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
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
				map.set(flag.id, flag.targetGroups as TargetGroup[]);
			} else {
				map.set(flag.id, []);
			}
		}
		return map;
	}, [activeFlags]);

	// Determine whether to group by folder or filter
	const hasFolders = useMemo(
		() => activeFlags.some((f) => f.folder),
		[activeFlags]
	);

	const filteredFlags = useMemo(() => {
		if (selectedFolder === "all") return activeFlags;
		if (selectedFolder === "uncategorized")
			return activeFlags.filter((f) => !f.folder);
		return activeFlags.filter((f) => f.folder === selectedFolder);
	}, [activeFlags, selectedFolder]);

	const shouldGroupByFolder = selectedFolder === "all" && hasFolders;

	const deleteFlagMutation = useMutation({
		...orpc.flags.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
		},
	});

	const handleCreateFlag = () => {
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
			setFlagToDelete(flag as Flag);
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
				<div className="flex h-full min-h-0">
					{/* Folder sidebar — shown when there are flags */}
					{!flagsLoading && activeFlags.length > 0 && (
						<FolderSidebar
							flags={activeFlags as Flag[]}
							onSelectFolder={setSelectedFolder}
							selectedFolder={selectedFolder}
							websiteId={websiteId}
						/>
					)}

					{/* Main content */}
					<div className="min-w-0 flex-1 overflow-y-auto">
						<Suspense fallback={<FlagsListSkeleton />}>
							{flagsLoading ? (
								<FlagsListSkeleton />
							) : activeFlags.length === 0 ? (
								<div className="flex flex-1 items-center justify-center py-16">
									<EmptyState
										action={{
											label: "Create Your First Flag",
											onClick: handleCreateFlag,
										}}
										description="Create your first feature flag to start controlling feature rollouts and A/B testing across your application."
										icon={<FlagIcon weight="duotone" />}
										title="No feature flags yet"
										variant="minimal"
									/>
								</div>
							) : filteredFlags.length === 0 ? (
								<div className="flex flex-1 items-center justify-center py-16">
									<EmptyState
										action={{
											label: "Create Flag",
											onClick: handleCreateFlag,
										}}
										description="No flags in this folder yet. Create a flag and assign it to this folder."
										icon={<FlagIcon weight="duotone" />}
										title="No flags here"
										variant="minimal"
									/>
								</div>
							) : (
								<FlagsList
									flags={filteredFlags as Flag[]}
									groupByFolder={shouldGroupByFolder}
									groups={groupsMap}
									onDelete={handleDeleteFlagRequest}
									onEdit={handleEditFlag}
								/>
							)}
						</Suspense>
					</div>
				</div>

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
			</ErrorBoundary>
		</FeatureGate>
	);
}
