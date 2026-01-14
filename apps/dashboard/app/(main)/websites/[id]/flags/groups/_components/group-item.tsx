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
import { Badge } from "@/components/ui/badge";
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

function getRuleTypeLabel(type: string) {
	switch (type) {
		case "email":
			return "emails";
		case "user_id":
			return "users";
		case "property":
			return "properties";
		default:
			return "rules";
	}
}

export function GroupItem({
	group,
	onEdit,
	onDelete,
	isSelected,
	onSelect,
}: GroupItemProps) {
	const ruleCount = group.rules?.length ?? 0;

	const ruleSummary = group.rules?.reduce(
		(acc, rule) => {
			acc[rule.type] = (acc[rule.type] ?? 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);

	return (
		<div className={cn("border-border border-b", isSelected && "bg-accent/30")}>
			<div className="group flex items-center hover:bg-accent/50">
				{/* Clickable area for editing */}
				<button
					className="flex flex-1 cursor-pointer items-center gap-4 px-4 py-3 text-left sm:px-6 sm:py-4"
					onClick={() => {
						if (onSelect) {
							onSelect();
						} else {
							onEdit(group);
						}
					}}
					type="button"
				>
					{/* Group details */}
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<div
								className="flex size-8 shrink-0 items-center justify-center rounded"
								style={{ backgroundColor: `${group.color}20` }}
							>
								<UsersThreeIcon
									className="size-4"
									style={{ color: group.color }}
									weight="duotone"
								/>
							</div>
							<h3 className="truncate font-medium text-foreground">
								{group.name}
							</h3>
							{ruleCount > 0 && (
								<Badge className="shrink-0" variant="gray">
									{ruleCount} rule{ruleCount !== 1 ? "s" : ""}
								</Badge>
							)}
						</div>
						{group.description && (
							<p className="mt-0.5 line-clamp-1 text-muted-foreground text-sm">
								{group.description}
							</p>
						)}
						{/* Rule stats */}
						<div className="mt-0.5 flex flex-wrap items-center gap-1.5">
							{ruleCount > 0 &&
								Object.entries(ruleSummary ?? {}).map(([type, count]) => {
									const RuleIcon = getRuleIcon(type);
									return (
										<Badge
											className="gap-1 border text-xs"
											key={type}
											style={{
												borderColor: `${group.color}40`,
												backgroundColor: `${group.color}10`,
											}}
											variant="outline"
										>
											<RuleIcon
												className="size-3"
												style={{ color: group.color }}
												weight="duotone"
											/>
											<span className="tabular-nums">{count}</span>
											<span className="text-muted-foreground">
												{getRuleTypeLabel(type)}
											</span>
										</Badge>
									);
								})}
							{group.memberCount !== undefined && group.memberCount > 0 && (
								<span className="text-muted-foreground text-xs">
									<span className="tabular-nums">{group.memberCount}</span>{" "}
									member{group.memberCount !== 1 ? "s" : ""}
								</span>
							)}
						</div>
					</div>
				</button>

				{/* Actions dropdown - separate from clickable area */}
				<div className="shrink-0 pr-4 sm:pr-6">
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
							<DropdownMenuItem onClick={() => onEdit(group)}>
								<PencilSimpleIcon className="size-4" weight="duotone" />
								Edit
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={() => onDelete(group.id)}
							>
								<TrashIcon className="size-4" weight="duotone" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</div>
	);
}
