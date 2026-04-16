"use client";

import { cn } from "@/lib/utils";
import { CheckIcon } from "@phosphor-icons/react";

interface Step {
	id: string;
	title: string;
}

interface OnboardingStepIndicatorProps {
	completedSteps: Set<string>;
	currentStep: number;
	steps: Step[];
}

export function OnboardingStepIndicator({
	steps,
	currentStep,
	completedSteps,
}: OnboardingStepIndicatorProps) {
	return (
		<nav
			aria-label="Onboarding progress"
			className="flex h-10 items-center gap-2"
		>
			{steps.map((step, index) => {
				const isCompleted = completedSteps.has(step.id);
				const isCurrent = index === currentStep;

				return (
					<div className="flex items-center" key={step.id}>
						<div className="flex items-center gap-2">
							<div
								className={cn(
									"flex size-7 items-center justify-center rounded-full border font-semibold text-xs tabular-nums",
									isCompleted
										? "border-primary bg-primary text-primary-foreground"
										: isCurrent
											? "border-primary bg-primary/10 text-primary"
											: "border-border bg-card text-muted-foreground"
								)}
							>
								{isCompleted ? (
									<CheckIcon className="size-3.5" weight="bold" />
								) : (
									<span>{index + 1}</span>
								)}
							</div>
							<span
								className={cn(
									"hidden text-sm sm:inline",
									isCurrent
										? "font-medium text-foreground"
										: isCompleted
											? "text-muted-foreground"
											: "text-muted-foreground/60"
								)}
							>
								{step.title}
							</span>
						</div>
						{index < steps.length - 1 && (
							<div
								className={cn(
									"ml-2 h-px w-6 sm:w-10",
									isCompleted ? "bg-primary" : "bg-border"
								)}
							/>
						)}
					</div>
				);
			})}
		</nav>
	);
}
