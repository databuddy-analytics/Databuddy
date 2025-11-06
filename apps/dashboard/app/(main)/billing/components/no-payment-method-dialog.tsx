"use client";

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

interface NoPaymentMethodDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function NoPaymentMethodDialog({
	open,
	onOpenChange,
	onConfirm,
}: NoPaymentMethodDialogProps) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>No Payment Method</AlertDialogTitle>
					<AlertDialogDescription>
						You need to add a payment method before you can upgrade your plan.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel className="cursor-pointer">
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Button
							className="cursor-pointer"
							onClick={() => {
								onConfirm();
							}}
						>
							Add Payment Method
						</Button>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
