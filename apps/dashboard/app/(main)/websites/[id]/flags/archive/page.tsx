"use client";

import { ArchiveIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { orpc } from "@/lib/orpc";
import { isFlagSheetOpenAtom } from "@/stores/jotai/flagsAtoms";
import { FlagSheet } from "../_components/flag-sheet";
import type { Flag } from "../_components/types";
import { ArchivedFlagItem } from "./_components/archived-flag-item";

const ArchivedFlagsListSkeleton = () => (
	<div className="border-border border-t">
		{[...new Array(3)].map((_, i) => (
			<div
				className="flex animate-pulse items-center border-border border-b px-4 py-4 sm:px-6"
				key={`skeleton-${i + 1}`}
			>
				<div className="flex flex-1 items-center gap-4">
					<div className="min-w-0 flex-1 space-y-2">
						<div className="flex items-center gap-2">
							<div className="h-5 w-40 rounded bg-muted" />
							<div className="h-5 w-16 rounded bg-muted" />
						</div>
						<div className="h-4 w-48 rounded bg-muted" />
					</div>
					<div className="size-8 rounded bg-muted" />
				</div>
			</div>
		))}
	</div>
);

export default function ArchivePage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isFlagSheetOpen, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [editingFlag, setEditingFlag] = useState<Flag | null>(null);
	const [flagToDelete, setFlagToDelete] = useState<Flag | null>(null);
	const queryClient = useQueryClient();

	const { data: flagsRaw, isLoading: flagsLoading } = useQuery({
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
	});
	const flags = flagsRaw as Flag[] | undefined;

	const archivedFlags = useMemo(
		() => flags?.filter((f) => f.status === "archived") ?? [],
		[flags]
	);

	const deleteFlagMutation = useMutation({
		...orpc.flags.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
		},
	});

	const handleEditFlag = (flag: Flag) => {
		setEditingFlag(flag);
		setIsFlagSheetOpen(true);
	};

	const handleDeleteFlagRequest = (flagId: string) => {
		const flag = archivedFlags.find((f) => f.id === flagId);
		if (flag) {
			setFlagToDelete(flag);
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

	if (flagsLoading) {
		return <ArchivedFlagsListSkeleton />;
	}

	return (
		<ErrorBoundary>
			<div className="h-full overflow-y-auto">
				<Suspense fallback={<ArchivedFlagsListSkeleton />}>
					{archivedFlags.length === 0 ? (
						<div className="flex flex-1 items-center justify-center py-16">
							<EmptyState
								description="Archived flags will appear here. You can archive flags from the main flags view."
								icon={<ArchiveIcon weight="duotone" />}
								title="No archived flags"
								variant="minimal"
							/>
						</div>
					) : (
						<div>
							{archivedFlags.map((flag) => (
								<ArchivedFlagItem
									flag={flag}
									key={flag.id}
									onDelete={handleDeleteFlagRequest}
									onEdit={handleEditFlag}
								/>
							))}
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
	);
}
