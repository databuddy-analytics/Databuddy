'use client';

import {
	ArrowRightIcon,
	CalendarIcon,
	CheckIcon,
	GearIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import {
	type ActiveOrganization,
	type Organization,
	useOrganizations,
} from '@/hooks/use-organizations';
import { cn, getOrganizationInitials } from '@/lib/utils';
import { OnboardingCard } from './onboarding-card';

dayjs.extend(relativeTime);

interface OrganizationsTabProps {
	organizations: Organization[];
	activeOrganization: ActiveOrganization;
	isLoading: boolean;
	onCreateOrganization: () => void;
}

export function OrganizationsTab({
	organizations,
	activeOrganization,
	isLoading,
	onCreateOrganization,
}: OrganizationsTabProps) {
	const {
		setActiveOrganization,
		deleteOrganizationAsync,
		isSettingActiveOrganization,
		isDeletingOrganization,
	} = useOrganizations();
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	const handleSetActive = (organizationId: string) => {
		setActiveOrganization(organizationId);
	};

	const handleDelete = (organizationId: string, organizationName: string) => {
		setConfirmDelete({ id: organizationId, name: organizationName });
	};

	const confirmDeleteAction = async () => {
		if (!confirmDelete) {
			return;
		}
		setDeletingId(confirmDelete.id);
		try {
			await deleteOrganizationAsync(confirmDelete.id);
		} catch (_error) {
			toast.error('Failed to delete organization');
		} finally {
			setDeletingId(null);
			setConfirmDelete(null);
		}
	};

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{[1, 2, 3].map((i) => (
						<div
							className="space-y-4 rounded border border-border/50 bg-muted/30 p-6"
							key={i}
						>
							<div className="flex items-center gap-3">
								<Skeleton className="h-12 w-12 rounded-full" />
								<div className="space-y-2">
									<Skeleton className="h-5 w-32 rounded" />
									<Skeleton className="h-4 w-24 rounded" />
								</div>
							</div>
							<Skeleton className="h-8 w-full rounded" />
						</div>
					))}
				</div>
			</div>
		);
	}

	if (!organizations || organizations.length === 0) {
		return <OnboardingCard onCreateOrganization={onCreateOrganization} />;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-semibold text-lg">Your Organizations</h2>
					<p className="text-muted-foreground text-sm">
						Switch between organizations or create a new one for team
						collaboration
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{organizations.map((org) => {
					const isActive = activeOrganization?.id === org.id;
					const isDeleting = deletingId === org.id;

					return (
						<Card
							className={cn(
								'relative transition-all duration-200 hover:shadow-md',
								isActive
									? 'border-primary/50 bg-primary/5 shadow-md'
									: 'hover:border-border/70 hover:bg-muted/40'
							)}
							key={org.id}
						>
							{isActive && (
								<div className="absolute top-3 right-3">
									<Badge
										className="border-primary/20 bg-primary/10 text-primary"
										variant="secondary"
									>
										<CheckIcon className="mr-1 h-3 w-3" size={16} />
										Active
									</Badge>
								</div>
							)}

							<CardContent className="p-6">
								<div className="space-y-4">
									<div className="flex items-start gap-3">
										<Avatar className="h-12 w-12 border border-border/50">
											<AvatarImage alt={org.name} src={org.logo || undefined} />
											<AvatarFallback className="bg-accent font-medium text-sm">
												{getOrganizationInitials(org.name)}
											</AvatarFallback>
										</Avatar>
										<div className="min-w-0 flex-1">
											<h3 className="truncate font-semibold text-lg">
												{org.name}
											</h3>
											<p className="truncate text-muted-foreground text-sm">
												@{org.slug}
											</p>
											<div className="mt-2 flex items-center gap-1">
												<CalendarIcon
													className="h-3 w-3 not-dark:text-primary text-muted-foreground"
													size={16}
												/>
												<span className="text-muted-foreground text-xs">
													Created {dayjs(org.createdAt).fromNow()}
												</span>
											</div>
										</div>
									</div>

									<div className="space-y-3">
										{isActive ? (
											<Button className="w-full rounded" disabled size="sm">
												<CheckIcon className="mr-2 h-3 w-3" size={16} />
												Active
											</Button>
										) : (
											<Button
												className="w-full rounded"
												disabled={isSettingActiveOrganization}
												onClick={() => handleSetActive(org.id)}
												size="sm"
											>
												{isSettingActiveOrganization ? (
													<>
														<div className="mr-2 h-3 w-3 animate-spin rounded-full border border-primary-foreground/30 border-t-primary-foreground" />
														Switching...
													</>
												) : (
													<>
														<ArrowRightIcon
															className="mr-2 h-3 w-3 not-dark:text-primary"
															size={16}
														/>
														Switch to This Organization
													</>
												)}
											</Button>
										)}

										<div className="flex items-center gap-2">
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															asChild
															className="flex-1 rounded"
															size="sm"
															variant="outline"
														>
															<Link href={`/organizations/${org.slug}`}>
																<GearIcon
																	className="mr-2 h-3 w-3 not-dark:text-primary"
																	size={16}
																/>
																Settings
															</Link>
														</Button>
													</TooltipTrigger>
													<TooltipContent>
														<p>Manage organization settings and team members</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>

											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															className="rounded hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
															disabled={isDeleting || isDeletingOrganization}
															onClick={() => handleDelete(org.id, org.name)}
															size="sm"
															variant="outline"
														>
															{isDeleting ? (
																<div className="h-3 w-3 animate-spin rounded-full border border-destructive/30 border-t-destructive" />
															) : (
																<TrashIcon className="h-3 w-3" size={16} />
															)}
														</Button>
													</TooltipTrigger>
													<TooltipContent>
														<p>Delete this organization permanently</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>

			<AlertDialog
				onOpenChange={(open) => !open && setConfirmDelete(null)}
				open={!!confirmDelete}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete organization</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete "{confirmDelete?.name}" and all
							associated resources. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={confirmDeleteAction}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
