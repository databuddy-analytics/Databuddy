"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface DeleteDialogProps {
	cancelLabel?: string;
	children?: React.ReactNode;
	confirmDisabled?: boolean;
	confirmLabel?: string;
	description?: string;
	isDeleting?: boolean;
	isOpen: boolean;
	itemName?: string;
	onClose: () => void;
	onConfirm: () => void;
	title?: string;
}

export function DeleteDialog({
	isOpen,
	onClose,
	onConfirm,
	title = "Delete",
	description,
	itemName,
	confirmLabel = "Delete",
	cancelLabel = "Cancel",
	isDeleting = false,
	confirmDisabled = false,
	children,
}: DeleteDialogProps) {
	const wasDeletingRef = useRef(false);

	useEffect(() => {
		if (wasDeletingRef.current && !isDeleting) {
			onClose();
		}
		wasDeletingRef.current = isDeleting;
	}, [isDeleting, onClose]);

	const defaultDescription = itemName
		? `Are you sure you want to delete ${itemName}? This action cannot be undone and will permanently remove it.`
		: "Are you sure you want to delete this item? This action cannot be undone and will permanently remove it.";

	const handleConfirm = () => {
		onConfirm();
	};

	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{description || defaultDescription}
					</DialogDescription>
				</DialogHeader>
				{children ? (
					<>
						{children}
						<div className="flex items-center gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-3">
							<div className="flex size-8 shrink-0 items-center justify-center">
								<TrashIcon
									className="text-destructive"
									size={16}
									weight="duotone"
								/>
							</div>
							<p className="text-foreground text-sm">
								This action cannot be undone.
							</p>
						</div>
					</>
				) : (
					<div className="flex items-center gap-3 py-2">
						<div className="flex size-10 shrink-0 items-center justify-center border border-destructive/20 bg-destructive/10">
							<TrashIcon
								className="text-destructive"
								size={18}
								weight="duotone"
							/>
						</div>
						<p className="text-foreground text-sm">
							This action cannot be undone.
						</p>
					</div>
				)}
				<DialogFooter>
					<Button disabled={isDeleting} onClick={onClose} variant="outline">
						{cancelLabel}
					</Button>
					<Button
						disabled={isDeleting || confirmDisabled}
						onClick={handleConfirm}
						variant="destructive"
					>
						{isDeleting ? "Deleting..." : confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
