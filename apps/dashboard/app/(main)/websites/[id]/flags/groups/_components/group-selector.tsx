"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { GroupSelectorProps, TargetGroup } from "../../_components/types";
import {
	CheckIcon,
	PlusIcon,
	UsersThreeIcon,
	XMarkIcon as XIcon,
} from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";
import { Popover } from "@databuddy/ui/client";

function GroupPill({
	group,
	onRemove,
}: {
	group: TargetGroup;
	onRemove: () => void;
}) {
	return (
		<motion.div
			animate={{ opacity: 1, scale: 1 }}
			className="group inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-foreground text-xs shadow-sm"
			exit={{ opacity: 0, scale: 0.9 }}
			initial={{ opacity: 0, scale: 0.9 }}
			layout
			style={{ borderColor: `${group.color}40` }}
		>
			<span className="max-w-28 truncate font-medium">{group.name}</span>
			<button
				className="cursor-pointer text-muted-foreground transition-colors hover:text-destructive"
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
				type="button"
			>
				<XIcon className="size-3" weight="bold" />
			</button>
		</motion.div>
	);
}

function GroupOption({
	group,
	isSelected,
	onToggle,
}: {
	group: TargetGroup;
	isSelected: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			className={cn(
				"relative flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-md p-2.5 text-left transition-all",
				isSelected
					? "bg-primary/10 hover:bg-primary/15"
					: "hover:bg-interactive-hover"
			)}
			onClick={onToggle}
			type="button"
		>
			{isSelected && (
				<div
					className="absolute inset-y-0 left-0 w-0.5"
					style={{ backgroundColor: group.color }}
				/>
			)}
			<div
				className="flex size-7 shrink-0 items-center justify-center rounded"
				style={{
					background: `linear-gradient(135deg, ${group.color}25 0%, ${group.color}15 100%)`,
				}}
			>
				<UsersThreeIcon
					className="size-3.5"
					style={{ color: group.color }}
					weight="duotone"
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div className="truncate font-medium text-foreground text-xs">
					{group.name}
				</div>
				{group.description && (
					<div className="truncate text-[11px] text-muted-foreground">
						{group.description}
					</div>
				)}
			</div>
			<div
				className={cn(
					"flex size-4 shrink-0 items-center justify-center rounded border transition-all",
					isSelected ? "border-transparent" : "border-border"
				)}
				style={isSelected ? { backgroundColor: group.color } : undefined}
			>
				{isSelected && (
					<CheckIcon className="text-white" size={10} weight="bold" />
				)}
			</div>
		</button>
	);
}

export function GroupSelector({
	selectedGroups,
	availableGroups,
	onChangeAction,
}: GroupSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);

	const selectedGroupObjects = availableGroups.filter((g) =>
		selectedGroups.includes(g.id)
	);

	const handleToggle = (groupId: string) => {
		if (selectedGroups.includes(groupId)) {
			onChangeAction(selectedGroups.filter((id) => id !== groupId));
		} else {
			onChangeAction([...selectedGroups, groupId]);
		}
	};

	const handleRemove = (groupId: string) => {
		onChangeAction(selectedGroups.filter((id) => id !== groupId));
	};

	if (availableGroups.length === 0) {
		return (
			<div className="rounded-lg border border-dashed bg-accent/50 p-4 text-center">
				<UsersThreeIcon
					className="mx-auto mb-2 size-6 text-muted-foreground"
					weight="duotone"
				/>
				<p className="text-balance text-muted-foreground text-xs">
					No groups yet. Create one to reuse user targeting across flags.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{selectedGroupObjects.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					<AnimatePresence mode="popLayout">
						{selectedGroupObjects.map((group) => (
							<GroupPill
								group={group}
								key={group.id}
								onRemove={() => handleRemove(group.id)}
							/>
						))}
					</AnimatePresence>
				</div>
			)}

			<Popover onOpenChange={setIsOpen} open={isOpen}>
				<Popover.Trigger
					render={
						<Button
							className="w-full text-muted-foreground"
							size="sm"
							type="button"
							variant="secondary"
						/>
					}
				>
					<PlusIcon className="size-3.5" />
					{selectedGroups.length > 0 ? "Add more groups" : "Add groups"}
				</Popover.Trigger>
				<Popover.Content className="w-72 p-2" side="bottom">
					<div className="mb-2 px-2 pt-1">
						<Popover.Title>Target Groups</Popover.Title>
						<Popover.Description>Select groups to target</Popover.Description>
					</div>
					<div className="max-h-64 space-y-0.5 overflow-y-auto">
						{availableGroups.map((group) => (
							<GroupOption
								group={group}
								isSelected={selectedGroups.includes(group.id)}
								key={group.id}
								onToggle={() => handleToggle(group.id)}
							/>
						))}
					</div>
				</Popover.Content>
			</Popover>
		</div>
	);
}
