"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { FlagIcon, FolderIcon, FolderOpenIcon, StackIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureGate } from "@/components/feature-gate";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { cn } from "@/lib/utils";
import { orpc } from "@/lib/orpc";
import { isFlagSheetOpenAtom } from "@/stores/jotai/flagsAtoms";
import { FlagSheet } from "./_components/flag-sheet";
import { FlagsList, FlagsListSkeleton } from "./_components/flags-list";
import type { Flag, TargetGroup } from "./_components/types";

const ALL_FOLDERS = "__all__";
const UNCATEGORIZED = "__uncategorized__";

function FolderNav({
	folders,
	activeFolder,
	totalCount,
	uncategorizedCount,
	onSelectFolder,
}: {
	folders: string[];
	activeFolder: string;
	totalCount: number;
	uncategorizedCount: number;
	onSelectFolder: (folder: string) => void;
}) {
	if (folders.length === 0) return null;

	return (
		<nav className="w-48 shrink-0 border-border/60 border-r pr-3">
			<p className="mb-2 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
				Folders
			</p>
			<ul className="space-y-0.5">
				<li>
					<button
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
							activeFolder === ALL_FOLDERS
								? "bg-primary/10 font-medium text-primary"
								: "text-muted-foreground hover:bg-accent hover:text-foreground"
						)}
						onClick={() => onSelectFolder(ALL_FOLDERS)}
						type="button"
					>
						<StackIcon className="size-4 shrink-0" weight="duotone" />
						<span className="flex-1 truncate">All Flags</span>
						<span className="rounded bg-accent px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
							{totalCount}
						</span>
					</button>
				</li>
				{folders.map((folder) => {
					const isActive = activeFolder === folder;
					return (
						<li key={folder}>
							<button
								className={cn(
									"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
									isActive
										? "bg-primary/10 font-medium text-primary"
										: "text-muted-foreground hover:bg-accent hover:text-foreground"
								)}
								onClick={() => onSelectFolder(folder)}
								type="button"
							>
								{isActive ? (
									<FolderOpenIcon className="size-4 shrink-0" weight="duotone" />
								) : (
									<FolderIcon className="size-4 shrink-0" weight="duotone" />
								)}
								<span className="flex-1 truncate">{folder}</span>
							</button>
						</li>
					);
				})}
				{uncategorizedCount > 0 && (
					<li>
						<button
							className={cn(
								"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
								activeFolder === UNCATEGORIZED
									? "bg-primary/10 font-medium text-primary"
									: "text-muted-foreground hover:bg-accent hover:text-foreground"
							)}
							onClick={() => onSelectFolder(UNCATEGORIZED)}
							type="button"
						>
							<FolderIcon className="size-4 shrink-0 opacity-40" weight="duotone" />
							<span className="flex-1 truncate italic">Uncategorized</span>
							<span className="rounded bg-accent px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
								{uncategorizedCount}
							</span>
						</button>
					</li>
				)}
			</ul>
		</nav>
	);
}

export default function FlagsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const queryClient = useQueryClient();
	const [isFlagSheetOpen, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [editingFlag, setEditingFlag] = useState<Flag | null>(null);
	const [flagToDelete, setFlagToDelete] = useState<Flag | null>(null);
	const [activeFolder, setActiveFolder] = useState<string>(ALL_FOLDERS);

	const { data: flags, isLoading: flagsLoading } = useQuery({
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
	});

	const { data: folderList = [] } = useQuery({
		...orpc.flags.listFolders.queryOptions({ input: { websiteId } }),
	});

	const activeFlags = useMemo(
		() => flags?.filter((f) => f.status !== "archived") ?? [],
		[flags]
	);

	const uncategorizedCount = useMemo(
		() => activeFlags.filter((f) => !f.folder).length,
		[activeFlags]
	);

	const filteredFlags = useMemo(() => {
		if (activeFolder === ALL_FOLDERS) return activeFlags;
		if (activeFolder === UNCATEGORIZED) return activeFlags.filter((f) => !f.folder);
		return activeFlags.filter((f) => f.folder === activeFolder);
	}, [activeFlags, activeFolder]);

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

	const deleteFlagMutation = useMutation({
		...orpc.flags.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.flags.listFolders.key({ input: { websiteId } }),
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
		queryClient.invalidateQueries({
			queryKey: orpc.flags.listFolders.key({ input: { websiteId } }),
		});
	};

	const hasFolders = folderList.length > 0;

	return (
		<FeatureGate feature={GATED_FEATURES.FEATURE_FLAGS}>
			<ErrorBoundary>
				<div className="flex h-full overflow-hidden">
					{hasFolders && (
						<div className="flex h-full shrink-0 overflow-y-auto py-4 pl-4">
							<FolderNav
								activeFolder={activeFolder}
								folders={folderList}
								onSelectFolder={setActiveFolder}
								totalCount={activeFlags.length}
								uncategorizedCount={uncategorizedCount}
							/>
						</div>
					)}
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
										description="No flags in this folder yet."
										icon={<FolderOpenIcon weight="duotone" />}
										title="Empty folder"
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
