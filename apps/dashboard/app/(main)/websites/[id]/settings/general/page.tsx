'use client';

import { GearIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { WebsiteDialog } from '@/components/website-dialog';
import { useDeleteWebsite, useWebsite } from '@/hooks/use-websites';
import { TOAST_MESSAGES } from '../../_components/shared/tracking-constants';
import { DeleteWebsiteDialog } from '../_components/delete-dialog';

export default function GeneralSettingsPage() {
	const params = useParams();
	const router = useRouter();
	const websiteId = params.id as string;
	const { data: websiteData, refetch } = useWebsite(websiteId);
	const deleteWebsiteMutation = useDeleteWebsite();

	const [showEditDialog, setShowEditDialog] = useState(false);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);

	const handleWebsiteUpdated = useCallback(() => {
		setShowEditDialog(false);
		refetch();
	}, [refetch]);

	const handleDeleteWebsite = useCallback(async () => {
		if (!websiteData) {
			return;
		}
		try {
			await toast.promise(
				deleteWebsiteMutation.mutateAsync({ id: websiteId }),
				{
					loading: TOAST_MESSAGES.WEBSITE_DELETING,
					success: () => {
						router.push('/websites');
						return TOAST_MESSAGES.WEBSITE_DELETED;
					},
					error: TOAST_MESSAGES.WEBSITE_DELETE_ERROR,
				}
			);
		} catch {
			// handled by toast
		}
	}, [websiteData, websiteId, deleteWebsiteMutation, router]);

	if (!websiteData) {
		return (
			<div className="flex h-64 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="h-[89px] border-b">
				<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-3">
							<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
								<GearIcon className="h-5 w-5 text-primary" />
							</div>
							<div className="min-w-0 flex-1">
								<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
									General
								</h1>
								<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
									Manage name, domain, and basic settings
								</p>
							</div>
						</div>
					</div>
					{/* Right-side actions (optional) */}
				</div>

				{/* Content */}
				<div className="flex min-h-0 flex-1 flex-col">
					{/* Name */}
					<section className="border-b px-4 py-5 sm:px-6">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<Label className="mb-1 block font-medium text-sm">Name</Label>
								<p className="truncate text-muted-foreground text-xs">
									{websiteData.name || 'Not set'}
								</p>
							</div>
							<Button
								onClick={() => setShowEditDialog(true)}
								size="sm"
								variant="outline"
							>
								<PencilSimpleIcon className="mr-2 h-4 w-4" /> Edit
							</Button>
						</div>
					</section>

					{/* Domain */}
					<section className="border-b px-4 py-5 sm:px-6">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<Label className="mb-1 block font-medium text-sm">Domain</Label>
								<p className="truncate text-muted-foreground text-xs">
									{websiteData.domain || 'Not set'}
								</p>
							</div>
							<Button
								onClick={() => setShowEditDialog(true)}
								size="sm"
								variant="outline"
							>
								<PencilSimpleIcon className="mr-2 h-4 w-4" /> Edit
							</Button>
						</div>
					</section>

					{/* Danger Zone */}
					<section className="px-4 py-5 sm:px-6">
						<div className="flex items-center justify-between gap-3">
							<div>
								<h2 className="font-medium text-sm">Danger Zone</h2>
								<p className="text-muted-foreground text-xs">
									Permanently delete this website and all its data
								</p>
							</div>
							<Button
								onClick={() => setShowDeleteDialog(true)}
								size="sm"
								variant="destructive"
							>
								<TrashIcon className="mr-2 h-4 w-4" /> Delete Website
							</Button>
						</div>
					</section>
				</div>

				{/* Dialogs */}
				<WebsiteDialog
					onOpenChange={setShowEditDialog}
					onSave={handleWebsiteUpdated}
					open={showEditDialog}
					website={websiteData}
				/>
				<DeleteWebsiteDialog
					isDeleting={deleteWebsiteMutation.isPending}
					onConfirmDelete={handleDeleteWebsite}
					onOpenChange={setShowDeleteDialog}
					open={showDeleteDialog}
					websiteData={websiteData}
				/>
			</div>
		</div>
	);
}
