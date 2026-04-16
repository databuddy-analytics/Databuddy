"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react";
import { UsersThreeIcon } from "@phosphor-icons/react";
import { XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { GroupSelectorProps, TargetGroup } from "../../_components/types";

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
			className="group relative flex items-center gap-1.5 overflow-hidden rounded border bg-card py-1.5 pr-1.5 pl-3 text-sm shadow-sm transition-shadow hover:shadow-md"
			exit={{ opacity: 0, scale: 0.9 }}
			initial={{ opacity: 0, scale: 0.9 }}
			layout
			style={{ borderColor: `${group.color}40` }}
		>
			<span className="relative max-w-28 truncate font-medium">
				{group.name}
			</span>
			<button
				className="relative flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
				type="button"
			>
				<XIcon size={12} weight="bold" />
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
				"relative flex w-full items-center gap-3 overflow-hidden rounded p-2.5 text-left transition-all",
				isSelected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent"
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
				className="flex size-8 shrink-0 items-center justify-center rounded shadow-sm"
				style={{
					background: `linear-gradient(135deg, ${group.color}25 0%, ${group.color}15 100%)`,
				}}
			>
				<UsersThreeIcon
					className="size-4"
					style={{ color: group.color }}
					weight="duotone"
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div className="truncate font-medium text-sm">{group.name}</div>
				{group.description && (
					<div className="truncate text-muted-foreground text-xs">
						{group.description}
					</div>
				)}
			</div>
			<div
				className={cn(
					"flex size-5 shrink-0 items-center justify-center rounded border transition-all",
					isSelected ? "border-transparent shadow-sm" : "border-border"
				)}
				style={isSelected ? { backgroundColor: group.color } : undefined}
			>
				{isSelected && (
					<CheckIcon className="text-white" size={12} weight="bold" />
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
			<div className="rounded border border-dashed bg-accent/50 p-4 text-center">
				<UsersThreeIcon
					className="mx-auto mb-2 size-8 text-muted-foreground"
					weight="duotone"
				/>
				<p className="text-balance text-muted-foreground text-sm">
					No groups created yet. Create groups to quickly target the same users
					across multiple flags.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{selectedGroupObjects.length > 0 && (
				<div className="flex flex-wrap gap-2">
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
				<PopoverTrigger asChild>
					<Button
						className="w-full text-muted-foreground"
						size="sm"
						type="button"
						variant="outline"
					>
						<PlusIcon size={14} />
						{selectedGroups.length > 0 ? "Add More Groups" : "Add Groups"}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-72 p-2" side="bottom">
					<div className="mb-2 px-2 pt-1">
						<h4 className="font-medium text-sm">Target Groups</h4>
						<p className="text-muted-foreground text-xs">
							Select groups to target
						</p>
					</div>
					<div className="max-h-64 space-y-1 overflow-y-auto">
						{availableGroups.map((group) => (
							<GroupOption
								group={group}
								isSelected={selectedGroups.includes(group.id)}
								key={group.id}
								onToggle={() => handleToggle(group.id)}
							/>
						))}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
