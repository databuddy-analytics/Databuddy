'use client';

import {
	ArrowRightIcon,
	BuildingsIcon,
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
import { EmptyState } from './empty-state';

dayjs.extend(relativeTime);

interface OrganizationsListProps {
	organizations: Organization[];
	activeOrganization: ActiveOrganization;
	isLoading: boolean;
}

function OrganizationSkeleton() {
	return (
		<Card className="group relative overflow-hidden">
			<CardContent className="p-4 sm:p-6">
				<div className="space-y-4 sm:space-y-6">
					<div className="flex items-start gap-3 sm:gap-4">
						<Skeleton className="h-10 w-10 flex-shrink-0 rounded-full sm:h-12 sm:w-12" />
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-3 w-28 sm:h-4 sm:w-32" />
							<Skeleton className="h-3 w-20 sm:h-3 sm:w-24" />
							<Skeleton className="h-3 w-24 sm:h-3 sm:w-28" />
						</div>
					</div>
					<div className="space-y-3">
						<Skeleton className="h-9 w-full sm:h-10" />
						<div className="flex gap-2 sm:gap-3">
							<Skeleton className="h-9 flex-1 sm:h-10" />
							<Skeleton className="h-9 w-9 sm:h-10 sm:w-10" />
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function OrganizationsEmptyState() {
	return (
		<EmptyState
			icon={BuildingsIcon}
			title="Start Building Together"
			description="Organizations help you collaborate with your team and manage projects more effectively. Create your first organization to get started."
			features={[
				{ label: 'Team collaboration' },
				{ label: 'Project management' },
				{ label: 'Shared resources' },
			]}
		/>
	);
}

export function OrganizationsList({
	organizations,
	activeOrganization,
	isLoading,
}: OrganizationsListProps) {
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
			<div className="p-4 sm:p-6">
				<div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{Array.from({ length: 6 }).map((_, i) => (
						<OrganizationSkeleton key={i.toString()} />
					))}
				</div>
			</div>
		);
	}

	if (!organizations || organizations.length === 0) {
		return <OrganizationsEmptyState />;
	}

	return (
		<div className="p-4 sm:p-6">
			<div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{organizations.map((org) => {
					const isActive = activeOrganization?.id === org.id;
					const isDeleting = deletingId === org.id;

					return (
						<Card
							className={cn(
								'group relative overflow-hidden transition-all duration-200 hover:shadow-sm',
								isActive
									? 'border-primary/30 bg-primary/5 shadow-sm'
									: 'hover:border-border/60 hover:bg-muted/30'
							)}
							key={org.id}
						>
							{isActive && (
								<div className="absolute top-2 right-2">
									<Badge
										className="border-primary/20 bg-primary/10 text-primary text-xs"
										variant="secondary"
									>
										<CheckIcon className="mr-1 h-3 w-3" size={12} />
										Active
									</Badge>
								</div>
							)}

							<CardContent className="p-4 sm:p-6">
								<div className="space-y-4 sm:space-y-6">
									{/* Organization Info */}
									<div className="flex items-start gap-3 sm:gap-4">
										<Avatar className="h-10 w-10 flex-shrink-0 border border-border/30 sm:h-12 sm:w-12">
											<AvatarImage alt={org.name} src={org.logo || undefined} />
											<AvatarFallback className="bg-accent font-medium text-xs sm:text-sm">
												{getOrganizationInitials(org.name)}
											</AvatarFallback>
										</Avatar>
										<div className="min-w-0 flex-1">
											<h3 className="truncate font-semibold text-sm sm:text-base">
												{org.name}
											</h3>
											<p className="truncate text-muted-foreground text-xs sm:text-sm">
												@{org.slug}
											</p>
											<div className="mt-1 flex items-center gap-1 sm:mt-2">
												<CalendarIcon
													className="h-3 w-3 text-muted-foreground sm:h-4 sm:w-4"
													size={12}
												/>
												<span className="text-muted-foreground text-xs sm:text-sm">
													Created {dayjs(org.createdAt).fromNow()}
												</span>
											</div>
										</div>
									</div>

									{/* Actions */}
									<div className="space-y-3">
										{isActive ? (
											<Button
												className="h-9 w-full rounded font-medium sm:h-10"
												disabled
												variant="secondary"
											>
												<CheckIcon className="mr-2 h-3 w-3 sm:h-4 sm:w-4" size={12} />
												<span className="text-xs sm:text-sm">Current Organization</span>
											</Button>
										) : (
											<Button
												className="h-9 w-full rounded font-medium sm:h-10"
												disabled={isSettingActiveOrganization}
												onClick={() => handleSetActive(org.id)}
											>
												{isSettingActiveOrganization ? (
													<>
														<div className="mr-2 h-3 w-3 animate-spin rounded-full border border-primary-foreground/30 border-t-primary-foreground sm:h-4 sm:w-4" />
														<span className="text-xs sm:text-sm">Switching...</span>
													</>
												) : (
													<>
														<ArrowRightIcon
															className="mr-2 h-3 w-3 sm:h-4 sm:w-4"
															size={12}
														/>
														<span className="text-xs sm:text-sm">Switch Organization</span>
													</>
												)}
											</Button>
										)}

										<div className="flex items-center gap-2 sm:gap-3">
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															asChild
															className="h-9 flex-1 rounded font-medium sm:h-10"
															variant="outline"
														>
															<Link href="/organizations/settings">
																<GearIcon className="mr-2 h-3 w-3 sm:h-4 sm:w-4" size={12} />
																<span className="text-xs sm:text-sm">Settings</span>
															</Link>
														</Button>
													</TooltipTrigger>
													<TooltipContent side="bottom">
														<p>Manage organization settings</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>

											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															className="h-9 w-9 rounded p-0 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive sm:h-10 sm:w-10"
															disabled={isDeleting || isDeletingOrganization}
															onClick={() => handleDelete(org.id, org.name)}
															variant="outline"
														>
															{isDeleting ? (
																<div className="h-3 w-3 animate-spin rounded-full border border-destructive/30 border-t-destructive sm:h-4 sm:w-4" />
															) : (
																<TrashIcon className="h-3 w-3 sm:h-4 sm:w-4" size={12} />
															)}
														</Button>
													</TooltipTrigger>
													<TooltipContent side="bottom">
														<p>Delete organization</p>
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
