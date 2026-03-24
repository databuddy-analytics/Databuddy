"use client";

import {
	ArrowLeftIcon,
	CalendarIcon,
	CircleNotchIcon,
	CurrencyDollarIcon,
	GearIcon,
	LightningIcon,
	QuestionIcon,
	SmileyIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
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
import { Textarea } from "@/components/ui/textarea";
import dayjs from "@/lib/dayjs";

interface CancelSubscriptionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCancel: (immediate: boolean, feedback?: CancelFeedback) => void;
	planName: string;
	currentPeriodEnd?: number;
	isLoading: boolean;
}

type CancelOption = "end_of_period" | "immediate" | null;
type CancelStep = "feedback" | "timing";

type CancelReasonId =
	| "too_expensive"
	| "missing_features"
	| "not_using"
	| "switching"
	| "technical_issues"
	| "other";

interface CancelReason {
	id: CancelReasonId;
	label: string;
	icon: React.ElementType;
}

export interface CancelFeedback {
	reason: CancelReasonId;
	details?: string;
}

const CANCEL_REASONS: CancelReason[] = [
	{ id: "too_expensive", label: "Too expensive", icon: CurrencyDollarIcon },
	{ id: "missing_features", label: "Missing features I need", icon: GearIcon },
	{ id: "not_using", label: "Not using it enough", icon: SmileyIcon },
	{ id: "switching", label: "Switching to another tool", icon: LightningIcon },
	{
		id: "technical_issues",
		label: "Technical issues",
		icon: WarningCircleIcon,
	},
	{ id: "other", label: "Other reason", icon: QuestionIcon },
];

export function CancelSubscriptionDialog({
	open,
	onOpenChange,
	onCancel,
	planName,
	currentPeriodEnd,
	isLoading,
}: CancelSubscriptionDialogProps) {
	const [step, setStep] = useState<CancelStep>("feedback");
	const [selectedReason, setSelectedReason] = useState<CancelReasonId | null>(
		null
	);
	const [feedbackDetails, setFeedbackDetails] = useState("");
	const [selected, setSelected] = useState<CancelOption>(null);
	const [confirming, setConfirming] = useState(false);

	const periodEndDate = currentPeriodEnd
		? dayjs(currentPeriodEnd).format("MMMM D, YYYY")
		: null;

	const handleConfirm = async () => {
		if (!(selected && selectedReason)) {
			return;
		}
		setConfirming(true);
		const feedback: CancelFeedback = {
			reason: selectedReason,
			details: feedbackDetails.trim() || undefined,
		};
		await onCancel(selected === "immediate", feedback);
		setConfirming(false);
		resetAndClose();
	};

	const resetAndClose = () => {
		onOpenChange(false);
		setStep("feedback");
		setSelectedReason(null);
		setFeedbackDetails("");
		setSelected(null);
	};

	const handleContinueToTiming = () => {
		if (selectedReason) {
			setStep("timing");
		}
	};

	const handleBackToFeedback = () => {
		setStep("feedback");
		setSelected(null);
	};

	return (
		<Dialog onOpenChange={resetAndClose} open={open}>
			<DialogContent className="w-[95vw] max-w-md sm:w-full">
				{step === "feedback" ? (
					<>
						<DialogHeader>
							<DialogTitle>Before you go...</DialogTitle>
							<DialogDescription>
								We'd love to know why you're cancelling so we can improve
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-2">
							{CANCEL_REASONS.map((reason) => {
								const IconComponent = reason.icon;
								return (
									<button
										className={`w-full rounded border p-3 text-left transition-all ${
											selectedReason === reason.id
												? "border-primary bg-primary/5 ring-1 ring-primary"
												: "hover:bg-accent/50"
										}`}
										key={reason.id}
										onClick={() => setSelectedReason(reason.id)}
										type="button"
									>
										<div className="flex items-center gap-3">
											<div className="flex size-8 shrink-0 items-center justify-center rounded border bg-accent">
												<IconComponent
													className="text-accent-foreground"
													size={16}
													weight="duotone"
												/>
											</div>
											<span className="font-medium text-sm">
												{reason.label}
											</span>
										</div>
									</button>
								);
							})}
						</div>

						{selectedReason && (
							<Textarea
								className="resize-none"
								onChange={(event) => setFeedbackDetails(event.target.value)}
								placeholder="Tell us more (optional)..."
								rows={3}
								value={feedbackDetails}
							/>
						)}

						<DialogFooter className="flex-col gap-2 sm:flex-row">
							<Button
								className="w-full sm:w-auto"
								onClick={resetAndClose}
								variant="outline"
							>
								Keep subscription
							</Button>
							<Button
								className="w-full sm:w-auto"
								disabled={!selectedReason}
								onClick={handleContinueToTiming}
							>
								Continue
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
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
								className="w-full gap-1.5 sm:w-auto"
								disabled={isLoading || confirming}
								onClick={handleBackToFeedback}
								variant="outline"
							>
								<ArrowLeftIcon size={14} />
								Back
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
								{selected === "immediate"
									? "Cancel now"
									: "Confirm cancellation"}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
