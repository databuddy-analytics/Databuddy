'use client';

import {
	ArrowRightIcon,
	BuildingsIcon,
	CalendarIcon,
	CheckIcon,
	GearIcon,
	PlusIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { CreateOrganizationDialog } from '@/components/organizations/create-organization-dialog';
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

dayjs.extend(relativeTime);

interface OrganizationsListProps {
	organizations: Organization[];
	activeOrganization: ActiveOrganization;
	isLoading: boolean;
}

function OrganizationSkeleton() {
	return (
		<Card className="group relative overflow-hidden">
			<CardContent className="p-6">
				<div className="space-y-6">
					<div className="flex items-start gap-4">
						<Skeleton className="h-12 w-12 flex-shrink-0 rounded-full" />
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-28" />
						</div>
					</div>
					<div className="space-y-3">
						<Skeleton className="h-10 w-full" />
						<div className="flex gap-3">
							<Skeleton className="h-10 flex-1" />
							<Skeleton className="h-10 w-10" />
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function EmptyState() {
	return (
		<div className="flex h-full flex-col items-center justify-center p-6 text-center">
			<div className="mx-auto mb-8 w-fit rounded-2xl border border-primary/20 bg-primary/10 p-8">
				<BuildingsIcon
					className="h-16 w-16 text-primary"
					size={64}
					weight="duotone"
				/>
			</div>
			<h3 className="mb-4 font-bold text-2xl">Start Building Together</h3>
			<p className="mb-8 max-w-md text-muted-foreground">
				Organizations help you collaborate with your team and manage projects
				more effectively. Create your first organization to get started.
			</p>
			<div className="rounded-lg border border-dashed bg-muted/20 p-6">
				<div className="flex items-center justify-center gap-3 text-muted-foreground text-sm">
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 rounded-full bg-primary" />
						<span>Team collaboration</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 rounded-full bg-primary" />
						<span>Project management</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 rounded-full bg-primary" />
						<span>Shared resources</span>
					</div>
				</div>
			</div>
		</div>
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
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	const handleSetActive = (organizationId: string) => {
		setActiveOrganization(organizationId);
	};

	const handleDelete = (organizationId: string, organizationName: string) => {
		setConfirmDelete({ id: organizationId, name: organizationName });
	};

	const handleCreateOrganization = () => {
		setShowCreateDialog(true);
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
			<div className="p-6">
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{Array.from({ length: 8 }).map((_, i) => (
						<OrganizationSkeleton key={i.toString()} />
					))}
				</div>
			</div>
		);
	}

	if (!organizations || organizations.length === 0) {
		return <EmptyState />;
	}

	return (
		<div className="p-6">
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

							<CardContent className="p-6">
								<div className="space-y-6">
									{/* Organization Info */}
									<div className="flex items-start gap-4">
										<Avatar className="h-12 w-12 flex-shrink-0 border border-border/30">
											<AvatarImage alt={org.name} src={org.logo || undefined} />
											<AvatarFallback className="bg-accent font-medium text-sm">
												{getOrganizationInitials(org.name)}
											</AvatarFallback>
										</Avatar>
										<div className="min-w-0 flex-1">
											<h3 className="truncate font-semibold text-base">
												{org.name}
											</h3>
											<p className="truncate text-muted-foreground text-sm">
												@{org.slug}
											</p>
											<div className="mt-2 flex items-center gap-1">
												<CalendarIcon
													className="h-4 w-4 text-muted-foreground"
													size={16}
												/>
												<span className="text-muted-foreground text-sm">
													Created {dayjs(org.createdAt).fromNow()}
												</span>
											</div>
										</div>
									</div>

									{/* Actions */}
									<div className="space-y-3">
										{isActive ? (
											<Button
												className="h-10 w-full rounded font-medium"
												disabled
												variant="secondary"
											>
												<CheckIcon className="mr-2 h-4 w-4" size={16} />
												Current Organization
											</Button>
										) : (
											<Button
												className="h-10 w-full rounded font-medium"
												disabled={isSettingActiveOrganization}
												onClick={() => handleSetActive(org.id)}
											>
												{isSettingActiveOrganization ? (
													<>
														<div className="mr-2 h-4 w-4 animate-spin rounded-full border border-primary-foreground/30 border-t-primary-foreground" />
														Switching...
													</>
												) : (
													<>
														<ArrowRightIcon
															className="mr-2 h-4 w-4"
															size={16}
														/>
														Switch Organization
													</>
												)}
											</Button>
										)}

										<div className="flex items-center gap-3">
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															asChild
															className="h-10 flex-1 rounded font-medium"
															variant="outline"
														>
															<Link href="/organizations/settings">
																<GearIcon className="mr-2 h-4 w-4" size={16} />
																Settings
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
															className="h-10 w-10 rounded p-0 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
															disabled={isDeleting || isDeletingOrganization}
															onClick={() => handleDelete(org.id, org.name)}
															variant="outline"
														>
															{isDeleting ? (
																<div className="h-4 w-4 animate-spin rounded-full border border-destructive/30 border-t-destructive" />
															) : (
																<TrashIcon className="h-4 w-4" size={16} />
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

			<CreateOrganizationDialog
				isOpen={showCreateDialog}
				onClose={() => setShowCreateDialog(false)}
			/>
		</div>
	);
}
