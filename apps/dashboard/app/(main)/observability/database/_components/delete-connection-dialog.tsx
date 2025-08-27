'use client';

import { TrashIcon, WarningIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

interface DeleteConnectionDialogProps {
	connection: { id: string; name: string } | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isLoading: boolean;
}

export function DeleteConnectionDialog({
	connection,
	onOpenChange,
	onConfirm,
	isLoading,
}: DeleteConnectionDialogProps) {
	return (
		<Dialog onOpenChange={onOpenChange} open={!!connection}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<div className="flex items-center gap-3">
						<div className="rounded-full bg-destructive/10 p-2">
							<WarningIcon
								className="h-5 w-5 text-destructive"
								weight="duotone"
							/>
						</div>
						<div>
							<DialogTitle>Delete Connection</DialogTitle>
							<DialogDescription>
								This action cannot be undone.
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="py-4">
					<p className="text-muted-foreground text-sm">
						Are you sure you want to delete the connection{' '}
						<span className="font-medium text-foreground">
							{connection?.name}
						</span>
						? This will permanently remove the connection and all associated
						monitoring data.
					</p>
				</div>

				<DialogFooter>
					<Button
						disabled={isLoading}
						onClick={() => onOpenChange(false)}
						type="button"
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={isLoading}
						onClick={onConfirm}
						type="button"
						variant="destructive"
					>
						{isLoading ? (
							'Deleting...'
						) : (
							<>
								<TrashIcon className="h-4 w-4" />
								Delete Connection
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
