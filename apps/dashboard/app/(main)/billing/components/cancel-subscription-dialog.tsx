"use client";

import {
	CalendarIcon,
	CircleNotchIcon,
	LightningIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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

type CancelOption = "end_of_period" | "immediate" | null;

export function CancelSubscriptionDialog({
	open,
	onOpenChange,
	onCancel,
	planName,
	currentPeriodEnd,
	isLoading,
}: CancelSubscriptionDialogProps) {
	const [selected, setSelected] = useState<CancelOption>(null);
	const [confirming, setConfirming] = useState(false);

	const periodEndDate = currentPeriodEnd
		? dayjs(currentPeriodEnd).format("MMMM D, YYYY")
		: null;

	const handleConfirm = async () => {
		if (!selected) return;
		setConfirming(true);
		await onCancel(selected === "immediate");
		setConfirming(false);
		onOpenChange(false);
		setSelected(null);
	};

	const handleClose = () => {
		onOpenChange(false);
		setSelected(null);
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent className="w-[95vw] max-w-md sm:w-full">
				<DialogHeader>
					<DialogTitle>Cancel {planName}</DialogTitle>
					<DialogDescription>
						Choose when you'd like to cancel your subscription
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-2">
					{/* End of period option */}
					<button
						className={`w-full rounded border p-4 text-left transition-all ${
							selected === "end_of_period"
								? "border-primary bg-primary/5 ring-1 ring-primary"
								: "hover:bg-accent/50"
						} disabled:cursor-not-allowed disabled:opacity-50`}
						disabled={isLoading || confirming}
						onClick={() => setSelected("end_of_period")}
						type="button"
					>
						<div className="flex items-start gap-3">
							<div className="flex size-10 shrink-0 items-center justify-center rounded border bg-accent">
								<CalendarIcon
									className="text-accent-foreground"
									size={20}
									weight="duotone"
								/>
							</div>
							<div className="flex-1">
								<div className="flex items-center gap-2">
									<span className="font-medium">Cancel at period end</span>
									<Badge variant="secondary">Recommended</Badge>
								</div>
								<p className="mt-1 text-muted-foreground text-sm">
									{periodEndDate
										? `Keep access until ${periodEndDate}`
										: "Keep access until your billing period ends"}
								</p>
							</div>
						</div>
					</button>

					{/* Immediate option */}
					<button
						className={`w-full rounded border p-4 text-left transition-all ${
							selected === "immediate"
								? "border-destructive bg-destructive/5 ring-1 ring-destructive"
								: "hover:bg-accent/50"
						} disabled:cursor-not-allowed disabled:opacity-50`}
						disabled={isLoading || confirming}
						onClick={() => setSelected("immediate")}
						type="button"
					>
						<div className="flex items-start gap-3">
							<div className="flex size-10 shrink-0 items-center justify-center rounded border border-destructive/20 bg-destructive/10">
								<LightningIcon
									className="text-destructive"
									size={20}
									weight="duotone"
								/>
							</div>
							<div className="flex-1">
								<span className="font-medium">Cancel immediately</span>
								<p className="mt-1 text-muted-foreground text-sm">
									Lose access now. Any pending usage will be invoiced.
								</p>
							</div>
						</div>
					</button>
				</div>

				{/* Warning for immediate cancellation */}
				{selected === "immediate" && (
					<div className="flex items-start gap-2 rounded border border-destructive/20 bg-destructive/5 p-3 text-sm">
						<WarningCircleIcon
							className="mt-0.5 shrink-0 text-destructive"
							size={16}
							weight="fill"
						/>
						<span className="text-destructive">
							This action cannot be undone. You will lose access to all{" "}
							{planName} features immediately.
						</span>
					</div>
				)}

				<DialogFooter className="flex-col gap-2 sm:flex-row">
					<Button
						className="w-full sm:w-auto"
						disabled={isLoading || confirming}
						onClick={handleClose}
						variant="outline"
					>
						Keep subscription
					</Button>
					<Button
						className="w-full sm:w-auto"
						disabled={!selected || isLoading || confirming}
						onClick={handleConfirm}
						variant={selected === "immediate" ? "destructive" : "default"}
					>
						{confirming && (
							<CircleNotchIcon className="mr-2 size-4 animate-spin" />
						)}
						{selected === "immediate" ? "Cancel now" : "Confirm cancellation"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
