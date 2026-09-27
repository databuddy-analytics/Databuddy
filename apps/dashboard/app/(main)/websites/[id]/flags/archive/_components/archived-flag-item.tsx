"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import type { Flag } from "../../_components/types";
import {
	ArrowCounterClockwiseIcon,
	DotsThreeIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { Badge, Button } from "@databuddy/ui";
import { DropdownMenu } from "@databuddy/ui/client";

interface ArchivedFlagItemProps {
	className?: string;
	flag: Flag;
	onDelete: (flagId: string) => void;
	onEdit: (flag: Flag) => void;
	websiteId: string;
}

export function ArchivedFlagItem({
	flag,
	onEdit,
	onDelete,
	className,
	websiteId,
}: ArchivedFlagItemProps) {
	const queryClient = useQueryClient();

	const restoreMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({
					input: { websiteId },
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
			<div className="group flex h-15 items-center hover:bg-accent/50">
				<button
					className="flex flex-1 cursor-pointer items-center gap-4 px-4 text-left sm:px-6"
					onClick={() => onEdit(flag)}
					type="button"
				>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<h3 className="truncate font-medium text-foreground">
								{flag.name || flag.key}
							</h3>
							<Badge className="shrink-0" variant="muted">
								{flag.type}
							</Badge>
							<Badge className="gap-1.5" variant="warning">
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

				<div className="shrink-0 pr-2">
					<Button
						disabled={restoreMutation.isPending}
						onClick={handleRestore}
						size="sm"
						variant="secondary"
					>
						<ArrowCounterClockwiseIcon className="size-4" />
						<span className="hidden sm:inline">Restore</span>
					</Button>
				</div>

				<div className="shrink-0 pr-4 sm:pr-6">
					<DropdownMenu>
						<DropdownMenu.Trigger
							aria-label="Archived flag actions"
							className={cn(
								"inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-(--duration-quick) ease-(--ease-smooth) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50",
								"bg-transparent text-muted-foreground hover:bg-interactive-hover hover:text-foreground",
								"size-8 p-0",
								"opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
							)}
						>
							<DotsThreeIcon className="size-5" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" className="w-40">
							<DropdownMenu.Item onClick={() => onEdit(flag)}>
								<PencilSimpleIcon className="size-4" />
								Edit
							</DropdownMenu.Item>
							<DropdownMenu.Item onClick={handleRestore}>
								<ArrowCounterClockwiseIcon className="size-4" />
								Restore
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								className="text-destructive focus:text-destructive"
								onClick={() => onDelete(flag.id)}
							>
								<TrashIcon className="size-4" />
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu>
				</div>
			</div>
		</div>
	);
}
