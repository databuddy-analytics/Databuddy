"use client";

import type { OnboardingStep } from "../../utils/types";
import { StepIndicator } from "./step-indicator";
import { CompleteStep } from "./steps/complete-step";
import { OverviewStep } from "./steps/overview-step";
import { TestingStep } from "./steps/testing-step";
import { WebhookStep } from "./steps/webhook-step";

interface OnboardingFlowPropsExtended {
	currentStep: OnboardingStep;
	setCurrentStep: (step: OnboardingStep) => void;
	webhookSecret: string;
	isLiveMode: boolean;
	copied: boolean;
	copyToClipboard: (text: string, label: string) => void;
	webhookUrl: string;
	onSave: (data: { webhookSecret: string; isLiveMode: boolean }) => void;
	isSaving?: boolean;
}

export function OnboardingFlow({
	currentStep,
	setCurrentStep,
	webhookSecret,
	isLiveMode,
	copied,
	copyToClipboard,
	webhookUrl,
	onSave,
	isSaving = false,
}: OnboardingFlowPropsExtended) {
	const steps: OnboardingStep[] = [
		"overview",
		"webhook",
		"testing",
		"complete",
	];

	return (
		<div className="space-y-6">
			{/* Step Indicator */}
			<StepIndicator currentStep={currentStep} steps={steps} />

			{/* Step Content */}
			{currentStep === "overview" && (
				<OverviewStep onNext={() => setCurrentStep("webhook")} />
			)}

			{currentStep === "webhook" && (
				<WebhookStep
					copied={copied}
					copyToClipboard={copyToClipboard}
					isLiveMode={isLiveMode}
					isSaving={isSaving}
					onBack={() => setCurrentStep("overview")}
					onNext={() => setCurrentStep("testing")}
					onSave={onSave}
					webhookSecret={webhookSecret}
					webhookUrl={webhookUrl}
				/>
			)}

			{currentStep === "testing" && (
				<TestingStep
					copyToClipboard={copyToClipboard}
					onBack={() => setCurrentStep("webhook")}
					onNext={() => setCurrentStep("complete")}
				/>
			)}

			{currentStep === "complete" && (
				<CompleteStep onViewDashboard={() => setCurrentStep("overview")} />
			)}
		</div>
	);
}
