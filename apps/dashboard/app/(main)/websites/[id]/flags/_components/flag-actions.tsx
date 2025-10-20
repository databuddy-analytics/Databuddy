'use client';

import {
	CopyIcon,
	DotsThreeIcon,
	PencilIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc';
import type { Flag } from './types';

interface FlagActionsProps {
	flag: Flag;
	onEdit: () => void;
	onDeleted?: () => void;
}

export function FlagActions({ flag, onEdit, onDeleted }: FlagActionsProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const utils = trpc.useUtils();
	const deleteMutation = trpc.flags.delete.useMutation();

	const handleCopyKey = async () => {
		await navigator.clipboard.writeText(flag.key);
		toast.success('Flag key copied to clipboard');
	};

	const handleConfirmDelete = async () => {
		setIsDeleting(true);
		// optimistic removal
		utils.flags.list.setData({ websiteId: flag.websiteId ?? '' }, (oldData) =>
			oldData?.filter((f) => f.id !== flag.id)
		);
		try {
			await deleteMutation.mutateAsync({ id: flag.id });
			toast.success('Flag deleted');
			onDeleted?.();
		} catch (_error) {
			utils.flags.list.invalidate();
			toast.error('Failed to delete flag');
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
						className="focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
						size="icon"
						type="button"
						variant="ghost"
					>
						<DotsThreeIcon className="h-5 w-5" weight="bold" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-40">
					<DropdownMenuItem onClick={onEdit}>
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
