"use client";

import {
	DotsThreeIcon,
	EnvelopeIcon,
	PencilSimpleIcon,
	TrashIcon,
	UserIcon,
	UsersThreeIcon,
	WrenchIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TargetGroup } from "../../_components/types";

export interface GroupItemProps {
	group: TargetGroup;
	onEdit: (group: TargetGroup) => void;
	onDelete: (groupId: string) => void;
	isSelected?: boolean;
	onSelect?: () => void;
}

function getRuleTypeLabel(type: string, count: number) {
	const plural = count !== 1;
	switch (type) {
		case "email":
			return plural ? "emails" : "email";
		case "user_id":
			return plural ? "users" : "user";
		case "property":
			return plural ? "properties" : "property";
		default:
			return plural ? "rules" : "rule";
	}
}

function getRuleIcon(type: string) {
	switch (type) {
		case "email":
			return EnvelopeIcon;
		case "user_id":
			return UserIcon;
		default:
			return WrenchIcon;
	}
}

function buildRuleSummary(group: TargetGroup): string {
	const rules = group.rules ?? [];
	if (rules.length === 0 && !group.memberCount) {
		return "No rules configured";
	}

	const counts = rules.reduce(
		(acc, rule) => {
			acc[rule.type] = (acc[rule.type] ?? 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);

	const parts: string[] = [];
	for (const [type, count] of Object.entries(counts)) {
		parts.push(`${count} ${getRuleTypeLabel(type, count)}`);
	}

	if (group.memberCount !== undefined && group.memberCount > 0) {
		parts.push(
			`${group.memberCount} member${group.memberCount === 1 ? "" : "s"}`
		);
	}

	return parts.join(" · ");
}

function GroupActions({
	group,
	onEdit,
	onDelete,
}: {
	group: TargetGroup;
	onEdit: (group: TargetGroup) => void;
	onDelete: (groupId: string) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					aria-label="Group actions"
					className="size-8 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
					size="icon"
					variant="ghost"
				>
					<DotsThreeIcon className="size-5" weight="bold" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-40">
				<DropdownMenuItem className="gap-2" onClick={() => onEdit(group)}>
					<PencilSimpleIcon className="size-4" weight="duotone" />
					Edit
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="gap-2 text-destructive focus:text-destructive"
					onClick={() => onDelete(group.id)}
					variant="destructive"
				>
					<TrashIcon className="size-4" weight="duotone" />
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function RuleIndicators({ group }: { group: TargetGroup }) {
	const rules = group.rules ?? [];
	if (rules.length === 0) {
		return null;
	}

	const counts = rules.reduce(
		(acc, rule) => {
			acc[rule.type] = (acc[rule.type] ?? 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);

	return (
		<div className="flex shrink-0 items-center gap-1">
			{Object.entries(counts).map(([type, count]) => {
				const RuleIcon = getRuleIcon(type);
				return (
					<span
						className="flex items-center gap-0.5 rounded bg-muted px-1 py-px font-mono text-[11px] text-muted-foreground leading-tight"
						key={type}
					>
						<RuleIcon
							className="size-3"
							style={{ color: group.color }}
							weight="duotone"
						/>
						{count} {getRuleTypeLabel(type, count)}
					</span>
				);
			})}
		</div>
	);
}

export function GroupItem({
	group,
	onEdit,
	onDelete,
	isSelected,
	onSelect,
}: GroupItemProps) {
	const summary = buildRuleSummary(group);

	return (
		<button
			className={cn(
				"group flex h-15 w-full items-center gap-3 border-b px-4 text-left transition-colors hover:bg-accent/50",
				isSelected && "bg-accent/30"
			)}
			onClick={() => {
				if (onSelect) {
					onSelect();
				} else {
					onEdit(group);
				}
			}}
			type="button"
		>
			{/* Group icon */}
			<div
				className="shrink-0 rounded p-1.5"
				style={{ backgroundColor: `${group.color}20` }}
			>
				<UsersThreeIcon
					className="size-4"
					style={{ color: group.color }}
					weight="duotone"
				/>
			</div>

			{/* Name + indicators + description */}
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<span className="max-w-48 truncate font-medium text-sm">
					{group.name}
				</span>
				<RuleIndicators group={group} />
				<span className="truncate text-muted-foreground text-xs">
					{group.description ?? summary}
				</span>
			</div>

			{/* Actions — always at the end */}
			<div
				className="shrink-0"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="presentation"
			>
				<GroupActions group={group} onDelete={onDelete} onEdit={onEdit} />
			</div>
		</button>
	);
}
