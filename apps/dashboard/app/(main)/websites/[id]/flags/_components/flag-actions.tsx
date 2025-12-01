"use client";

import {
	CopyIcon,
	DotsThreeIcon,
	PencilIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/lib/orpc";
import type { Flag } from "./types";

type FlagActionsProps = {
	flag: Flag;
	onEditAction: () => void;
	onDeletedAction?: () => void;
};

export function FlagActions({
	flag,
	onEditAction,
	onDeletedAction = () => {},
}: FlagActionsProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const queryClient = useQueryClient();
	const deleteMutation = useMutation({
		...orpc.flags.delete.mutationOptions(),
	});

	const handleCopyKey = async () => {
		await navigator.clipboard.writeText(flag.key);
		toast.success("Flag key copied to clipboard");
	};

	const handleConfirmDelete = async () => {
		setIsDeleting(true);
		const queryKey = orpc.flags.list.queryKey({
			input: { websiteId: flag.websiteId ?? "" },
		});
		queryClient.setQueryData(queryKey, (oldData: any) =>
			oldData?.filter((f: any) => f.id !== flag.id)
		);
		try {
			await deleteMutation.mutateAsync({ id: flag.id });
			toast.success("Flag deleted");
			onDeletedAction?.();
		} catch (_error) {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({
					input: { websiteId: flag.websiteId ?? "" },
				}),
			});
			toast.error("Failed to delete flag");
		} finally {
			setIsDeleting(false);
			setIsOpen(false);
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						aria-label="Open flag actions"
						className="h-5.5 focus-visible:ring-(--color-primary) focus-visible:ring-2"
						type="button"
						variant="ghost"
					>
						<DotsThreeIcon className="size-5" weight="bold" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-40">
					<DropdownMenuItem onClick={onEditAction}>
						<PencilIcon className="h-4 w-4" weight="duotone" /> Edit
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleCopyKey}>
						<CopyIcon className="h-4 w-4" weight="duotone" /> Copy key
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => setIsOpen(true)}
						variant="destructive"
					>
						<TrashIcon className="h-4 w-4" weight="duotone" /> Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog onOpenChange={setIsOpen} open={isOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete flag?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. This will permanently delete the
							flag "{flag.key}".
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={isDeleting}
							onClick={handleConfirmDelete}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
