'use client';

import { Trash } from '@phosphor-icons/react';
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

interface DeleteGoalDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
}

export function DeleteGoalDialog({
	isOpen,
	onClose,
	onConfirm,
}: DeleteGoalDialogProps) {
	return (
		<AlertDialog onOpenChange={onClose} open={isOpen}>
			<AlertDialogContent className="rounded-xl">
				<AlertDialogHeader>
					<div className="mb-2 flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/20">
							<Trash
								className="text-red-600 dark:text-red-400"
								size={20}
								weight="duotone"
							/>
						</div>
						<AlertDialogTitle className="text-lg">Delete Goal</AlertDialogTitle>
					</div>
					<AlertDialogDescription className="text-left">
						Are you sure you want to delete this goal? This action cannot be
						undone and will permanently remove all associated analytics data.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
						onClick={onConfirm}
					>
						Delete Goal
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
