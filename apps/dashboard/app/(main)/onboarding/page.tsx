"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebsitesLight } from "@/hooks/use-websites";
import {
	APP_EVENTS,
	consumePendingSocialSignup,
	trackAppEvent,
} from "@/lib/app-events";
import { OnboardingStepIndicator } from "./_components/onboarding-step-indicator";
import { StepCreateWebsite } from "./_components/step-create-website";
import { StepExplore } from "./_components/step-explore";
import { StepInstallTracking } from "./_components/step-install-tracking";
import { StepInviteTeam } from "./_components/step-invite-team";
import { ArrowLeftIcon, ArrowRightIcon } from "@databuddy/ui/icons";
import { Button, Card } from "@databuddy/ui";

const STEPS = [
	{
		id: "website",
		title: "Add Website",
		description: "Create the site you want Databuddy to watch.",
	},
	{
		id: "tracking",
		title: "Install Tracking",
		description: "Connect the SDK or script tag so data starts flowing.",
	},
	{
		id: "team",
		title: "Invite Team",
		description: "Bring collaborators in so they can see the same signals.",
	},
	{
		id: "explore",
		title: "Explore",
		description: "Jump into the dashboard and get oriented.",
	},
] as const;

type StepId = (typeof STEPS)[number]["id"];

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
			trackAppEvent(APP_EVENTS.onboardingStepViewed, {
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
		const signupProperties = consumePendingSocialSignup();
		if (signupProperties) {
			trackAppEvent(APP_EVENTS.signupCompleted, signupProperties, {
				flush: true,
			});
		}
		trackAppEvent(APP_EVENTS.onboardingStarted);
	}, []);

	const markComplete = useCallback((stepId: StepId) => {
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
			trackAppEvent(APP_EVENTS.onboardingStepCompleted, { step: "website" });
			goNext();
		},
		[markComplete, goNext]
	);

	const handleTrackingComplete = useCallback(() => {
		markComplete("tracking");
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
			step: "tracking",
			verified: true,
		});
		goNext();
	}, [markComplete, goNext]);

	const handleTeamComplete = useCallback(() => {
		markComplete("team");
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, { step: "team" });
		goNext();
	}, [markComplete, goNext]);

	const handleExploreComplete = useCallback(() => {
		markComplete("explore");
		trackAppEvent(APP_EVENTS.onboardingCompleted);
		const pendingPlan = localStorage.getItem("pendingPlanSelection");
		if (pendingPlan) {
			localStorage.removeItem("pendingPlanSelection");
			router.replace(`/billing?tab=plans&plan=${pendingPlan}`);
		} else {
			router.replace(`/websites/${websiteId}`);
		}
	}, [markComplete, router, websiteId]);

	const handleSkipOnboarding = useCallback(() => {
		trackAppEvent(APP_EVENTS.onboardingSkipped, {
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
				trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
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
	const currentStepConfig = STEPS[currentStep];
	const completedCount = completedSteps.size;

	return (
		<div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.06),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.05),transparent_24%)]">
			<div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
				<Card className="border-border/60 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)]">
					<Card.Header className="gap-4 border-border/60 border-b bg-muted/30 px-5 py-4 sm:px-6">
						<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
							<div className="space-y-1.5">
								<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
									Organization Setup
								</p>
								<h1 className="font-semibold text-base text-foreground sm:text-lg">
									Get Databuddy running
								</h1>
								<p className="max-w-2xl text-pretty text-muted-foreground text-sm leading-5">
									Create your first website, connect tracking, and invite your
									team.
								</p>
							</div>

							<div className="flex items-center gap-3 self-start lg:self-auto">
								<p className="font-medium text-[12px] text-muted-foreground">
									{completedCount} of {STEPS.length} complete
								</p>
								<Button
									className="h-8 px-2.5 text-muted-foreground"
									onClick={handleSkipOnboarding}
									size="sm"
									variant="ghost"
								>
									Skip onboarding
								</Button>
							</div>
						</div>

						<OnboardingStepIndicator
							completedSteps={completedSteps}
							currentStep={currentStep}
							steps={STEPS.map((s) => ({ id: s.id, title: s.title }))}
						/>
					</Card.Header>

					<div className="p-4 sm:p-6 lg:p-8">
						<Card className="border-border/60">
							<Card.Header className="gap-1.5 border-border/60 border-b bg-muted/20 px-5 py-4 sm:px-6">
								<div className="flex items-center gap-2 text-[12px] text-muted-foreground">
									<span className="font-medium">
										Step {currentStep + 1} of {STEPS.length}
									</span>
									<span aria-hidden className="text-border">
										/
									</span>
									<span>
										{completedSteps.has(currentStepConfig.id)
											? "Completed"
											: "Active"}
									</span>
								</div>
								<p className="font-medium text-[15px] text-foreground sm:text-base">
									{currentStepConfig.title}
								</p>
								<p className="max-w-2xl text-pretty text-muted-foreground text-sm leading-5">
									{currentStepConfig.description}
								</p>
							</Card.Header>

							<Card.Content className="px-5 py-5 sm:px-6 sm:py-6">
								<div className="mx-auto max-w-3xl">{renderStep()}</div>
							</Card.Content>

							{showBottomNav && (
								<Card.Footer className="justify-between border-border/60 border-t bg-muted/20 px-5 py-3.5 sm:px-6">
									<Button
										className={isFirstStep ? "invisible" : ""}
										disabled={isFirstStep}
										onClick={goBack}
										variant="ghost"
									>
										<ArrowLeftIcon className="size-4" weight="bold" />
										Back
									</Button>
									<Button disabled={!canContinue} onClick={handleContinue}>
										{STEPS[currentStep].id === "tracking" &&
										!completedSteps.has("tracking")
											? "Skip for now"
											: "Continue"}
										<ArrowRightIcon className="size-4" weight="bold" />
									</Button>
								</Card.Footer>
							)}
						</Card>
					</div>
				</Card>
			</div>
		</div>
	);
}
