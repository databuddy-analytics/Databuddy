"use client";

import {
	ArrowCounterClockwiseIcon,
	DotsThreeIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import type { Flag } from "../../_components/types";

interface ArchivedFlagItemProps {
	flag: Flag;
	onEdit: (flag: Flag) => void;
	onDelete: (flagId: string) => void;
	className?: string;
}

export function ArchivedFlagItem({
	flag,
	onEdit,
	onDelete,
	className,
}: ArchivedFlagItemProps) {
	const queryClient = useQueryClient();

	const restoreMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({
					input: { websiteId: flag.websiteId ?? "" },
				}),
			});
		},
	});

	const handleRestore = () => {
		restoreMutation.mutate({
			id: flag.id,
			status: "inactive",
		});
	};

	return (
		<div className={cn("border-border border-b", className)}>
			<div className="group flex items-center hover:bg-accent/50">
				{/* Clickable area for editing */}
				<button
					className="flex flex-1 cursor-pointer items-center gap-4 px-4 py-3 text-left sm:px-6 sm:py-4"
					onClick={() => onEdit(flag)}
					type="button"
				>
					{/* Flag details */}
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<h3 className="truncate font-medium text-foreground">
								{flag.name || flag.key}
							</h3>
							<Badge className="shrink-0" variant="gray">
								{flag.type}
							</Badge>
							<Badge className="gap-1.5" variant="amber">
								<span className="size-1.5 rounded bg-amber-500" />
								Archived
							</Badge>
						</div>
						<p className="mt-0.5 truncate font-mono text-muted-foreground text-sm">
							{flag.key}
						</p>
						{flag.description && (
							<p className="mt-0.5 line-clamp-1 text-muted-foreground text-xs">
								{flag.description}
							</p>
						)}
					</div>
				</button>

				{/* Restore button */}
				<div className="shrink-0 pr-2">
					<Button
						disabled={restoreMutation.isPending}
						onClick={handleRestore}
						size="sm"
						variant="outline"
					>
						<ArrowCounterClockwiseIcon className="size-4" weight="duotone" />
						<span className="hidden sm:inline">Restore</span>
					</Button>
				</div>

				{/* Actions dropdown */}
				<div className="shrink-0 pr-4 sm:pr-6">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								aria-label="Archived flag actions"
								className="size-8 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
								size="icon"
								variant="ghost"
							>
								<DotsThreeIcon className="size-5" weight="bold" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-40">
							<DropdownMenuItem onClick={() => onEdit(flag)}>
								<PencilSimpleIcon className="size-4" weight="duotone" />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem onClick={handleRestore}>
								<ArrowCounterClockwiseIcon
									className="size-4"
									weight="duotone"
								/>
								Restore
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={() => onDelete(flag.id)}
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
