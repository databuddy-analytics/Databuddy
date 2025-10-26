'use client';

import { authClient } from '@databuddy/auth/client';
import { SignOutIcon, TrashIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
import { Button } from '@/components/ui/button';

import { type Organization, useOrganizations } from '@/hooks/use-organizations';
import { TransferAssets } from './transfer-assets';

export function DangerZoneSettings({
	organization,
}: {
	organization: Organization;
}) {
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showLeaveDialog, setShowLeaveDialog] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);
	const [isOwner, setIsOwner] = useState<boolean | null>(null);

	const { deleteOrganizationAsync, leaveOrganizationAsync } = useOrganizations();

	useEffect(() => {
		const checkOwnership = async () => {
			if (!session?.user?.id) {
				return;
			}

			try {
				const { data: fullOrgData } =
					await authClient.organization.getFullOrganization({
						query: { organizationId: organization.id },
					});
				const member = fullOrgData?.members?.find(
					(m) => m.userId === session.user.id
				);
				setIsOwner(member?.role === 'owner');
			} catch {
				setIsOwner(false);
			}
		};

		checkOwnership();
	}, [organization.id, session?.user?.id]);

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await deleteOrganizationAsync(organization.id);
			router.push('/organizations');
		} catch (_error) {
			toast.error('Failed to delete organization');
		} finally {
			setIsDeleting(false);
			setShowDeleteDialog(false);
		}
	};

	const handleLeave = async () => {
		setIsLeaving(true);
		try {
			await leaveOrganizationAsync(organization.id);
			router.push('/organizations');
		} catch (_error) {
			toast.error('Failed to leave organization');
		} finally {
			setIsLeaving(false);
			setShowLeaveDialog(false);
		}
	};

	return (
		<div className="h-full p-6">
			<div className="space-y-8">
				{/* Content Sections */}
				<div className="space-y-8">
					{/* Transfer Assets Section */}
					<div className="rounded-lg border bg-card">
						<div className="border-b p-6">
							<h3 className="font-semibold text-lg">Transfer Assets</h3>
							<p className="text-muted-foreground text-sm">
								Move websites between your personal account and organization
							</p>
						</div>
						<div className="p-6">
							<TransferAssets organizationId={organization.id} />
						</div>
					</div>

					{/* Leave/Delete Organization Section */}
					<div className="rounded-lg border border-destructive/20 bg-destructive/5">
						<div className="p-6">
							<div className="space-y-4">
								<div>
									<h3 className="font-semibold text-destructive text-lg">
										{isOwner === null
											? 'Loading...'
											: isOwner
												? 'Delete Organization'
												: 'Leave Organization'}
									</h3>
									<p className="text-destructive/80 text-sm">
										{isOwner === null
											? 'Checking permissions...'
											: isOwner
												? 'Once you delete an organization, there is no going back. Please be certain.'
												: 'You will lose access to this organization and all its resources.'}
									</p>
								</div>

								<div className="flex justify-end">
									{isOwner === null ? (
										<Button disabled size="default" variant="destructive">
											<div className="mr-2 h-4 w-4 animate-spin rounded-full border border-destructive-foreground/30 border-t-destructive-foreground" />
											Loading...
										</Button>
									) : isOwner ? (
										<Button
											onClick={() => setShowDeleteDialog(true)}
											size="default"
											variant="destructive"
										>
											<TrashIcon className="mr-2 h-4 w-4" size={16} />
											Delete Organization
										</Button>
									) : (
										<Button
											onClick={() => setShowLeaveDialog(true)}
											size="default"
											variant="destructive"
										>
											<SignOutIcon className="mr-2 h-4 w-4" size={16} />
											Leave Organization
										</Button>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. This will permanently delete the
							organization "{organization.name}" and remove all associated data.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={isDeleting}
							onClick={handleDelete}
						>
							{isDeleting ? (
								<>
									<div className="mr-2 h-4 w-4 animate-spin rounded-full border border-destructive-foreground/30 border-t-destructive-foreground" />
									Deleting...
								</>
							) : (
								'Delete Organization'
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog onOpenChange={setShowLeaveDialog} open={showLeaveDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Leave organization?</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to leave "{organization.name}"? You will lose
							access to this organization and all its resources.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={isLeaving}
							onClick={handleLeave}
						>
							{isLeaving ? (
								<>
									<div className="mr-2 h-4 w-4 animate-spin rounded-full border border-destructive-foreground/30 border-t-destructive-foreground" />
									Leaving...
								</>
							) : (
								'Leave Organization'
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
