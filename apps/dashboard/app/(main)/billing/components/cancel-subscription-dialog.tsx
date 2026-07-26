"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
	ArrowLeftIcon,
	CalendarIcon,
	CurrencyDollarIcon,
	GearIcon,
	LightningIcon,
	QuestionIcon,
	SmileyIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { Dialog } from "@databuddy/ui/client";
import { Badge, Button, Textarea, dayjs } from "@databuddy/ui";

interface CancelSubscriptionDialogProps {
	currentPeriodEnd?: number;
	isLoading: boolean;
	onCancel: (immediate: boolean, feedback?: CancelFeedback) => Promise<boolean>;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	planName: string;
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
	icon: React.ElementType;
	id: CancelReasonId;
	label: string;
}

export interface CancelFeedback {
	details?: string;
	reason: CancelReasonId;
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
		const didCancel = await onCancel(selected === "immediate", feedback).catch(
			() => false
		);
		setConfirming(false);
		if (didCancel) {
			resetAndClose();
		}
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
			<Dialog.Content className="w-[95vw] max-w-md sm:w-full">
				{step === "feedback" ? (
					<>
						<Dialog.Header>
							<Dialog.Title>Before you go...</Dialog.Title>
							<Dialog.Description>
								We'd love to know why you're canceling so we can improve
							</Dialog.Description>
						</Dialog.Header>

						<Dialog.Body className="space-y-1.5">
							{CANCEL_REASONS.map((reason) => {
								const IconComponent = reason.icon;
								const isActive = selectedReason === reason.id;
								return (
									<Button
										className={cn(
											"h-auto w-full justify-start whitespace-normal rounded-md border border-border/60 p-3 text-left font-normal",
											"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
											isActive
												? "border-primary bg-primary/10 ring-2 ring-primary/60"
												: "hover:bg-interactive-hover"
										)}
										key={reason.id}
										onClick={() => setSelectedReason(reason.id)}
										variant="secondary"
									>
										<div className="flex items-center gap-3">
											<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
												<IconComponent
													className="size-4 text-accent-foreground"
													weight="duotone"
												/>
											</div>
											<span className="font-medium text-xs">
												{reason.label}
											</span>
										</div>
									</Button>
								);
							})}

							{selectedReason && (
								<Textarea
									className="mt-2 resize-none"
									onChange={(event) => setFeedbackDetails(event.target.value)}
									placeholder="Tell us more (optional)..."
									rows={3}
									value={feedbackDetails}
								/>
							)}
						</Dialog.Body>

						<Dialog.Footer className="flex-col gap-2 sm:flex-row">
							<Button
								className="w-full sm:w-auto"
								onClick={resetAndClose}
								variant="secondary"
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
						</Dialog.Footer>
					</>
				) : (
					<>
						<Dialog.Header>
							<Dialog.Title>Cancel {planName}</Dialog.Title>
							<Dialog.Description>
								Choose when you'd like to cancel your subscription
							</Dialog.Description>
						</Dialog.Header>

						<Dialog.Body className="space-y-1.5">
							<Button
								className={cn(
									"h-auto w-full justify-start whitespace-normal rounded-md border border-border/60 p-3 text-left font-normal",
									"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
									"disabled:pointer-events-none disabled:opacity-50",
									selected === "end_of_period"
										? "border-primary bg-primary/10 ring-2 ring-primary/60"
										: "hover:bg-interactive-hover"
								)}
								disabled={isLoading || confirming}
								onClick={() => setSelected("end_of_period")}
								variant="secondary"
							>
								<div className="flex items-start gap-3">
									<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
										<CalendarIcon
											className="size-4 text-accent-foreground"
											weight="duotone"
										/>
									</div>
									<div className="flex-1">
										<div className="flex items-center gap-2">
											<span className="font-medium text-xs">
												Cancel at period end
											</span>
											<Badge variant="muted">Recommended</Badge>
										</div>
										<p className="mt-1 text-muted-foreground text-xs">
											{periodEndDate
												? `Keep access until ${periodEndDate}`
												: "Keep access until your billing period ends"}
										</p>
									</div>
								</div>
							</Button>

							<Button
								className={cn(
									"h-auto w-full justify-start whitespace-normal rounded-md border border-border/60 p-3 text-left font-normal",
									"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
									"disabled:pointer-events-none disabled:opacity-50",
									selected === "immediate"
										? "border-destructive bg-destructive/10 ring-2 ring-destructive/60"
										: "hover:bg-interactive-hover"
								)}
								disabled={isLoading || confirming}
								onClick={() => setSelected("immediate")}
								variant="secondary"
							>
								<div className="flex items-start gap-3">
									<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10">
										<LightningIcon
											className="size-4 text-destructive"
											weight="duotone"
										/>
									</div>
									<div className="flex-1">
										<span className="font-medium text-xs">
											Cancel immediately
										</span>
										<p className="mt-1 text-muted-foreground text-xs">
											Lose access now. Any pending usage will be invoiced.
										</p>
									</div>
								</div>
							</Button>

							{selected === "immediate" && (
								<div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
									<WarningCircleIcon
										className="mt-0.5 size-4 shrink-0 text-destructive"
										weight="fill"
									/>
									<span className="text-destructive text-xs">
										This action cannot be undone. You will lose access to all{" "}
										{planName} features immediately.
									</span>
								</div>
							)}
						</Dialog.Body>

						<Dialog.Footer className="flex-col gap-2 sm:flex-row">
							<Button
								className="w-full gap-1.5 sm:w-auto"
								disabled={isLoading || confirming}
								onClick={handleBackToFeedback}
								variant="secondary"
							>
								<ArrowLeftIcon className="size-3.5" />
								Back
							</Button>
							<Button
								className="w-full sm:w-auto"
								disabled={!selected || isLoading || confirming}
								loading={confirming}
								onClick={handleConfirm}
								tone={selected === "immediate" ? "destructive" : undefined}
							>
								{selected === "immediate"
									? "Cancel now"
									: "Confirm cancellation"}
							</Button>
						</Dialog.Footer>
					</>
				)}
			</Dialog.Content>
		</Dialog>
	);
}
