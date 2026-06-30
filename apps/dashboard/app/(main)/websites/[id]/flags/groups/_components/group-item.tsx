"use client";

import { cn } from "@/lib/utils";
import type { TargetGroup } from "../../_components/types";
import {
	DotsThreeIcon,
	EnvelopeIcon,
	PencilSimpleIcon,
	TrashIcon,
	UserIcon,
	UsersThreeIcon,
	WrenchIcon,
} from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";
import { DropdownMenu } from "@databuddy/ui/client";

export interface GroupItemProps {
	group: TargetGroup;
	isSelected?: boolean;
	onDelete: (groupId: string) => void;
	onEdit: (group: TargetGroup) => void;
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
			<DropdownMenu.Trigger
				aria-label="Group actions"
				className={cn(
					"inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-(--duration-quick) ease-(--ease-smooth) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50",
					"bg-transparent text-muted-foreground hover:bg-interactive-hover hover:text-foreground",
					"size-8 p-0",
					"opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
				)}
			>
				<DotsThreeIcon className="size-5" weight="bold" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" className="w-40">
				<DropdownMenu.Item className="gap-2" onClick={() => onEdit(group)}>
					<PencilSimpleIcon className="size-4" weight="duotone" />
					Edit
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item
					className="gap-2 text-destructive focus:text-destructive"
					onClick={() => onDelete(group.id)}
					variant="destructive"
				>
					<TrashIcon className="size-4" weight="duotone" />
					Delete
				</DropdownMenu.Item>
			</DropdownMenu.Content>
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

	const handleActivate = () => {
		if (onSelect) {
			onSelect();
		} else {
			onEdit(group);
		}
	};

	return (
		<div
			className={cn(
				"group flex h-15 w-full items-center gap-3 border-b px-4 transition-colors hover:bg-accent/50",
				isSelected && "bg-accent/30"
			)}
		>
			<Button
				className="h-full min-w-0 flex-1 justify-start gap-3 rounded-none bg-transparent p-0 text-left font-normal text-foreground hover:bg-transparent active:scale-100"
				onClick={handleActivate}
				variant="ghost"
			>
				<span
					className="shrink-0 rounded p-1.5"
					style={{ backgroundColor: `${group.color}20` }}
				>
					<UsersThreeIcon
						className="size-4"
						style={{ color: group.color }}
						weight="duotone"
					/>
				</span>

				<span className="flex min-w-0 flex-1 items-center gap-2">
					<span className="max-w-48 truncate font-medium text-sm">
						{group.name}
					</span>
					<RuleIndicators group={group} />
					<span className="truncate text-muted-foreground text-xs">
						{group.description ?? summary}
					</span>
				</span>
			</Button>

			<GroupActions group={group} onDelete={onDelete} onEdit={onEdit} />
		</div>
	);
}
