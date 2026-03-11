"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { FlagIcon } from "@phosphor-icons/react/dist/ssr/Flag";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
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

	const activeFlags = useMemo(
		() => flags?.filter((f) => f.status !== "archived") ?? [],
		[flags]
	);

	const filteredFlags = useMemo(() => {
		if (selectedFolder === null) {
			return activeFlags;
		}

		if (selectedFolder === "") {
			return activeFlags.filter((flag) => !flag.folder);
		}

		return activeFlags.filter((flag) => flag.folder === selectedFolder);
	}, [activeFlags, selectedFolder]);

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

	const invalidateFlags = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.flags.list.key({ input: { websiteId } }),
		});
	};

	const deleteFlagMutation = useMutation({
		...orpc.flags.delete.mutationOptions(),
		onSuccess: invalidateFlags,
		onError: () => {
			toast.error("Failed to delete flag");
		},
	});

	const updateFlagMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
		onError: () => {
			toast.error("Failed to update folder organization");
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
		if (!flagToDelete) {
			return;
		}

		await deleteFlagMutation.mutateAsync({ id: flagToDelete.id });
		setFlagToDelete(null);
	};

	const handleFlagSheetClose = () => {
		setIsFlagSheetOpen(false);
		setEditingFlag(null);
	};

	const handleRenameFolder = async (oldPath: string, newPath: string) => {
		const trimmedNewPath = newPath.trim().replace(/^\/+|\/+$/g, "");
		if (!trimmedNewPath) {
			toast.error("Folder name cannot be empty");
			return;
		}

		const folderExists = activeFlags.some(
			(flag) => flag.folder === trimmedNewPath && flag.folder !== oldPath,
		);
		if (folderExists) {
			toast.error("A folder with this path already exists");
			return;
		}

		const affectedFlags = activeFlags.filter(
			(flag) => flag.folder === oldPath || flag.folder?.startsWith(`${oldPath}/`),
		);

		if (affectedFlags.length === 0) {
			toast.error("No flags found in that folder");
			return;
		}

		try {
			await Promise.all(
				affectedFlags.map((flag) => {
					const nextFolder = flag.folder?.replace(oldPath, trimmedNewPath) ?? null;
					return updateFlagMutation.mutateAsync({
						id: flag.id,
						folder: nextFolder,
					});
				}),
			);

			await invalidateFlags();

			if (selectedFolder === oldPath || selectedFolder?.startsWith(`${oldPath}/`)) {
				setSelectedFolder(selectedFolder.replace(oldPath, trimmedNewPath));
			}

			toast.success(`Renamed folder to ${trimmedNewPath}`);
		} catch {
			// toast handled in mutation
		}
	};

	const handleDeleteFolder = async (folderPath: string) => {
		const affectedFlags = activeFlags.filter(
			(flag) => flag.folder === folderPath || flag.folder?.startsWith(`${folderPath}/`),
		);

		if (affectedFlags.length === 0) {
			toast.error("No flags found in that folder");
			return;
		}

		try {
			await Promise.all(
				affectedFlags.map((flag) =>
					updateFlagMutation.mutateAsync({
						id: flag.id,
						folder: null,
					}),
				),
			);

			await invalidateFlags();

			if (selectedFolder === folderPath || selectedFolder?.startsWith(`${folderPath}/`)) {
				setSelectedFolder("");
			}

			toast.success("Folder deleted. Flags moved to Uncategorized.");
		} catch {
			// toast handled in mutation
		}
	};

	const isMutatingFolders = updateFlagMutation.isPending;

	return (
		<FeatureGate feature={GATED_FEATURES.FEATURE_FLAGS}>
			<ErrorBoundary>
				<div className="flex h-full flex-col overflow-hidden lg:flex-row">
					{!flagsLoading && activeFlags.length > 0 && (
						<FolderTree
							flags={activeFlags as Flag[]}
							onDeleteFolderAction={handleDeleteFolder}
							onRenameFolderAction={handleRenameFolder}
							onSelectFolderAction={setSelectedFolder}
							selectedFolder={selectedFolder}
							websiteId={websiteId}
						/>
					)}

					<div className="min-h-0 flex-1 overflow-y-auto">
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
										description={
											selectedFolder === ""
												? "No uncategorized flags yet."
												: "No flags found in this folder."
										}
										icon={<FlagIcon weight="duotone" />}
										title="Nothing here yet"
										variant="minimal"
									/>
								</div>
							) : (
								<div className="relative">
									{isMutatingFolders && (
										<div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 bg-primary/20" />
									)}
									<FlagsList
										flags={filteredFlags as Flag[]}
										groups={groupsMap}
										onDelete={handleDeleteFlagRequest}
										onEdit={handleEditFlag}
										selectedFolder={selectedFolder}
									/>
								</div>
							)}
						</Suspense>
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
				</div>
			</ErrorBoundary>
		</FeatureGate>
	);
}
