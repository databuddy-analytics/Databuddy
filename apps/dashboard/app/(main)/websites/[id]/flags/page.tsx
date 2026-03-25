"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import {
	FlagIcon,
	FolderIcon,
	GearIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureGate } from "@/components/feature-gate";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { orpc } from "@/lib/orpc";
import { isFlagSheetOpenAtom } from "@/stores/jotai/flagsAtoms";
import { FlagSheet } from "./_components/flag-sheet";
import { FlagsListWithFolders } from "./_components/flags-list-with-folders";
import { FlagsListSkeleton } from "./_components/flags-list";
import { FolderManagementDialog } from "./_components/folder-management-dialog";
import { FolderTree } from "./_components/folder-tree";
import type { Flag, TargetGroup } from "./_components/types";

export default function FlagsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const queryClient = useQueryClient();
	const [isFlagSheetOpen, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [editingFlag, setEditingFlag] = useState<Flag | null>(null);
	const [flagToDelete, setFlagToDelete] = useState<Flag | null>(null);
	const [selectedFolder, setSelectedFolder] = useState<string>("ALL");
	const [isFolderManagementOpen, setIsFolderManagementOpen] = useState(false);

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

	const deleteFlagMutation = useMutation({
		...orpc.flags.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
		},
	});

	const updateFlagMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
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

	const handleUpdateFlag = async (flagId: string, updates: { folder?: string }) => {
		try {
			await updateFlagMutation.mutateAsync({
				id: flagId,
				...updates,
			});
		} catch (error) {
			console.error("Failed to update flag:", error);
			throw error;
		}
	};

	// Filter flags by selected folder
	const displayFlags = useMemo(() => {
		// Show all flags when "ALL" is selected
		if (selectedFolder === "ALL") {
			return activeFlags;
		}
		if (selectedFolder === "") {
			return activeFlags.filter((flag) => !flag.folder);
		}
		// Show flags in selected folder AND all subfolders
		return activeFlags.filter((flag) => 
			flag.folder === selectedFolder || 
			flag.folder?.startsWith(selectedFolder + "/")
		);
	}, [activeFlags, selectedFolder]);

	return (
		<FeatureGate feature={GATED_FEATURES.FEATURE_FLAGS}>
			<ErrorBoundary>
				<div className="flex h-full flex-col lg:flex-row">
					{/* Sidebar with folder tree */}
					<div className="lg:w-80 border-r bg-muted/30 flex flex-col lg:border-b-0 border-b">
						{/* Sidebar Header */}
						<div className="border-b p-4">
							<div className="flex items-center justify-between">
								<h2 className="font-semibold text-sm">Folders</h2>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setIsFolderManagementOpen(true)}
									className="size-8 p-0"
									aria-label="Manage folders"
								>
									<GearIcon size={16} />
								</Button>
							</div>
						</div>

						{/* Folder Tree */}
						<div className="flex-1 overflow-y-auto p-4 lg:max-h-none max-h-48">
							{flagsLoading ? (
								<div className="space-y-2">
									{Array.from({ length: 3 }).map((_, i) => (
										<div key={i} className="h-8 bg-muted rounded animate-pulse" />
									))}
								</div>
							) : (
								<FolderTree
									flags={activeFlags as Flag[]}
									selectedFolder={selectedFolder}
									onFolderSelect={setSelectedFolder}
								/>
							)}
						</div>

						{/* Create Flag Button */}
						<div className="border-t p-4">
							<Button
								onClick={handleCreateFlag}
								className="w-full gap-2"
								size="sm"
							>
								<PlusIcon size={16} />
								Create Flag
							</Button>
						</div>
					</div>

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
										description="Create your first feature flag to start controlling feature rollouts and A/B testing across your application."
										icon={<FlagIcon weight="duotone" />}
										title="No feature flags yet"
										variant="minimal"
									/>
								</div>
							) : displayFlags.length === 0 && selectedFolder !== "ALL" ? (
								<div className="flex flex-1 items-center justify-center py-16">
									<EmptyState
										action={{
											label: "Create Flag in This Folder",
											onClick: handleCreateFlag,
										}}
										description={`No flags found in "${selectedFolder || "Uncategorized"}" folder. Create a new flag or move existing flags here.`}
										icon={<FolderIcon weight="duotone" />}
										title="Empty folder"
										variant="minimal"
									/>
								</div>
							) : (
								<FlagsListWithFolders
									flags={displayFlags as Flag[]}
									groups={groupsMap}
									onDelete={handleDeleteFlagRequest}
									onEdit={handleEditFlag}
									selectedFolder={selectedFolder}
								/>
							)}
						</Suspense>
					</div>

					{/* Dialogs */}
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

					<FolderManagementDialog
						isOpen={isFolderManagementOpen}
						onClose={() => setIsFolderManagementOpen(false)}
						flags={activeFlags as Flag[]}
						onUpdateFlag={handleUpdateFlag}
					/>

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
