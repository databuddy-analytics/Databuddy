"use client";

import { cn } from "@/lib/utils";
import { CheckIcon } from "@databuddy/ui/icons";

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
			className="grid grid-cols-2 gap-2 sm:grid-cols-4"
		>
			{steps.map((step, index) => {
				const isCompleted = completedSteps.has(step.id);
				const isCurrent = index === currentStep;

				return (
					<div
						className={cn(
							"min-w-0 rounded-xl border px-3 py-2.5 transition-colors",
							isCurrent
								? "border-foreground/15 bg-background text-foreground shadow-sm"
								: isCompleted
									? "border-emerald-200/80 bg-emerald-50/80 text-foreground dark:border-emerald-900/60 dark:bg-emerald-950/20"
									: "border-border/60 bg-background/55 text-muted-foreground"
						)}
						key={step.id}
					>
						<div className="flex items-start gap-2.5">
							<div
								className={cn(
									"mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-semibold text-[10px] tabular-nums",
									isCompleted
										? "bg-emerald-600 text-white"
										: isCurrent
											? "bg-foreground text-background"
											: "bg-muted text-muted-foreground"
								)}
							>
								{isCompleted ? (
									<CheckIcon className="size-3" />
								) : (
									<span>{index + 1}</span>
								)}
							</div>
							<div className="min-w-0">
								<p className="truncate font-medium text-[13px]">{step.title}</p>
								<p className="mt-0.5 text-[11px] text-muted-foreground leading-4">
									{isCompleted
										? "Completed"
										: isCurrent
											? "In progress"
											: "Up next"}
								</p>
							</div>
						</div>
					</div>
				);
			})}
		</nav>
	);
}
