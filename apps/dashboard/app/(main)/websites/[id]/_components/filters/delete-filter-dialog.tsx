"use client";

import { TrashIcon, WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface DeleteFilterDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	filterName: string;
	isDeleting?: boolean;
}

export function DeleteFilterDialog({
	isOpen,
	onClose,
	onConfirm,
	filterName,
	isDeleting = false,
}: DeleteFilterDialogProps) {
	const handleConfirm = () => {
		onConfirm();
		onClose();
	};

	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent className="max-w-md">
				<DialogHeader className="space-y-3">
					<DialogTitle className="flex items-center gap-3 text-destructive">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10">
							<WarningIcon
								className="h-4 w-4 text-destructive"
								weight="duotone"
							/>
						</div>
						<span className="font-semibold">Delete Saved Filter</span>
					</DialogTitle>
					<DialogDescription className="text-muted-foreground">
						Are you sure you want to delete{" "}
						<span className="font-medium text-foreground">"{filterName}"</span>?
						This action cannot be undone and the filter configuration will be
						permanently removed.
					</DialogDescription>
				</DialogHeader>

				<div className="flex justify-end gap-3 pt-6">
					<Button
						className="h-10"
						disabled={isDeleting}
						onClick={onClose}
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						className="h-10 gap-2"
						disabled={isDeleting}
						onClick={handleConfirm}
						variant="destructive"
					>
						{isDeleting ? (
							"Deleting..."
						) : (
							<>
								<TrashIcon className="h-4 w-4" />
								<span>Delete</span>
							</>
						)}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
