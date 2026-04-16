"use client";

import { track } from "@databuddy/sdk";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWebsitesLight } from "@/hooks/use-websites";
import { OnboardingStepIndicator } from "./_components/onboarding-step-indicator";
import { StepCreateWebsite } from "./_components/step-create-website";
import { StepExplore } from "./_components/step-explore";
import { StepInstallTracking } from "./_components/step-install-tracking";
import { StepInviteTeam } from "./_components/step-invite-team";

const STEPS = [
	{ id: "website", title: "Add Website" },
	{ id: "tracking", title: "Install Tracking" },
	{ id: "team", title: "Invite Team" },
	{ id: "explore", title: "Explore" },
] as const;

function trackOnboarding(
	event: string,
	properties?: Record<string, string | number | boolean>
) {
	try {
		track(`onboarding_${event}`, properties);
	} catch {
		// SDK not loaded yet
	}
}

export default function OnboardingPage() {
	const router = useRouter();
	const { websites } = useWebsitesLight();
	const trackedStepRef = useRef<number>(-1);

	const [currentStep, setCurrentStep] = useState(0);
	const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
	const [createdWebsiteId, setCreatedWebsiteId] = useState<string | null>(null);

	const hasWebsite = websites && websites.length > 0;
	const websiteId = createdWebsiteId ?? websites?.[0]?.id ?? "";

	// Update URL and track step views
	useEffect(() => {
		const stepId = STEPS[currentStep].id;
		window.history.replaceState(null, "", `/onboarding?step=${stepId}`);

		if (trackedStepRef.current !== currentStep) {
			trackedStepRef.current = currentStep;
			trackOnboarding("step_viewed", {
				step: stepId,
				step_number: currentStep + 1,
			});
		}
	}, [currentStep]);

	useEffect(() => {
		if (hasWebsite && !completedSteps.has("website")) {
			setCompletedSteps((prev) => new Set([...prev, "website"]));
			if (currentStep === 0) {
				setCurrentStep(1);
			}
		}
	}, [hasWebsite, completedSteps, currentStep]);

	// Track onboarding start once
	useEffect(() => {
		trackOnboarding("started");
	}, []);

	const markComplete = useCallback((stepId: string) => {
		setCompletedSteps((prev) => new Set([...prev, stepId]));
	}, []);

	const goNext = useCallback(() => {
		setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
	}, []);

	const goBack = useCallback(() => {
		setCurrentStep((prev) => Math.max(prev - 1, 0));
	}, []);

	const handleWebsiteCreated = useCallback(
		(id: string) => {
			setCreatedWebsiteId(id);
			markComplete("website");
			trackOnboarding("step_completed", { step: "website" });
			goNext();
		},
		[markComplete, goNext]
	);

	const handleTrackingComplete = useCallback(() => {
		markComplete("tracking");
		trackOnboarding("step_completed", {
			step: "tracking",
			verified: true,
		});
		goNext();
	}, [markComplete, goNext]);

	const handleTeamComplete = useCallback(() => {
		markComplete("team");
		trackOnboarding("step_completed", { step: "team" });
		goNext();
	}, [markComplete, goNext]);

	const handleExploreComplete = useCallback(() => {
		markComplete("explore");
		trackOnboarding("completed");
		const pendingPlan = localStorage.getItem("pendingPlanSelection");
		if (pendingPlan) {
			localStorage.removeItem("pendingPlanSelection");
			router.replace(`/billing?tab=plans&plan=${pendingPlan}`);
		} else {
			router.replace(`/websites/${websiteId}`);
		}
	}, [markComplete, router, websiteId]);

	const handleSkipOnboarding = useCallback(() => {
		trackOnboarding("skipped", {
			skipped_at_step: STEPS[currentStep].id,
			step_number: currentStep + 1,
		});
		router.push("/websites");
	}, [currentStep, router]);

	const canContinue = useMemo(() => {
		const step = STEPS[currentStep];
		switch (step.id) {
			case "website":
				return completedSteps.has("website");
			case "tracking":
				return true;
			case "team":
				return true;
			case "explore":
				return true;
			default:
				return false;
		}
	}, [currentStep, completedSteps]);

	const handleContinue = useCallback(() => {
		const step = STEPS[currentStep];
		if (step.id === "explore") {
			handleExploreComplete();
			return;
		}
		if (step.id === "team") {
			handleTeamComplete();
			return;
		}
		if (step.id === "tracking") {
			if (!completedSteps.has("tracking")) {
				markComplete("tracking");
				trackOnboarding("step_completed", {
					step: "tracking",
					verified: false,
				});
			}
			goNext();
			return;
		}
		goNext();
	}, [
		currentStep,
		completedSteps,
		goNext,
		markComplete,
		handleExploreComplete,
		handleTeamComplete,
	]);

	const renderStep = () => {
		switch (STEPS[currentStep].id) {
			case "website":
				return <StepCreateWebsite onComplete={handleWebsiteCreated} />;
			case "tracking":
				return (
					<StepInstallTracking
						onComplete={handleTrackingComplete}
						websiteId={websiteId}
					/>
				);
			case "team":
				return <StepInviteTeam />;
			case "explore":
				return (
					<StepExplore
						onComplete={handleExploreComplete}
						websiteId={websiteId}
					/>
				);
			default:
				return null;
		}
	};

	const isFirstStep = currentStep === 0;
	const showBottomNav = STEPS[currentStep].id !== "explore";

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-12 shrink-0 items-center justify-between border-b px-4 sm:px-6">
				<OnboardingStepIndicator
					completedSteps={completedSteps}
					currentStep={currentStep}
					steps={STEPS.map((s) => ({ id: s.id, title: s.title }))}
				/>
				<Button
					className="text-muted-foreground text-xs"
					onClick={handleSkipOnboarding}
					size="sm"
					variant="ghost"
				>
					Skip onboarding
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
				<div className="mx-auto max-w-xl">{renderStep()}</div>
			</div>

			{showBottomNav && (
				<div className="flex h-12 shrink-0 items-center justify-between border-t px-4 sm:px-6">
					<Button
						className={isFirstStep ? "invisible" : ""}
						disabled={isFirstStep}
						onClick={goBack}
						variant="ghost"
					>
						<ArrowLeftIcon className="mr-1 size-4" weight="bold" />
						Back
					</Button>
					<Button disabled={!canContinue} onClick={handleContinue}>
						{STEPS[currentStep].id === "tracking" &&
						!completedSteps.has("tracking")
							? "Skip for now"
							: "Continue"}
						<ArrowRightIcon className="ml-1 size-4" weight="bold" />
					</Button>
				</div>
			)}
		</div>
	);
}
