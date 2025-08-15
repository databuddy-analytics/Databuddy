'use client';

import {
	ArrowRight,
	ArrowRightIcon,
	BuildingsIcon,
	CheckIcon,
	CodeIcon,
	GlobeIcon,
	type Icon,
	SparkleIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { CreateOrganizationDialog } from '@/components/organizations/create-organization-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { WebsiteDialog } from '@/components/website-dialog';
import { useOrganizations } from '@/hooks/use-organizations';
import { useWebsites } from '@/hooks/use-websites';
import { cn } from '@/lib/utils';

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
		<div className="flex items-center justify-center space-x-2 py-6">
			{steps.map((step, index) => (
				<div className="flex items-center" key={step.id}>
					<div
						className={cn(
							'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300',
							step.completed
								? 'border-primary bg-primary text-primary-foreground'
								: index === currentStep
									? 'border-primary bg-primary/10 text-primary'
									: 'border-muted bg-muted text-muted-foreground'
						)}
					>
						{step.completed ? (
							<CheckIcon className="h-4 w-4" weight="bold" />
						) : (
							<span className="font-medium text-xs">{index + 1}</span>
						)}
					</div>
					{index < steps.length - 1 && (
						<div
							className={cn('h-0.5 w-8 transition-all duration-300', {
								'bg-primary': step.completed,
								'bg-muted': !step.completed,
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
	isNext,
}: {
	step: OnboardingStep;
	isActive: boolean;
	isNext: boolean;
}) {
	return (
		<Card
			className={cn(
				'transition-all duration-300 hover:shadow-md',
				isActive
					? 'border-primary/50 bg-primary/5 shadow-sm'
					: step.completed
						? 'border-primary/20 bg-primary/2'
						: 'border-muted hover:border-border'
			)}
		>
			<CardHeader className="pb-4">
				<div className="flex items-center gap-3">
					<div
						className={cn(
							'rounded-lg border p-3 transition-all duration-300',
							isActive || step.completed
								? 'border-primary/20 bg-primary/10'
								: 'border-muted bg-muted/50'
						)}
					>
						<step.icon
							className={cn(
								'h-6 w-6 transition-all duration-300',
								isActive || step.completed
									? 'text-primary'
									: 'text-muted-foreground'
							)}
							weight="duotone"
						/>
					</div>
					<div className="flex-1">
						<CardTitle className="flex items-center gap-2 text-lg">
							{step.title}
							{step.completed && (
								<Badge
									className="bg-primary/10 text-primary"
									variant="secondary"
								>
									<CheckIcon className="mr-1 h-3 w-3" />
									Done
								</Badge>
							)}
						</CardTitle>
						<CardDescription className="mt-1">
							{step.description}
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			{(isActive || isNext) && step.action && (
				<CardContent className="pt-0">
					<Button
						className={cn(
							'w-full rounded transition-all duration-300',
							isActive
								? 'bg-primary hover:bg-primary/90'
								: 'bg-muted text-muted-foreground hover:bg-muted/80'
						)}
						disabled={!isActive}
						onClick={step.action}
						size="sm"
					>
						{step.actionLabel || 'Continue'}
						<ArrowRightIcon className="ml-2 h-4 w-4" />
					</Button>
				</CardContent>
			)}
		</Card>
	);
}

function WelcomeSection() {
	return (
		<div className="mb-8 space-y-4 text-center">
			<div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2">
				<SparkleIcon className="h-4 w-4 text-primary" weight="fill" />
				<span className="font-medium text-primary text-sm">
					Welcome to Databuddy!
				</span>
			</div>
			<h1 className="font-bold text-3xl tracking-tight">
				Let's get you started
			</h1>
			<p className="mx-auto max-w-2xl text-lg text-muted-foreground">
				Follow these simple steps to set up your analytics dashboard and start
				tracking your website's performance.
			</p>
		</div>
	);
}

function CompletionSection() {
	return (
		<Card className="border-primary/20 bg-primary/5">
			<CardHeader className="text-center">
				<div className="mx-auto mb-4 w-fit rounded-full border border-primary/20 bg-primary/10 p-4">
					<CheckIcon className="h-8 w-8 text-primary" weight="bold" />
				</div>
				<CardTitle className="text-xl">All Set!</CardTitle>
				<CardDescription className="text-base">
					You've successfully completed the onboarding. You're ready to start
					tracking analytics!
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
					<Button className="rounded" size="lg">
						<GlobeIcon className="mr-2 h-5 w-5" />
						View My Websites
					</Button>
					<Button className="rounded" size="lg" variant="outline">
						<UsersIcon className="mr-2 h-5 w-5" />
						Explore Dashboard
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export default function OnboardingPage() {
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
			id: 'organization',
			title: 'Create Organization',
			description: hasOrganization
				? 'Organization created successfully!'
				: 'Set up your team workspace for collaboration',
			icon: BuildingsIcon,
			completed: hasOrganization,
			action: hasOrganization ? undefined : () => setShowCreateOrgDialog(true),
			actionLabel: 'Create Organization',
		},
		{
			id: 'website',
			title: 'Add Your Website',
			description: hasWebsite
				? 'Website added successfully!'
				: 'Add your first website to start tracking analytics',
			icon: GlobeIcon,
			completed: hasWebsite,
			action: hasWebsite ? undefined : () => setShowCreateWebsiteDialog(true),
			actionLabel: 'Add Website',
		},
		{
			id: 'setup',
			title: 'Install Tracking',
			description: 'Add the tracking script to your website to collect data',
			icon: CodeIcon,
			completed: false, // This would be determined by actual tracking data
			action: () => {
				// Navigate to tracking setup
				if (websites && websites.length > 0) {
					window.location.href = `/websites/${websites[0].id}?tab=tracking-setup`;
				}
			},
			actionLabel: 'Setup Tracking',
		},
	];

	const currentStepIndex = steps.findIndex((step) => !step.completed);
	const allCompleted = currentStepIndex === -1;

	return (
		<div className="container mx-auto max-w-4xl space-y-8 px-4 py-8">
			<WelcomeSection />

			{!allCompleted && (
				<>
					<StepIndicator currentStep={currentStepIndex} steps={steps} />

					<div className="space-y-6">
						{steps.map((step, index) => (
							<OnboardingStepCard
								isActive={index === currentStepIndex}
								isNext={index === currentStepIndex + 1}
								key={step.id}
								step={step}
							/>
						))}
					</div>

					<div className="flex justify-center">
						<Button
							className="rounded"
							onClick={() => {
								window.location.href = '/websites';
							}}
							variant="ghost"
						>
							Skip for now
							<ArrowRight className="ml-2 h-4 w-4" />
						</Button>
					</div>
				</>
			)}

			{allCompleted && <CompletionSection />}

			{/* Dialogs */}
			<CreateOrganizationDialog
				isOpen={showCreateOrgDialog}
				onClose={() => setShowCreateOrgDialog(false)}
				onSuccess={() => {
					// Stay on onboarding page after creating organization
					setShowCreateOrgDialog(false);
				}}
			/>

			<WebsiteDialog
				onOpenChange={setShowCreateWebsiteDialog}
				open={showCreateWebsiteDialog}
			/>
		</div>
	);
}
