'use client';

import { BuildingsIcon, UsersIcon } from '@phosphor-icons/react';
import {
	Card,
	CardContent,
	CardDescription,
	CardTitle,
} from '@/components/ui/card';
import type {
	ActiveOrganization,
	Organization,
} from '@/hooks/use-organizations';
import { TeamView } from './team-view';

export function TeamsTab({
	organization,
}: {
	organization: Organization | ActiveOrganization;
}) {
	if (!(organization && organization.id)) {
		return (
			<div className="py-12 text-center">
				<Card className="mx-auto max-w-md">
					<CardContent className="p-8">
						<div className="mx-auto mb-6 w-fit rounded-full border border-primary/20 bg-primary/10 p-4">
							<UsersIcon
								className="h-8 w-8 text-primary"
								size={32}
								weight="duotone"
							/>
						</div>
						<CardTitle className="mb-3 text-xl">Team Management</CardTitle>
						<CardDescription className="mb-6 text-base">
							Teams help you collaborate with others and manage permissions
							within your organization.
						</CardDescription>
						<div className="space-y-4">
							<div className="rounded border border-border/50 bg-muted/30 p-4 text-left">
								<h4 className="mb-2 font-medium text-sm">
									What you can do with teams:
								</h4>
								<ul className="space-y-1 text-muted-foreground text-sm">
									<li className="flex items-center gap-2">
										<UsersIcon className="h-3 w-3 text-success" size={12} />
										Invite team members via email
									</li>
									<li className="flex items-center gap-2">
										<UsersIcon className="h-3 w-3 text-success" size={12} />
										Set different permission levels (Owner, Admin, Member)
									</li>
									<li className="flex items-center gap-2">
										<UsersIcon className="h-3 w-3 text-success" size={12} />
										Manage access to analytics and settings
									</li>
								</ul>
							</div>
							<div className="rounded border border-warning/20 bg-warning/5 p-4">
								<div className="flex items-center gap-3">
									<BuildingsIcon className="h-5 w-5 text-warning" size={20} />
									<div className="flex-1">
										<p className="font-medium text-sm text-warning-foreground">
											Select an Organization First
										</p>
										<p className="text-warning-foreground/70 text-xs">
											Switch to an organization to start managing your team
											members.
										</p>
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return <TeamView organization={organization} />;
}
