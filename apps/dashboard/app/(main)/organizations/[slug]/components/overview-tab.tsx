'use client';

import {
	BuildingsIcon,
	CalendarIcon,
	ChartBarIcon,
	ClockIcon,
	GlobeIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useQueryState } from 'nuqs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
	type Organization,
	useOrganizationMembers,
} from '@/hooks/use-organizations';

dayjs.extend(relativeTime);

interface OverviewTabProps {
	organization: Organization;
}

export function OverviewTab({ organization }: OverviewTabProps) {
	const { members, isLoading: isLoadingMembers } = useOrganizationMembers(
		organization.id
	);
	const [, setActiveTab] = useQueryState('tab');

	const recentMembers = members?.slice(0, 5) || [];
	const ownerMember = members?.find((member) => member.role === 'owner');

	return (
		<div className="space-y-8">
			{/* Organization Info */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<BuildingsIcon
								className="h-5 w-5 not-dark:text-primary"
								size={16}
								weight="duotone"
							/>
							Organization Details
						</CardTitle>
						<CardDescription>
							Basic information about your organization
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center gap-3">
							<div className="flex-shrink-0">
								<CalendarIcon
									className="h-4 w-4 not-dark:text-primary text-muted-foreground"
									size={16}
								/>
							</div>
							<div>
								<p className="font-medium text-foreground text-sm">Created</p>
								<p className="text-muted-foreground text-sm">
									{dayjs(organization.createdAt).format('MMMM D, YYYY')}
									<span className="ml-1">
										({dayjs(organization.createdAt).fromNow()})
									</span>
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<div className="flex-shrink-0">
								<GlobeIcon
									className="h-4 w-4 not-dark:text-primary text-muted-foreground"
									size={16}
								/>
							</div>
							<div>
								<p className="font-medium text-foreground text-sm">
									Organization Slug
								</p>
								<p className="font-mono text-muted-foreground text-sm">
									{organization.slug}
								</p>
							</div>
						</div>
						{ownerMember && (
							<div className="flex items-center gap-3">
								<div className="flex-shrink-0">
									<UsersIcon
										className="h-4 w-4 not-dark:text-primary text-muted-foreground"
										size={16}
									/>
								</div>
								<div>
									<p className="font-medium text-foreground text-sm">Owner</p>
									<p className="text-muted-foreground text-sm">
										{ownerMember.user.name}
									</p>
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ChartBarIcon
								className="h-5 w-5 not-dark:text-primary"
								size={16}
								weight="duotone"
							/>
							Quick Stats
						</CardTitle>
						<CardDescription>
							Overview of your organization's team
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">
								Total Members
							</span>
							{isLoadingMembers ? (
								<Skeleton className="h-6 w-12 rounded" />
							) : (
								<Badge className="px-2 py-1" variant="outline">
									{members?.length || 0}
								</Badge>
							)}
						</div>
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">Admins</span>
							{isLoadingMembers ? (
								<Skeleton className="h-6 w-12 rounded" />
							) : (
								<Badge className="px-2 py-1" variant="outline">
									{members?.filter((m) => m.role === 'admin').length || 0}
								</Badge>
							)}
						</div>
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">
								Regular Members
							</span>
							{isLoadingMembers ? (
								<Skeleton className="h-6 w-12 rounded" />
							) : (
								<Badge className="px-2 py-1" variant="outline">
									{members?.filter((m) => m.role === 'member').length || 0}
								</Badge>
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Recent Members */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<UsersIcon
								className="h-5 w-5 not-dark:text-primary"
								size={16}
								weight="duotone"
							/>
							Recent Team Members
						</CardTitle>
						<Button
							className="rounded-lg"
							onClick={() => setActiveTab('teams')}
							size="sm"
							variant="outline"
						>
							View All Members
						</Button>
					</div>
					<CardDescription>
						Latest members who joined your organization
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isLoadingMembers ? (
						<div className="space-y-3">
							{[1, 2, 3].map((i) => (
								<div
									className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-3"
									key={i}
								>
									<div className="flex items-center gap-3">
										<Skeleton className="h-10 w-10 rounded-full" />
										<div className="space-y-2">
											<Skeleton className="h-4 w-32" />
											<Skeleton className="h-3 w-24" />
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Skeleton className="h-5 w-16 rounded" />
										<Skeleton className="h-3 w-20 rounded" />
									</div>
								</div>
							))}
						</div>
					) : recentMembers.length > 0 ? (
						<div className="space-y-3">
							{recentMembers.map((member) => (
								<div
									className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-3"
									key={member.id}
								>
									<div className="flex items-center gap-3">
										<Avatar className="h-10 w-10">
											<AvatarImage
												alt={member.user.name}
												src={member.user.image || undefined}
											/>
											<AvatarFallback className="bg-accent text-sm">
												{member.user.name.charAt(0).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<div>
											<p className="font-medium text-foreground text-sm">
												{member.user.name}
											</p>
											<p className="text-muted-foreground text-xs">
												{member.user.email}
											</p>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Badge className="px-2 py-1 text-xs" variant="secondary">
											{member.role}
										</Badge>
										<div className="flex items-center gap-1 text-muted-foreground text-xs">
											<ClockIcon
												className="h-3 w-3 not-dark:text-primary"
												size={16}
											/>
											{dayjs(member.createdAt).fromNow()}
										</div>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="py-8 text-center">
							<UsersIcon
								className="mx-auto mb-2 h-8 w-8 not-dark:text-primary text-muted-foreground"
								size={32}
								weight="duotone"
							/>
							<p className="text-muted-foreground text-sm">
								No team members yet
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
