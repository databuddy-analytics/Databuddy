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
import { FolderListItem } from "./_components/folder-list-item";
import type { Flag, TargetGroup } from "./_components/types";

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

	// Folder Logic
	const [activeFolder, setActiveFolder] = useState<string | null>(null);

	const folderData = useMemo(() => {
		const folders = new Set<string>();
		const counts: Record<string, number> = { all: activeFlags.length };
		const grouped: Record<string, Flag[]> = {};
		const rootFlags: Flag[] = [];

		for (const flag of activeFlags) {
			if (flag.folder) {
				folders.add(flag.folder);
				counts[flag.folder] = (counts[flag.folder] || 0) + 1;
				if (!grouped[flag.folder]) grouped[flag.folder] = [];
				grouped[flag.folder].push(flag);
			} else {
				rootFlags.push(flag);
			}
		}

		return {
			folders: Array.from(folders).sort(),
			counts,
			grouped,
			rootFlags,
		};
	}, [activeFlags]);

	const displayedFlags = useMemo(() => {
		if (activeFolder) {
			return folderData.grouped[activeFolder] || [];
		}
		return activeFlags; // Used only if not using grouped view for "All"
	}, [activeFolder, activeFlags, folderData]);

	// Prepare content based on view
	const renderContent = () => {
		if (flagsLoading) return <FlagsListSkeleton />;

		if (activeFlags.length === 0) {
			return (
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
			);
		}

		if (activeFolder) {
			// Single Folder View
			return (
				<FlagsList
					flags={displayedFlags}
					groups={groupsMap}
					onDelete={handleDeleteFlagRequest}
					onEdit={handleEditFlag}
				/>
			);
		}

		// All Flags View (Grouped)
		return (
			<div className="space-y-6">
				{/* Root Flags */}
				{folderData.rootFlags.length > 0 && (
					<div>
						{folderData.folders.length > 0 && (
							<div className="mb-2 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								Uncategorized
							</div>
						)}
						<FlagsList
							flags={folderData.rootFlags}
							groups={groupsMap}
							onDelete={handleDeleteFlagRequest}
							onEdit={handleEditFlag}
						/>
					</div>
				)}

				{/* Folders */}
				{folderData.folders.map((folder) => (
					<FolderListItem
						key={folder}
						name={folder}
						count={folderData.counts[folder]}
					>
						<FlagsList
							flags={folderData.grouped[folder]}
							groups={groupsMap}
							onDelete={handleDeleteFlagRequest}
							onEdit={handleEditFlag}
						/>
					</FolderListItem>
				))}
			</div>
		);
	};

	return (
		<FeatureGate feature={GATED_FEATURES.FEATURE_FLAGS}>
			<ErrorBoundary>
				<div className="flex h-full">
					{activeFlags.length > 0 && (
						<FolderSidebar
							folders={folderData.folders}
							activeFolder={activeFolder}
							onSelectFolder={setActiveFolder}
							counts={folderData.counts}
						/>
					)}
					<div className="flex-1 overflow-y-auto">
						<Suspense fallback={<FlagsListSkeleton />}>
							{renderContent()}
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
