"use client";

import {
	ArrowRightIcon,
	BuildingsIcon,
	CheckIcon,
	CodeIcon,
	GlobeIcon,
	type Icon,
	SparkleIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { EmptyState } from "@/components/empty-state";
import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WebsiteDialog } from "@/components/website-dialog";
import { useOrganizations } from "@/hooks/use-organizations";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";

interface OnboardingStep {
	id: string;
	title: string;
	description: string;
	icon: Icon;
	completed: boolean;
	action?: () => void;
	actionLabel?: string;
}

function StepIndicator({
	steps,
	currentStep,
}: {
	steps: OnboardingStep[];
	currentStep: number;
}) {
	return (
		<div className="flex items-center justify-center gap-2 py-8">
			{steps.map((step, index) => (
				<div className="flex items-center" key={step.id}>
					<div
						className={cn(
							"flex size-8 items-center justify-center rounded-full border-2 transition-all duration-300",
							step.completed
								? "border-primary bg-primary text-primary-foreground"
								: index === currentStep
									? "border-primary bg-primary/10 text-primary"
									: "border-muted bg-card text-muted-foreground"
						)}
					>
						{step.completed ? (
							<CheckIcon className="size-4" weight="bold" />
						) : (
							<span className="font-semibold text-xs tabular-nums">
								{index + 1}
							</span>
						)}
					</div>
					{index < steps.length - 1 && (
						<div
							className={cn("h-0.5 w-8 transition-all duration-300", {
								"bg-primary": step.completed,
								"bg-muted": !step.completed,
							})}
						/>
					)}
				</div>
			))}
		</div>
	);
}

function OnboardingStepCard({
	step,
	isActive,
}: {
	step: OnboardingStep;
	isActive: boolean;
}) {
	return (
		<Card
			className={cn(
				"group gap-0 overflow-hidden border bg-card py-0 transition-all duration-300 hover:border-primary",
				isActive
					? "border-primary/50"
					: step.completed
						? "border-primary/20"
						: "border-muted"
			)}
		>
			<div className="flex items-center gap-2.5 px-2.5 py-2.5">
				<div
					className={cn(
						"flex size-7 shrink-0 items-center justify-center rounded bg-accent transition-colors",
						isActive || step.completed ? "bg-primary/10" : "bg-accent"
					)}
				>
					<step.icon
						className={cn(
							"size-4 transition-colors",
							isActive || step.completed
								? "text-primary"
								: "text-muted-foreground"
						)}
						weight="bold"
					/>
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-base leading-tight">
						{step.title}
					</p>
					<p className="truncate text-muted-foreground text-xs">
						{step.description}
					</p>
				</div>
				<div className="shrink-0 text-balance text-right">
					{step.completed ? (
						<CheckIcon
							aria-label="Completed"
							className="size-4 text-primary"
							weight="bold"
						/>
					) : isActive && step.action ? (
						<Button className="rounded" onClick={step.action} size="sm">
							{step.actionLabel || "Continue"}
							<ArrowRightIcon className="ml-2 size-4" weight="bold" />
						</Button>
					) : null}
				</div>
			</div>
		</Card>
	);
}

export default function OnboardingPage() {
	const router = useRouter();
	const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);
	const [showCreateWebsiteDialog, setShowCreateWebsiteDialog] = useState(false);

	const { organizations, activeOrganization } = useOrganizations();
	const { websites } = useWebsites();

	// Determine completion status
	const hasOrganization = Boolean(
		organizations?.length > 0 || !!activeOrganization
	);
	const hasWebsite = Boolean(websites && websites.length > 0);

	const steps: OnboardingStep[] = [
		{
			id: "organization",
			title: "Create Organization",
			description: hasOrganization
				? "Organization created successfully"
				: "Set up your team workspace for collaboration",
			icon: BuildingsIcon,
			completed: hasOrganization,
			action: hasOrganization ? undefined : () => setShowCreateOrgDialog(true),
			actionLabel: "Create Organization",
		},
		{
			id: "website",
			title: "Add Your Website",
			description: hasWebsite
				? "Website added successfully"
				: "Add your first website to start tracking analytics",
			icon: GlobeIcon,
			completed: hasWebsite,
			action: hasWebsite ? undefined : () => setShowCreateWebsiteDialog(true),
			actionLabel: "Add Website",
		},
		{
			id: "setup",
			title: "Install Tracking",
			description: "Add the tracking script to your website to collect data",
			icon: CodeIcon,
			completed: false,
			action: () => {
				if (websites && websites.length > 0) {
					window.location.href = `/websites/${websites[0].id}?tab=tracking-setup`;
				}
			},
			actionLabel: "Setup Tracking",
		},
	];

	const currentStepIndex = steps.findIndex((step) => !step.completed);
	const allCompleted = currentStepIndex === -1;

	// Check for pending plan selection and redirect to billing
	useEffect(() => {
		const pendingPlan = localStorage.getItem("pendingPlanSelection");
		if (pendingPlan && allCompleted) {
			localStorage.removeItem("pendingPlanSelection");
			router.push(`/billing?tab=plans&plan=${pendingPlan}`);
		}
	}, [allCompleted, router]);

	return (
		<div className="flex h-full flex-col">
			<PageHeader
				description="Follow these steps to set up your analytics dashboard"
				icon={<SparkleIcon />}
				title="Get Started"
			/>

			<div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
				<div className="mx-auto max-w-2xl space-y-6">
					{!allCompleted && (
						<>
							<StepIndicator currentStep={currentStepIndex} steps={steps} />

							<div className="space-y-3">
								{steps.map((step, index) => (
									<OnboardingStepCard
										isActive={index === currentStepIndex}
										key={step.id}
										step={step}
									/>
								))}
							</div>

							<div className="flex justify-center pt-4">
								<Button
									className="rounded"
									onClick={() => {
										window.location.href = "/websites";
									}}
									variant="ghost"
								>
									Skip for now
									<ArrowRightIcon className="ml-2 size-4" weight="bold" />
								</Button>
							</div>
						</>
					)}

					{allCompleted && (
						<EmptyState
							action={{
								label: "View My Websites",
								onClick: () => {
									window.location.href = "/websites";
								},
							}}
							className="h-full"
							description="You've successfully completed the onboarding. You're ready to start tracking analytics!"
							icon={<CheckIcon weight="bold" />}
							showPlusBadge={false}
							title="All Set!"
							variant="minimal"
						/>
					)}
				</div>
			</div>

			{/* Dialogs */}
			<CreateOrganizationDialog
				isOpen={showCreateOrgDialog}
				onClose={() => setShowCreateOrgDialog(false)}
			/>

			<WebsiteDialog
				onOpenChange={setShowCreateWebsiteDialog}
				open={showCreateWebsiteDialog}
			/>
		</div>
	);
}
