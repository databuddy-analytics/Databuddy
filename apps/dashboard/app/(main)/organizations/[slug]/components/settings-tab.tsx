'use client';

import {
	FloppyDiskIcon,
	GearIcon,
	GlobeIcon,
	TrashIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { type Organization, useOrganizations } from '@/hooks/use-organizations';
import { trpc } from '@/lib/trpc';
import { OrganizationLogoUploader } from './organization-logo-uploader';
import { TransferAssets } from './transfer-assets';

interface SettingsTabProps {
	organization: Organization;
}

export function SettingsTab({ organization }: SettingsTabProps) {
	const router = useRouter();
	const [name, setName] = useState(organization.name);
	const [slug, setSlug] = useState(organization.slug);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const { updateOrganizationAsync, deleteOrganizationAsync } =
		useOrganizations();

	// Fetch organization websites using tRPC
	const { data: websites, isLoading: isLoadingWebsites } =
		trpc.websites.list.useQuery({
			organizationId: organization.id,
		});

	const cleanSlug = (value: string) => {
		return value
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
	};

	const handleSlugChange = (value: string) => {
		setSlug(cleanSlug(value));
	};

	const handleSave = async () => {
		if (!(name.trim() && slug.trim())) {
			toast.error('Name and slug are required');
			return;
		}

		setIsSaving(true);
		try {
			await updateOrganizationAsync({
				organizationId: organization.id,
				data: {
					name: name.trim(),
					slug: slug.trim(),
				},
			});

			// If slug changed, redirect to new URL
			if (slug !== organization.slug) {
				router.push(`/organizations/${slug}`);
			}
		} catch (_error) {
			toast.error('Failed to update organization');
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await deleteOrganizationAsync(organization.id);
			toast.success('Organization deleted successfully');
			router.push('/organizations');
		} catch (_error) {
			toast.error('Failed to delete organization');
		} finally {
			setIsDeleting(false);
			setShowDeleteDialog(false);
		}
	};

	const hasChanges = name !== organization.name || slug !== organization.slug;

	return (
		<div className="space-y-8">
			{/* Organization Settings */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<GearIcon
							className="h-5 w-5 not-dark:text-primary"
							size={16}
							weight="duotone"
						/>
						Organization Settings
					</CardTitle>
					<CardDescription>
						Update your organization's basic information
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* Logo Section */}
					<OrganizationLogoUploader organization={organization} />

					{/* Name */}
					<div className="space-y-2">
						<Label htmlFor="org-name">Organization Name</Label>
						<Input
							className="rounded"
							id="org-name"
							onChange={(e) => setName(e.target.value)}
							placeholder="My Organization"
							value={name}
						/>
					</div>

					{/* Slug */}
					<div className="space-y-2">
						<Label htmlFor="org-slug">Organization Slug</Label>
						<Input
							className="rounded font-mono"
							id="org-slug"
							onChange={(e) => handleSlugChange(e.target.value)}
							placeholder="my-organization"
							value={slug}
						/>
						<p className="text-muted-foreground text-xs">
							This will be used in your organization URL: /organizations/
							{slug || 'your-slug'}
						</p>
					</div>

					{/* Save Button */}
					<div className="flex justify-end pt-4">
						<Button
							className="rounded"
							disabled={!hasChanges || isSaving}
							onClick={handleSave}
						>
							{isSaving ? (
								<>
									<div className="mr-2 h-3 w-3 animate-spin rounded-full border border-primary-foreground/30 border-t-primary-foreground" />
									Saving...
								</>
							) : (
								<>
									<FloppyDiskIcon className="mr-2 h-4 w-4" size={16} />
									Save Changes
								</>
							)}
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Organization Websites */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<GlobeIcon
							className="h-5 w-5 not-dark:text-primary"
							size={16}
							weight="duotone"
						/>
						Organization Websites
					</CardTitle>
					<CardDescription>
						Websites that belong to this organization
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isLoadingWebsites ? (
						<div className="space-y-3">
							{[1, 2, 3].map((i) => (
								<div
									className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/50 p-3"
									key={i}
								>
									<Skeleton className="h-10 w-10 rounded-lg" />
									<div className="flex-1 space-y-2">
										<Skeleton className="h-4 w-32" />
										<Skeleton className="h-3 w-24" />
									</div>
								</div>
							))}
						</div>
					) : websites && websites.length > 0 ? (
						<div className="space-y-3">
							{websites.map((website) => (
								<div
									className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-3"
									key={website.id}
								>
									<div className="flex items-center gap-3">
										<div className="rounded bg-primary/10 p-2">
											<GlobeIcon className="h-4 w-4 text-primary" size={16} />
										</div>
										<div>
											<p className="font-medium text-foreground text-sm">
												{website.name}
											</p>
											<p className="text-muted-foreground text-xs">
												{website.domain}
											</p>
										</div>
									</div>
									<Badge className="px-2 py-1 text-xs" variant="secondary">
										{website.status}
									</Badge>
								</div>
							))}
						</div>
					) : (
						<div className="mx-auto py-8 text-center">
							<GlobeIcon
								className="mx-auto mb-2 h-8 w-8 not-dark:text-primary"
								size={32}
								weight="duotone"
							/>
							<p className="mx-auto text-muted-foreground text-sm">
								No websites in this organization
							</p>
							<p className="mx-auto mt-1 text-muted-foreground text-xs">
								Transfer websites from your personal account or create new ones
							</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Danger Zone */}
			<Card className="border-destructive/20 bg-destructive/5">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-destructive">
						<WarningIcon className="h-5 w-5" size={16} weight="duotone" />
						Danger Zone
					</CardTitle>
					<CardDescription className="text-destructive/70">
						Irreversible actions that will permanently affect your organization
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<TransferAssets organizationId={organization.id} />

					<div className="space-y-3">
						<div>
							<h4 className="mb-2 font-medium text-foreground">
								Delete Organization
							</h4>
							<p className="text-muted-foreground text-sm">
								Permanently delete this organization and all associated data.
								This action cannot be undone. All team members will lose access
								and any shared resources will be removed.
							</p>
						</div>
						<Button
							className="rounded-lg"
							onClick={() => setShowDeleteDialog(true)}
							variant="destructive"
						>
							<TrashIcon className="mr-2 h-4 w-4" size={16} />
							Delete Organization
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Delete Confirmation Dialog */}
			<AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2 text-destructive">
							<WarningIcon className="h-5 w-5" size={16} weight="duotone" />
							Delete Organization
						</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete{' '}
							<strong>{organization.name}</strong>?
							<br />
							<br />
							This action will:
							<ul className="mt-2 list-inside list-disc space-y-1">
								<li>Permanently delete the organization</li>
								<li>Remove all team members</li>
								<li>Delete all shared resources</li>
								<li>Cancel all pending invitations</li>
							</ul>
							<br />
							<strong>This action cannot be undone.</strong>
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
									<div className="mr-2 h-3 w-3 animate-spin rounded-full border border-destructive-foreground/30 border-t-destructive-foreground" />
									Deleting...
								</>
							) : (
								<>
									<TrashIcon className="mr-2 h-4 w-4" size={16} />
									Delete Organization
								</>
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
