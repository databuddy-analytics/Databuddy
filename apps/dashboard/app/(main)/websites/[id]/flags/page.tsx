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
import { FolderSidebar } from "./_components/folder-sidebar";
import { buildFolderTree } from "./_components/folder-utils";
import type { Flag, TargetGroup } from "./_components/types";

export default function FlagsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const queryClient = useQueryClient();
	const [isFlagSheetOpen, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [editingFlag, setEditingFlag] = useState<Flag | null>(null);
	const [flagToDelete, setFlagToDelete] = useState<Flag | null>(null);
	const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

	const { data: flags, isLoading: flagsLoading } = useQuery({
		...orpc.flags.list.queryOptions({ 
			input: { 
				websiteId,
				folder: selectedFolder || undefined,
			} 
		}),
	});

	const { data: allFlags } = useQuery({
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
	});

	const activeFlags = useMemo(
		() => flags?.filter((f) => f.status !== "archived") ?? [],
		[flags]
	);

	const folders = useMemo(() => {
		if (!allFlags) return [];
		const allActiveFlags = allFlags.filter((f) => f.status !== "archived");
		return buildFolderTree(allActiveFlags);
	}, [allFlags]);

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
				<div className="flex h-full">
					{/* Folder Sidebar */}
					<FolderSidebar
						className="w-64 shrink-0"
						folders={folders}
						onFolderSelect={setSelectedFolder}
						selectedFolder={selectedFolder}
						websiteId={websiteId}
					/>

					{/* Main Content */}
					<div className="flex-1 overflow-y-auto">
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
										description={
											selectedFolder
												? `No flags found in the "${selectedFolder}" folder.`
												: "Create your first feature flag to start controlling feature rollouts and A/B testing across your application."
										}
										icon={<FlagIcon weight="duotone" />}
										title={
											selectedFolder
												? "No flags in this folder"
												: "No feature flags yet"
										}
										variant="minimal"
									/>
								</div>
							) : (
								<FlagsList
									flags={activeFlags as Flag[]}
									groups={groupsMap}
									onDelete={handleDeleteFlagRequest}
									onEdit={handleEditFlag}
								/>
							)}
						</Suspense>

						{isFlagSheetOpen && (
							<Suspense fallback={null}>
								<FlagSheet
									flag={editingFlag}
									folders={folders}
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
				</div>
			</ErrorBoundary>
		</FeatureGate>
	);
}
