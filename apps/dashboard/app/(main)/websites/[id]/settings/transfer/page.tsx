'use client';

import {
	ArrowRightIcon,
	ArrowSquareOutIcon,
	BuildingsIcon,
	InfoIcon,
	UserIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useOrganizations, type Organization } from '@/hooks/use-organizations';
import { useWebsiteTransferToOrg } from '@/hooks/use-website-transfer-to-org';
import { useWebsite } from '@/hooks/use-websites';

function TransferPageContent() {
	const params = useParams();
	const router = useRouter();
	const websiteId = params.id as string;
	const { data: websiteData, isLoading: isLoadingWebsite } = useWebsite(websiteId);
	const { organizations, isLoading: isLoadingOrganizations } = useOrganizations();
	const { transferWebsiteToOrg, isTransferring } = useWebsiteTransferToOrg();

	const [selectedOrgId, setSelectedOrgId] = useState<string>('');
	const [showConfirmDialog, setShowConfirmDialog] = useState(false);

	const handleTransfer = useCallback(() => {
		if (!selectedOrgId || !websiteData) {
			return;
		}

		const targetOrg = organizations?.find((org) => org.id === selectedOrgId);
		if (!targetOrg) {
			toast.error('Selected organization not found');
			return;
		}

		transferWebsiteToOrg(
			{
				websiteId,
				targetOrganizationId: selectedOrgId,
			},
			{
				onSuccess: () => {
					toast.success(
						`Website "${websiteData.name}" has been transferred to "${targetOrg.name}"`
					);
					setShowConfirmDialog(false);
					setSelectedOrgId('');
					// Redirect to websites page after successful transfer
					setTimeout(() => {
						router.push('/websites');
					}, 500);
				},
				onError: (error) => {
					toast.error(
						error?.message || 'Failed to transfer website. Please try again.'
					);
				},
			}
		);
	}, [selectedOrgId, websiteData, organizations, transferWebsiteToOrg, websiteId, router]);

	if (isLoadingWebsite || isLoadingOrganizations || !websiteData) {
		return (
			<div className="flex h-full flex-col">
				<div className="h-[89px] border-b">
					<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-3">
								<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
									<ArrowSquareOutIcon className="h-5 w-5 text-primary" />
								</div>
								<div className="min-w-0 flex-1">
									<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
										Transfer Website
									</h1>
									<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
										Move this website to a different organization
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
				<div className="flex flex-1 items-center justify-center">
					<div className="flex flex-col items-center gap-3">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
						<p className="text-muted-foreground text-sm">Loading transfer options...</p>
					</div>
				</div>
			</div>
		);
	}

	const currentOrg = websiteData.organizationId
		? organizations?.find((org: Organization) => org.id === websiteData.organizationId) || {
			id: websiteData.organizationId,
			name: 'Organization',
			slug: '',
			createdAt: new Date(),
		}
		: null;

	const availableOrgs = organizations?.filter(
		(org: Organization) => org.id !== websiteData.organizationId
	) || [];

	const selectedOrg = selectedOrgId
		? organizations?.find((org: Organization) => org.id === selectedOrgId) || null
		: null;

	return (
		<div className="flex h-full flex-col">
			<div className="h-[89px] border-b">
				<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-3">
							<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
								<ArrowSquareOutIcon className="h-5 w-5 text-primary" />
							</div>
							<div className="min-w-0 flex-1">
								<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
									Transfer Website
								</h1>
								<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
									Move this website to a different organization
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="flex min-h-0 flex-1 flex-col">
				{/* Transfer Overview */}
				<section className="border-b px-4 py-5 sm:px-6">
					<div className="space-y-4">
						<div>
							<Label className="mb-3 block font-medium text-sm">
								Transfer Overview
							</Label>
							<div className="flex items-center gap-3">
								{/* Current Organization */}
								<div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border bg-muted/50 p-3">
									<BuildingsIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
									<div className="min-w-0 flex-1">
										<p className="mb-0.5 text-muted-foreground text-xs">From</p>
										<p className="truncate font-medium text-sm">
											{currentOrg?.name || 'Personal'}
										</p>
									</div>
								</div>

								{/* Arrow */}
								<ArrowRightIcon className="h-5 w-5 shrink-0 text-muted-foreground" />

								{/* Target Organization */}
								<div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border bg-muted/50 p-3">
									<BuildingsIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
									<div className="min-w-0 flex-1">
										<p className="mb-0.5 text-muted-foreground text-xs">To</p>
										<p className="truncate font-medium text-sm">
											{selectedOrg?.name || 'Select organization'}
										</p>
									</div>
								</div>
							</div>
						</div>

						{/* Info Alert */}
						<Alert className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-200">
							<InfoIcon className="h-4 w-4" />
							<AlertDescription className="text-xs">
								This will transfer ownership and all associated data to the selected
								organization. Members of the new organization will gain access.
							</AlertDescription>
						</Alert>
					</div>
				</section>

				{/* Select Organization */}
				<section className="border-b px-4 py-5 sm:px-6">
					<div className="space-y-3">
						<div className="space-y-2">
							<Label htmlFor="target-org" className="font-medium text-sm">
								Select Target Organization
							</Label>
							<Select
								disabled={availableOrgs.length === 0}
								onValueChange={setSelectedOrgId}
								value={selectedOrgId}
							>
								<SelectTrigger id="target-org">
									<SelectValue placeholder="Choose an organization" />
								</SelectTrigger>
								<SelectContent>
									{availableOrgs.length > 0 ? (
										availableOrgs.map((org: Organization) => (
											<SelectItem key={org.id} value={org.id}>
												<div className="flex items-center gap-2">
													<BuildingsIcon className="h-4 w-4" />
													<span>{org.name}</span>
												</div>
											</SelectItem>
										))
									) : (
										<SelectItem disabled value="no-orgs">
											No organizations available
										</SelectItem>
									)}
								</SelectContent>
							</Select>
						</div>

						{availableOrgs.length === 0 && (
							<Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
								<WarningIcon className="h-4 w-4" />
								<AlertDescription className="text-xs">
									No other organizations available. You need to create a new
									organization or be invited to one before you can transfer this
									website.
								</AlertDescription>
							</Alert>
						)}
					</div>
				</section>

				{/* Warning */}
				{selectedOrgId && (
					<section className="border-b px-4 py-5 sm:px-6">
						<Alert className="border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-200">
							<WarningIcon className="h-4 w-4" />
							<AlertDescription className="text-xs">
								<strong className="font-semibold">Important:</strong> This action is
								irreversible. All data, settings, and analytics will be transferred
								to <strong className="font-semibold">{selectedOrg?.name}</strong>.
								Ensure you have the necessary permissions on both organizations.
							</AlertDescription>
						</Alert>
					</section>
				)}

				{/* Actions */}
				<section className="mt-auto border-t px-4 py-5 sm:px-6">
					<div className="flex items-center justify-between gap-3">
						<p className="text-muted-foreground text-xs">
							{selectedOrgId
								? 'Review the details and confirm to proceed'
								: 'Select a target organization to continue'}
						</p>
						<Button
							disabled={!selectedOrgId || isTransferring}
							onClick={() => setShowConfirmDialog(true)}
							size="sm"
						>
							<ArrowSquareOutIcon className="mr-2 h-4 w-4" />
							Transfer Website
						</Button>
					</div>
				</section>
			</div>

			{/* Confirmation Dialog */}
			<Dialog onOpenChange={setShowConfirmDialog} open={showConfirmDialog}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle className="text-xl">Confirm Website Transfer</DialogTitle>
						<DialogDescription className="text-sm">
							This action cannot be undone. Please review the transfer details
							carefully before proceeding.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-6 py-6">
						{/* Website Info */}
						<div className="space-y-2">
							<Label className="text-muted-foreground text-xs uppercase tracking-wide">
								Website
							</Label>
							<div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
									<span className="font-semibold text-primary text-sm">
										{websiteData.name?.charAt(0).toUpperCase() || websiteData.domain.charAt(0).toUpperCase()}
									</span>
								</div>
								<div className="min-w-0 flex-1">
									<p className="font-semibold text-sm">{websiteData.name || websiteData.domain}</p>
									<p className="truncate text-muted-foreground text-xs">
										{websiteData.domain}
									</p>
								</div>
							</div>
						</div>

						{/* Transfer Flow */}
						<div className="space-y-2">
							<Label className="text-muted-foreground text-xs uppercase tracking-wide">
								Transfer Details
							</Label>
							<div className="flex items-center gap-4">
								{/* From Organization */}
								<div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border bg-muted/30 p-4">
									<div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background">
										{currentOrg?.logo ? (
											<img
												alt={currentOrg.name}
												className="h-full w-full object-cover"
												src={currentOrg.logo}
											/>
										) : currentOrg ? (
											<BuildingsIcon className="h-5 w-5 text-muted-foreground" />
										) : (
											<UserIcon className="h-5 w-5 text-muted-foreground" />
										)}
									</div>
									<div className="min-w-0 flex-1">
										<p className="mb-0.5 text-muted-foreground text-xs">From</p>
										<p className="truncate font-medium text-sm">
											{currentOrg?.name || 'Personal'}
										</p>
									</div>
								</div>

								{/* Arrow */}
								<div className="flex shrink-0 items-center justify-center">
									<ArrowRightIcon className="h-5 w-5 text-muted-foreground" weight="bold" />
								</div>

								{/* To Organization */}
								<div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
									<div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/20 bg-background">
										{selectedOrg?.logo ? (
											<img
												alt={selectedOrg.name}
												className="h-full w-full object-cover"
												src={selectedOrg.logo}
											/>
										) : (
											<BuildingsIcon className="h-5 w-5 text-primary" />
										)}
									</div>
									<div className="min-w-0 flex-1">
										<p className="mb-0.5 text-muted-foreground text-xs">To</p>
										<p className="truncate font-medium text-primary text-sm">
											{selectedOrg?.name}
										</p>
									</div>
								</div>
							</div>
						</div>

						{/* Warning */}
						<Alert className="border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-200">
							<WarningIcon className="h-4 w-4" weight="duotone" />
							<AlertDescription className="text-xs leading-relaxed">
								This will immediately transfer all ownership, data, settings, and
								analytics to{' '}
								<strong className="font-semibold">{selectedOrg?.name}</strong>.
								Members of that organization will gain full access.
							</AlertDescription>
						</Alert>
					</div>

					<DialogFooter className="gap-3">
						<Button
							className="min-w-[100px]"
							disabled={isTransferring}
							onClick={() => setShowConfirmDialog(false)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							className="min-w-[140px]"
							disabled={isTransferring}
							onClick={handleTransfer}
						>
							{isTransferring ? (
								<>
									<div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
									Transferring...
								</>
							) : (
								<>
									<ArrowSquareOutIcon className="mr-2 h-4 w-4" weight="fill" />
									Confirm Transfer
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default function TransferPage() {
	return (
		<Suspense
			fallback={
				<div className="flex h-full flex-col">
					<div className="h-[89px] border-b">
						<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-3">
									<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
										<ArrowSquareOutIcon className="h-5 w-5 text-primary" />
									</div>
									<div className="min-w-0 flex-1">
										<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
											Transfer Website
										</h1>
										<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
											Move this website to a different organization
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div className="flex flex-1 items-center justify-center">
						<div className="flex flex-col items-center gap-3">
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
							<p className="text-muted-foreground text-sm">Loading...</p>
						</div>
					</div>
				</div>
			}
		>
			<TransferPageContent />
		</Suspense>
	);
}
