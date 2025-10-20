'use client';

import type { Website } from '@databuddy/shared';
import { WarningCircleIcon } from '@phosphor-icons/react';
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

interface DeleteWebsiteDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	websiteData: Website;
	isDeleting: boolean;
	onConfirmDelete: () => void;
}

export function DeleteWebsiteDialog({
	open,
	onOpenChange,
	websiteData,
	isDeleting,
	onConfirmDelete,
}: DeleteWebsiteDialogProps) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Website</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-4">
							<p className="text-muted-foreground text-sm">
								Are you sure you want to delete{' '}
								<span className="font-medium">
									{websiteData.name || websiteData.domain}
								</span>
								? This action cannot be undone.
							</p>

							<div className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
								<div className="flex items-start gap-2">
									<WarningCircleIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
									<div className="space-y-1">
										<p className="font-medium">Warning:</p>
										<ul className="list-disc space-y-1 pl-4 text-xs">
											<li>All analytics data will be permanently deleted</li>
											<li>Tracking will stop immediately</li>
											<li>All website settings will be lost</li>
										</ul>
									</div>
								</div>
							</div>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						disabled={isDeleting}
						onClick={onConfirmDelete}
					>
						{isDeleting ? 'Deleting...' : 'Delete Website'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
