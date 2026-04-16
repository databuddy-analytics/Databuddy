"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureGate } from "@/components/feature-gate";
import { orpc } from "@/lib/orpc";
import { isGroupSheetOpenAtom } from "@/stores/jotai/flagsAtoms";
import type { TargetGroup } from "../_components/types";
import { GroupSheet } from "./_components/group-sheet";
import { GroupsList } from "./_components/groups-list";

const GroupsListSkeleton = () => (
	<div>
		{[...new Array(5)].map((_, i) => (
			<div
				className="flex h-15 animate-pulse items-center gap-3 border-b px-4"
				key={`group-skeleton-${i + 1}`}
			>
				<div className="size-7 shrink-0 rounded bg-muted" />
				<div className="h-4 w-28 rounded bg-muted" />
				<div className="h-3.5 w-16 rounded bg-muted" />
				<div className="h-3 w-40 flex-1 rounded bg-muted" />
			</div>
		))}
	</div>
);

export default function GroupsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isGroupSheetOpen, setIsGroupSheetOpen] = useAtom(isGroupSheetOpenAtom);
	const [editingGroup, setEditingGroup] = useState<TargetGroup | null>(null);
	const queryClient = useQueryClient();

	const { data: groupsRaw, isLoading: groupsLoading } = useQuery({
		...orpc.targetGroups.list.queryOptions({ input: { websiteId } }),
	});
	const groups = groupsRaw as TargetGroup[] | undefined;

	const deleteGroupMutation = useMutation({
		...orpc.targetGroups.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.targetGroups.list.key({ input: { websiteId } }),
			});
		},
	});

	const handleCreateGroup = () => {
		setEditingGroup(null);
		setIsGroupSheetOpen(true);
	};

	const handleEditGroup = (group: TargetGroup) => {
		setEditingGroup(group);
		setIsGroupSheetOpen(true);
	};

	const handleDeleteGroup = async (groupId: string) => {
		await deleteGroupMutation.mutateAsync({ id: groupId });
	};

	const handleGroupSheetClose = () => {
		setIsGroupSheetOpen(false);
		setEditingGroup(null);
	};

	return (
		<FeatureGate feature={GATED_FEATURES.FEATURE_FLAGS}>
			<ErrorBoundary>
				<div className="h-full overflow-y-auto">
					<Suspense fallback={<GroupsListSkeleton />}>
						<GroupsList
							groups={groups ?? []}
							isLoading={groupsLoading}
							onCreateGroupAction={handleCreateGroup}
							onDeleteGroup={handleDeleteGroup}
							onEditGroupAction={handleEditGroup}
						/>
					</Suspense>

					{isGroupSheetOpen && (
						<Suspense fallback={null}>
							<GroupSheet
								group={editingGroup}
								isOpen={isGroupSheetOpen}
								onCloseAction={handleGroupSheetClose}
								websiteId={websiteId}
							/>
						</Suspense>
					)}
				</div>
			</ErrorBoundary>
		</FeatureGate>
	);
}
