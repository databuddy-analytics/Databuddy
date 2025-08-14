'use client';

import {
	BuildingsIcon,
	ChartLineIcon,
	ShieldIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

interface OnboardingCardProps {
	onCreateOrganization: () => void;
}

export function OnboardingCard({ onCreateOrganization }: OnboardingCardProps) {
	const features = [
		{
			icon: UsersIcon,
			title: 'Team Collaboration',
			description: 'Invite team members and manage permissions',
		},
		{
			icon: ChartLineIcon,
			title: 'Shared Analytics',
			description: 'Share insights and reports across your team',
		},
		{
			icon: ShieldIcon,
			title: 'Role-Based Access',
			description: 'Control who can view and manage your data',
		},
	];

	return (
		<Card className="border-primary/20 bg-primary/5">
			<CardHeader className="text-center">
				<div className="mx-auto mb-4 w-fit rounded-full border border-primary/20 bg-primary/10 p-4">
					<BuildingsIcon
						className="h-8 w-8 not-dark:text-primary text-primary"
						size={32}
						weight="duotone"
					/>
				</div>
				<CardTitle className="text-xl">Ready to Collaborate?</CardTitle>
				<CardDescription className="text-base">
					Create your first organization to start working with your team
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					{features.map((feature) => (
						<div className="text-center" key={feature.title}>
							<div className="mx-auto mb-2 w-fit rounded-full bg-muted/50 p-2">
								<feature.icon
									className="h-5 w-5 not-dark:text-primary text-primary"
									size={20}
									weight="duotone"
								/>
							</div>
							<h4 className="font-medium text-sm">{feature.title}</h4>
							<p className="text-muted-foreground text-xs">
								{feature.description}
							</p>
						</div>
					))}
				</div>

				<div className="flex justify-center">
					<Button className="rounded" onClick={onCreateOrganization} size="lg">
						<BuildingsIcon
							className="mr-2 h-5 w-5 not-dark:text-primary"
							size={20}
						/>
						Create Organization
					</Button>
				</div>

				<div className="rounded border border-border/50 bg-muted/30 p-4">
					<h4 className="mb-2 font-medium text-sm">What happens next?</h4>
					<ol className="space-y-2 text-muted-foreground text-sm">
						<li className="flex items-start gap-2">
							<Badge className="h-5 w-5 rounded-full p-0 text-xs">1</Badge>
							<span>Create your organization with a name and slug</span>
						</li>
						<li className="flex items-start gap-2">
							<Badge className="h-5 w-5 rounded-full p-0 text-xs">2</Badge>
							<span>Invite team members via email invitations</span>
						</li>
						<li className="flex items-start gap-2">
							<Badge className="h-5 w-5 rounded-full p-0 text-xs">3</Badge>
							<span>Start collaborating on shared analytics and insights</span>
						</li>
					</ol>
				</div>
			</CardContent>
		</Card>
	);
}
