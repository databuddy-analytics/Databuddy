'use client';

import {
	FloppyDiskIcon,
	GearIcon,
	GlobeIcon,
	KeyIcon,
	TrashIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
// import { ApiKeyCreateDialog } from '@/components/organizations/api-key-create-dialog';
// import { ApiKeyDetailDialog } from '@/components/organizations/api-key-detail-dialog';
import { ApiKeyList } from '@/components/organizations/api-key-list';
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

// biome-ignore lint: Settings component needs to handle multiple tabs
export function SettingsTab({ organization }: SettingsTabProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [name, setName] = useState(organization.name);
	const [slug, setSlug] = useState(organization.slug);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const { updateOrganizationAsync, deleteOrganizationAsync } =
		useOrganizations();

	// Get settings subtab from URL
	const activeTab = searchParams.get('settings') || 'general';

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
				router.push(
					`/organizations/${slug}?tab=settings&settings=${activeTab}`
				);
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

	// General Settings Content
	if (activeTab === 'general') {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<div className="rounded border p-2">
								<GearIcon
									className="h-5 w-5 not-dark:text-primary"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<CardTitle>Organization Details</CardTitle>
								<CardDescription>
									Update your organization's basic information and settings.
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-6">
						{/* Logo Upload Section */}
						<div className="space-y-4">
							<OrganizationLogoUploader organization={organization} />
						</div>

						{/* Name and Slug Section */}
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="name">Organization Name</Label>
								<Input
									id="name"
									onChange={(e) => setName(e.target.value)}
									placeholder="Enter organization name"
									value={name}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="slug">Organization Slug</Label>
								<Input
									id="slug"
									onChange={(e) => handleSlugChange(e.target.value)}
									placeholder="organization-slug"
									value={slug}
								/>
								<p className="text-muted-foreground text-xs">
									This will be used in your organization URL
								</p>
							</div>
						</div>

						{/* Save Button */}
						{hasChanges && (
							<div className="flex justify-end">
								<Button
									className="rounded"
									disabled={isSaving}
									onClick={handleSave}
								>
									{isSaving ? (
										<>
											<div className="mr-2 h-4 w-4 animate-spin rounded-full border border-primary-foreground/30 border-t-primary-foreground" />
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
						)}
					</CardContent>
				</Card>
			</div>
		);
	}

	// Websites Management Content
	if (activeTab === 'websites') {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<div className="rounded border p-2">
								<GlobeIcon
									className="h-5 w-5 not-dark:text-primary"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<CardTitle>Website Management</CardTitle>
								<CardDescription>
									Manage websites associated with this organization.
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						{isLoadingWebsites ? (
							<div className="space-y-4">
								<Skeleton className="h-16 w-full" />
								<Skeleton className="h-16 w-full" />
								<Skeleton className="h-16 w-full" />
							</div>
						) : websites && websites.length > 0 ? (
							<div className="space-y-4">
								{websites.map((website) => (
									<div
										className="flex items-center justify-between rounded border p-4"
										key={website.id}
									>
										<div>
											<h4 className="font-medium">{website.name}</h4>
											<p className="text-muted-foreground text-sm">
												{website.domain}
											</p>
										</div>
										<Badge variant="secondary">Active</Badge>
									</div>
								))}
							</div>
						) : (
							<div className="py-8 text-center">
								<GlobeIcon
									className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
									size={48}
									weight="duotone"
								/>
								<h3 className="mb-2 font-semibold">No websites found</h3>
								<p className="text-muted-foreground text-sm">
									This organization doesn't have any websites yet.
								</p>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Transfer Assets Section */}
				<TransferAssets organizationId={organization.id} />
			</div>
		);
	}

	// API Keys Management Content
	if (activeTab === 'apikeys') {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<div className="rounded border p-2">
									<KeyIcon
										className="h-5 w-5 not-dark:text-primary"
										size={16}
										weight="duotone"
									/>
								</div>
								<div>
									<CardTitle>API Keys</CardTitle>
									<CardDescription>
										Create and manage API keys for this organization.
									</CardDescription>
								</div>
							</div>
							<Button
								className="rounded"
								disabled
								size="sm"
								title="Coming soon"
							>
								Create API Key
							</Button>
						</div>
					</CardHeader>
					<CardContent>
						<ApiKeyList organizationId={organization.id} />
					</CardContent>
				</Card>

				{/* API Key Dialogs - TODO: Fix dialog props */}
			</div>
		);
	}

	// Danger Zone Content
	if (activeTab === 'danger') {
		return (
			<div className="space-y-6">
				<Card className="border-destructive/20">
					<CardHeader>
						<div className="flex items-center gap-2">
							<div className="rounded border border-destructive/20 bg-destructive/10 p-2">
								<WarningIcon
									className="h-5 w-5 text-destructive"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<CardTitle className="text-destructive">Danger Zone</CardTitle>
								<CardDescription>
									Irreversible and destructive actions for this organization.
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-6">
						{/* Transfer Assets Section */}
						<TransferAssets organizationId={organization.id} />

						{/* Delete Organization Section */}
						<div className="rounded border border-destructive/20 bg-destructive/5 p-4">
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<h4 className="font-medium text-destructive">
										Delete Organization
									</h4>
									<p className="mt-1 text-destructive/80 text-sm">
										Once you delete an organization, there is no going back.
										Please be certain.
									</p>
								</div>
								<Button
									className="ml-4 rounded"
									onClick={() => setShowDeleteDialog(true)}
									size="sm"
									variant="destructive"
								>
									<TrashIcon className="mr-2 h-4 w-4" size={16} />
									Delete Organization
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Delete Confirmation Dialog */}
				<AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
							<AlertDialogDescription>
								This action cannot be undone. This will permanently delete the
								organization "{organization.name}" and remove all associated
								data.
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
			</div>
		);
	}

	// Default fallback (should not happen)
	return (
		<Card className="p-6">
			<div className="text-center">
				<GearIcon
					className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
					size={48}
					weight="duotone"
				/>
				<h3 className="mb-2 font-semibold text-lg">Settings</h3>
				<p className="text-muted-foreground text-sm">
					Select a settings category from the sidebar.
				</p>
			</div>
		</Card>
	);
}
