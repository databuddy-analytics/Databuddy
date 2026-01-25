"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { FlagIcon, FolderSimplePlusIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureGate } from "@/components/feature-gate";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/lib/orpc";
import { isFlagSheetOpenAtom } from "@/stores/jotai/flagsAtoms";
import { FlagSheet } from "./_components/flag-sheet";
import { FlagsListSkeleton } from "./_components/flags-list";
import { FolderSheet } from "./_components/folder-sheet";
import { OrganizedFlagsList } from "./_components/organized-flags-list";
import type { Flag, FlagFolder, TargetGroup } from "./_components/types";

export default function FlagsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const queryClient = useQueryClient();
	const [isFlagSheetOpen, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [editingFlag, setEditingFlag] = useState<Flag | null>(null);
	const [flagToDelete, setFlagToDelete] = useState<Flag | null>(null);

	// Folder state
	const [isFolderSheetOpen, setIsFolderSheetOpen] = useState(false);
	const [editingFolder, setEditingFolder] = useState<FlagFolder | null>(null);
	const [folderToDelete, setFolderToDelete] = useState<FlagFolder | null>(null);

	const { data: flags, isLoading: flagsLoading } = useQuery({
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
	});

	const { data: folders, isLoading: foldersLoading } = useQuery({
		...orpc.flags.listFolders.queryOptions({ input: { websiteId } }),
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

	const deleteFlagMutation = useMutation({
		...orpc.flags.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
		},
	});

	const deleteFolderMutation = useMutation({
		...orpc.flags.deleteFolder.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.listFolders.key({ input: { websiteId } }),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
		},
	});

	const moveToFolderMutation = useMutation({
		...orpc.flags.moveToFolder.mutationOptions(),
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

	const handleCreateFolder = () => {
		setEditingFolder(null);
		setIsFolderSheetOpen(true);
	};

	const handleEditFlag = (flag: Flag) => {
		setEditingFlag(flag);
		setIsFlagSheetOpen(true);
	};

	const handleEditFolder = (folder: FlagFolder) => {
		setEditingFolder(folder);
		setIsFolderSheetOpen(true);
	};

	const handleDeleteFlagRequest = (flagId: string) => {
		const flag = flags?.find((f) => f.id === flagId);
		if (flag) {
			setFlagToDelete(flag as Flag);
		}
	};

	const handleDeleteFolderRequest = (folderId: string) => {
		const folder = folders?.find((f) => f.id === folderId);
		if (folder) {
			setFolderToDelete(folder as FlagFolder);
		}
	};

	const handleConfirmDeleteFlag = async () => {
		if (flagToDelete) {
			await deleteFlagMutation.mutateAsync({ id: flagToDelete.id });
			setFlagToDelete(null);
		}
	};

	const handleConfirmDeleteFolder = async () => {
		if (folderToDelete) {
			await deleteFolderMutation.mutateAsync({ id: folderToDelete.id });
			setFolderToDelete(null);
		}
	};

	const handleMoveFlag = (flagId: string, folderId: string | null) => {
		moveToFolderMutation.mutate({ flagId, folderId });
	};

	const handleFlagSheetClose = () => {
		setIsFlagSheetOpen(false);
		setEditingFlag(null);
	};

	const handleFolderSheetClose = () => {
		setIsFolderSheetOpen(false);
		setEditingFolder(null);
	};

	const isLoading = flagsLoading || foldersLoading;
	const hasContent = activeFlags.length > 0 || (folders?.length ?? 0) > 0;

	return (
		<FeatureGate feature={GATED_FEATURES.FEATURE_FLAGS}>
			<ErrorBoundary>
				<div className="h-full overflow-y-auto">
					{/* Header with create actions */}
					{hasContent && (
						<div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
							<div className="flex items-center gap-2">
								<h2 className="font-semibold text-lg">Feature Flags</h2>
								<span className="text-muted-foreground text-sm">
									({activeFlags.length} flags
									{(folders?.length ?? 0) > 0 &&
										`, ${folders?.length} ${folders?.length === 1 ? "folder" : "folders"}`}
									)
								</span>
							</div>

							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button size="sm" className="gap-1.5">
										<PlusIcon className="size-4" weight="bold" />
										Create
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										className="gap-2"
										onClick={handleCreateFlag}
									>
										<FlagIcon className="size-4" weight="duotone" />
										New Flag
									</DropdownMenuItem>
									<DropdownMenuItem
										className="gap-2"
										onClick={handleCreateFolder}
									>
										<FolderSimplePlusIcon className="size-4" weight="duotone" />
										New Folder
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)}

					<Suspense fallback={<FlagsListSkeleton />}>
						{isLoading ? (
							<FlagsListSkeleton />
						) : !hasContent ? (
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
							<OrganizedFlagsList
								folders={(folders ?? []) as FlagFolder[]}
								flags={activeFlags as Flag[]}
								groups={groupsMap}
								onEditFolder={handleEditFolder}
								onDeleteFolder={handleDeleteFolderRequest}
								onEditFlag={handleEditFlag}
								onDeleteFlag={handleDeleteFlagRequest}
								onMoveFlag={handleMoveFlag}
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

					{isFolderSheetOpen && (
						<Suspense fallback={null}>
							<FolderSheet
								folder={editingFolder}
								isOpen={isFolderSheetOpen}
								onCloseAction={handleFolderSheetClose}
								websiteId={websiteId}
							/>
						</Suspense>
					)}

					<DeleteDialog
						isDeleting={deleteFlagMutation.isPending}
						isOpen={flagToDelete !== null}
						itemName={flagToDelete?.name || flagToDelete?.key}
						onClose={() => setFlagToDelete(null)}
						onConfirm={handleConfirmDeleteFlag}
						title="Delete Feature Flag"
					/>

					<DeleteDialog
						isDeleting={deleteFolderMutation.isPending}
						isOpen={folderToDelete !== null}
						itemName={folderToDelete?.name}
						onClose={() => setFolderToDelete(null)}
						onConfirm={handleConfirmDeleteFolder}
						title="Delete Folder"
						description="This will remove the folder but keep all flags inside it. They will become unorganized."
					/>
				</div>
			</ErrorBoundary>
		</FeatureGate>
	);
}
