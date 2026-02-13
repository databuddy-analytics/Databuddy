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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { orpc } from "@/lib/orpc";
import { isFlagSheetOpenAtom } from "@/stores/jotai/flagsAtoms";
import { FlagSheet } from "./_components/flag-sheet";
import { FlagsList, FlagsListSkeleton } from "./_components/flags-list";
import type { Flag, TargetGroup } from "./_components/types";

const ALL_FOLDERS = "__all__";
const UNASSIGNED_FOLDER = "__unassigned__";

export default function FlagsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const queryClient = useQueryClient();
	const [isFlagSheetOpen, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [editingFlag, setEditingFlag] = useState<Flag | null>(null);
	const [flagToDelete, setFlagToDelete] = useState<Flag | null>(null);
	const [selectedFolder, setSelectedFolder] = useState<string>(ALL_FOLDERS);

	const { data: flags, isLoading: flagsLoading } = useQuery({
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
	});

	const activeFlags = useMemo(
		() => flags?.filter((f) => f.status !== "archived") ?? [],
		[flags]
	);

	const folderData = useMemo(() => {
		const folderCounts = new Map<string, number>();
		for (const flag of activeFlags) {
			const normalized = (flag.folder || "").trim();
			const key = normalized.length > 0 ? normalized : UNASSIGNED_FOLDER;
			folderCounts.set(key, (folderCounts.get(key) ?? 0) + 1);
		}

		const folderKeys = Array.from(folderCounts.keys()).sort((a, b) => {
			if (a === UNASSIGNED_FOLDER) return 1;
			if (b === UNASSIGNED_FOLDER) return -1;
			return a.localeCompare(b);
		});

		return { folderCounts, folderKeys };
	}, [activeFlags]);

	const filteredFlags = useMemo(() => {
		if (selectedFolder === ALL_FOLDERS) {
			return activeFlags;
		}
		if (selectedFolder === UNASSIGNED_FOLDER) {
			return activeFlags.filter((flag) => !flag.folder?.trim());
		}
		return activeFlags.filter(
			(flag) => (flag.folder || "").trim() === selectedFolder
		);
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
				<div className="h-full overflow-y-auto">
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
					) : (
						<div className="space-y-3">
							<div className="flex flex-wrap items-center gap-3 px-4 pt-2">
								<div className="text-muted-foreground text-xs uppercase tracking-wide">
									Folders
								</div>
								<Select
									onValueChange={setSelectedFolder}
									value={selectedFolder}
								>
									<SelectTrigger className="h-8 w-[220px]" size="sm">
										<SelectValue placeholder="All folders" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ALL_FOLDERS}>All folders</SelectItem>
										{folderData.folderCounts.has(UNASSIGNED_FOLDER) && (
											<SelectItem value={UNASSIGNED_FOLDER}>
												Unassigned (
												{folderData.folderCounts.get(UNASSIGNED_FOLDER) ?? 0})
											</SelectItem>
										)}
										{folderData.folderKeys
											.filter((key) => key !== UNASSIGNED_FOLDER)
											.map((folder) => (
												<SelectItem key={folder} value={folder}>
													{folder} ({folderData.folderCounts.get(folder) ?? 0})
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</div>

							<FlagsList
								flags={filteredFlags as Flag[]}
								groupByFolder
								groups={groupsMap}
								onDelete={handleDeleteFlagRequest}
								onEdit={handleEditFlag}
							/>
						</div>
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
