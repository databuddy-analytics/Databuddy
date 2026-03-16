"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { FlagIcon } from "@phosphor-icons/react/dist/ssr/Flag";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureGate } from "@/components/feature-gate";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { orpc } from "@/lib/orpc";
import { isFlagSheetOpenAtom } from "@/stores/jotai/flagsAtoms";
import { FlagSheet } from "./_components/flag-sheet";
import { FlagsList, FlagsListSkeleton } from "./_components/flags-list";
import { FolderTree } from "./_components/folder-tree";
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
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
	});

	// Extract unique folders from flags
	const folders = useMemo(() => {
		if (!flags) return [];
		const folderSet = new Set<string>();
		for (const flag of flags) {
			if (flag.folder) {
				folderSet.add(flag.folder as string);
			}
		}
		return Array.from(folderSet).sort();
	}, [flags]);

	// Filter flags by selected folder, excluding archived
	const filteredFlags = useMemo(() => {
		if (!flags) return [];
		const activeFlags = flags.filter((f) => f.status !== "archived");
		if (selectedFolder === null) return activeFlags;
		if (selectedFolder === "__uncategorized__") {
			return activeFlags.filter((f) => !f.folder);
		}
		return activeFlags.filter(
			(f) =>
				f.folder === selectedFolder ||
				(f.folder as string)?.startsWith(selectedFolder + "/")
		);
	}, [flags, selectedFolder]);

	const groupsMap = useMemo(() => {
		const map = new Map<string, TargetGroup[]>();
		for (const flag of filteredFlags) {
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
	}, [filteredFlags]);

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

	const handleCreateFolder = useCallback((name: string) => {
		setSelectedFolder(name);
	}, []);

	return (
		<FeatureGate feature={GATED_FEATURES.FEATURE_FLAGS}>
			<ErrorBoundary>
				<div className="flex h-full min-h-0 gap-0">
					{/* Folder Sidebar */}
					{folders.length > 0 && (
						<div className="w-56 shrink-0 border-r border-border overflow-y-auto py-2">
							<FolderTree
								folders={folders}
								selectedFolder={selectedFolder}
								onSelectFolder={setSelectedFolder}
								onCreateFolder={handleCreateFolder}
							/>
						</div>
					)}

					{/* Flags List */}
					<div className="flex-1 min-w-0 overflow-y-auto">
						<Suspense fallback={<FlagsListSkeleton />}>
							{flagsLoading ? (
								<FlagsListSkeleton />
							) : filteredFlags.length === 0 ? (
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
							) : (
								<FlagsList
									flags={filteredFlags as Flag[]}
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
