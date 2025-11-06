"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import type { OnboardingStep } from "../../utils/types";

interface StepIndicatorProps {
	currentStep: OnboardingStep;
	steps: OnboardingStep[];
}

export function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
	return (
		<div className="flex items-center gap-4">
			{steps.map((step, index) => (
				<div className="flex items-center gap-2" key={step}>
					<div
						className={`flex h-8 w-8 items-center justify-center rounded-full font-medium text-sm ${
							currentStep === step
								? "bg-blue-500 text-white"
								: index < steps.indexOf(currentStep)
									? "bg-green-500 text-white"
									: "bg-muted text-muted-foreground"
						}`}
					>
						{index < steps.indexOf(currentStep) ? (
							<CheckCircleIcon className="h-4 w-4" size={16} weight="fill" />
						) : (
							index + 1
						)}
					</div>
					{index < steps.length - 1 && <div className="h-px w-8 bg-border" />}
				</div>
			))}
		</div>
	);
}
