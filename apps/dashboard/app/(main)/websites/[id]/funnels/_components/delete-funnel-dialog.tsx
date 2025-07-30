'use client';

import { TrashIcon } from '@phosphor-icons/react';
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

interface DeleteFunnelDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
}

export function DeleteFunnelDialog({
	isOpen,
	onClose,
	onConfirm,
}: DeleteFunnelDialogProps) {
	return (
		<AlertDialog onOpenChange={onClose} open={isOpen}>
			<AlertDialogContent className="rounded-xl border-border/50">
				<AlertDialogHeader className="space-y-3">
					<div className="flex items-center gap-3">
						<div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3">
							<TrashIcon
								className="h-6 w-6 text-destructive"
								size={16}
								weight="duotone"
							/>
						</div>
						<div>
							<AlertDialogTitle className="font-semibold text-foreground text-xl">
								Delete Funnel
							</AlertDialogTitle>
							<AlertDialogDescription className="mt-1 text-muted-foreground">
								Are you sure you want to delete this funnel? This action cannot
								be undone and will permanently remove it
							</AlertDialogDescription>
						</div>
					</div>
				</AlertDialogHeader>
				<AlertDialogFooter className="gap-3 border-border/50 border-t pt-6">
					<AlertDialogCancel className="cursor-pointer rounded-lg border-border/50 px-6 py-2 font-medium hover:border-border hover:bg-muted/50">
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						className="cursor-pointer rounded-lg bg-destructive px-6 py-2 font-medium text-destructive-foreground shadow-lg hover:bg-destructive/90 hover:shadow-xl"
						onClick={onConfirm}
					>
						Delete Funnel
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
