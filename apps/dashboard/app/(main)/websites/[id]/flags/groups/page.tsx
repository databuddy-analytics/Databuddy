"use client";

import { GATED_FEATURES } from"@databuddy/shared/types/features";
import { useMutation, useQuery, useQueryClient } from"@tanstack/react-query";
import { useAtom } from"jotai";
import { useParams } from"next/navigation";
import { Suspense, useState } from"react";
import { ErrorBoundary } from"@/components/error-boundary";
import { FeatureGate } from"@/components/feature-gate";
import { orpc } from"@/lib/orpc";
import { isGroupSheetOpenAtom } from"@/stores/jotai/flagsAtoms";
import type { TargetGroup } from"../_components/types";
import { GroupSheet } from"./_components/group-sheet";
import { GroupsList } from"./_components/groups-list";

const GroupsListSkeleton = () => (
	<div className="border-border border-t">
		{[...new Array(5)].map((_, i) => (
			<div
				className="flex animate-pulse items-center border-border border-b px-4 py-4 sm:px-6"
				key={`group-skeleton-${i + 1}`}
			>
				<div className="flex flex-1 items-center gap-4">
					<div className="min-w-0 flex-1 space-y-2">
						<div className="flex items-center gap-2">
							<div className="size-8 bg-muted" />
							<div className="h-5 w-40 bg-muted" />
							<div className="h-5 w-16 bg-muted" />
						</div>
						<div className="h-4 w-48 bg-muted" />
					</div>
					<div className="size-8 bg-muted" />
				</div>
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

	const { data: groups, isLoading: groupsLoading } = useQuery({
		...orpc.targetGroups.list.queryOptions({ input: { websiteId } }),
	});

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
							groups={(groups as TargetGroup[]) ?? []}
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
