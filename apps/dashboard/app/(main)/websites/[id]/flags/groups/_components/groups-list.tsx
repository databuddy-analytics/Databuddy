"use client";

import { UsersThreeIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/empty-state";
import type { GroupsListProps } from "../../_components/types";
import { GroupItem } from "./group-item";

export function GroupsList({
	groups,
	isLoading,
	onCreateGroupAction,
	onEditGroupAction,
	onDeleteGroup,
}: GroupsListProps) {
	if (isLoading) {
		return null;
	}

	if (groups.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center py-16">
				<EmptyState
					action={{
						label: "Create Your First Group",
						onClick: onCreateGroupAction,
					}}
					description="Create reusable groups of users to quickly target them across multiple feature flags without repeating the same rules."
					icon={<UsersThreeIcon weight="duotone" />}
					title="No target groups yet"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<div>
			{groups.map((group) => (
				<GroupItem
					group={group}
					key={group.id}
					onDelete={onDeleteGroup ?? (() => {})}
					onEdit={onEditGroupAction}
				/>
			))}
		</div>
	);
}
