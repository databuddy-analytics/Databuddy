"use client";

import { CalendarIcon, LightningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface CancelSubscriptionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCancel: (immediate: boolean) => void;
	planName: string;
	currentPeriodEnd?: number;
	isLoading: boolean;
}

export function CancelSubscriptionDialog({
	open,
	onOpenChange,
	onCancel,
	planName,
	currentPeriodEnd,
	isLoading,
}: CancelSubscriptionDialogProps) {
	const periodEndDate = currentPeriodEnd
		? new Date(currentPeriodEnd).toLocaleDateString()
		: null;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader className="space-y-3">
					<DialogTitle className="text-xl">Cancel {planName}</DialogTitle>
					<DialogDescription>
						Choose how you'd like to cancel your subscription
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 py-4">
					<button
						className="w-full cursor-pointer rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:opacity-50"
						disabled={isLoading}
						onClick={() => {
							onCancel(false);
							onOpenChange(false);
						}}
						type="button"
					>
						<div className="mb-2 flex items-center gap-3">
							<div className="flex size-8 items-center justify-center rounded-full bg-blue-100">
								<CalendarIcon className="text-foreground" size={16} />
							</div>
							<div>
								<div className="font-medium">Cancel at period end</div>
								<div className="text-muted-foreground text-sm">Recommended</div>
							</div>
						</div>
						<p className="ml-11 text-muted-foreground text-sm">
							{periodEndDate
								? `Keep access until ${periodEndDate}. No additional charges.`
								: "Keep access until your current billing period ends. No additional charges."}
						</p>
					</button>

					<button
						className="w-full cursor-pointer rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:opacity-50"
						disabled={isLoading}
						onClick={() => {
							onCancel(true);
							onOpenChange(false);
						}}
						type="button"
					>
						<div className="mb-2 flex items-center gap-3">
							<div className="flex size-8 items-center justify-center rounded-full bg-orange-100">
								<LightningIcon className="text-orange-600" size={16} />
							</div>
							<div>
								<div className="font-medium">Cancel immediately</div>
								<div className="text-muted-foreground text-sm">
									Lose access now
								</div>
							</div>
						</div>
						<p className="ml-11 text-muted-foreground text-sm">
							Access ends immediately. You'll be invoiced for any pending usage
							charges.
						</p>
					</button>
				</div>

				<DialogFooter>
					<Button
						className="cursor-pointer"
						disabled={isLoading}
						onClick={() => onOpenChange(false)}
						variant="outline"
					>
						Keep subscription
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
