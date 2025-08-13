'use client';

import { FlaskIcon, TrashIcon, WarningIcon } from '@phosphor-icons/react';
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

interface DeleteExperimentDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	experimentName?: string;
	isDeleting?: boolean;
}

export function DeleteExperimentDialog({
	isOpen,
	onClose,
	onConfirm,
	experimentName,
	isDeleting = false,
}: DeleteExperimentDialogProps) {
	return (
		<AlertDialog onOpenChange={onClose} open={isOpen}>
			<AlertDialogContent className="rounded-xl border-border/50">
				<AlertDialogHeader className="space-y-4">
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
								Delete Experiment
							</AlertDialogTitle>
							<AlertDialogDescription className="mt-1 text-muted-foreground">
								This action cannot be undone
							</AlertDialogDescription>
						</div>
					</div>

					<div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950">
						<div className="flex items-start gap-3">
							<WarningIcon
								className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600"
								size={16}
								weight="duotone"
							/>
							<div className="space-y-2">
								<p className="font-medium text-orange-600 text-sm">
									Warning: This will permanently delete the experiment
								</p>
								<div className="space-y-1 text-orange-600/80 text-xs">
									<p>• All experiment data and variants will be lost</p>
									<p>• Analytics and performance metrics will be removed</p>
									<p>• This action cannot be reversed</p>
								</div>
							</div>
						</div>
					</div>

					{experimentName && (
						<div className="rounded-lg border bg-muted/30 p-4">
							<div className="flex items-center gap-3">
								<FlaskIcon
									className="h-5 w-5 text-muted-foreground"
									size={16}
									weight="duotone"
								/>
								<div>
									<p className="font-medium text-foreground text-sm">
										Experiment to delete:
									</p>
									<p className="mt-1 text-muted-foreground text-xs">
										{experimentName}
									</p>
								</div>
							</div>
						</div>
					)}
				</AlertDialogHeader>

				<AlertDialogFooter className="gap-3">
					<AlertDialogCancel
						className="rounded-lg transition-all duration-200 hover:bg-muted"
						disabled={isDeleting}
					>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						className="relative rounded-lg bg-destructive transition-all duration-200 hover:bg-destructive/90"
						disabled={isDeleting}
						onClick={onConfirm}
					>
						{isDeleting && (
							<div className="absolute left-3">
								<div className="h-4 w-4 animate-spin rounded-full border-2 border-destructive-foreground/30 border-t-destructive-foreground" />
							</div>
						)}
						<span className={isDeleting ? 'ml-6' : ''}>
							{isDeleting ? 'Deleting...' : 'Delete Experiment'}
						</span>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
