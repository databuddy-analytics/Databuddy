"use client";

import {
	ArrowSquareOutIcon,
	GearIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { WebsiteDialog } from "@/components/website-dialog";
import { useDeleteWebsite, useWebsite } from "@/hooks/use-websites";
import { PageHeader } from "../../../_components/page-header";
import { TOAST_MESSAGES } from "../../_components/shared/tracking-constants";
import { DeleteWebsiteDialog } from "../_components/delete-dialog";

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
						router.push("/websites");
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
			<PageHeader
				description="Manage name, domain, and basic settings"
				icon={<GearIcon />}
				title="General"
			/>
			{/* Right-side actions (optional) */}

			{/* Content */}
			<div className="flex min-h-0 flex-1 flex-col">
				{/* Name */}
				<section className="border-b px-4 py-5 sm:px-6">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<Label className="block font-medium text-sm">Name</Label>
							<p className="truncate text-muted-foreground text-sm">
								{websiteData.name || "Not set"}
							</p>
						</div>
						<Button
							onClick={() => setShowEditDialog(true)}
							size="sm"
							variant="secondary"
						>
							<PencilSimpleIcon className="size-3.5" /> Edit
						</Button>
					</div>
				</section>

				{/* Domain */}
				<section className="border-b px-4 py-5 sm:px-6">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<Label className="block font-medium text-sm">Domain</Label>
							<p className="truncate text-muted-foreground text-sm">
								{websiteData.domain || "Not set"}
							</p>
						</div>
						<Button
							onClick={() => setShowEditDialog(true)}
							size="sm"
							variant="secondary"
						>
							<PencilSimpleIcon className="size-3.5" /> Edit
						</Button>
					</div>
				</section>

				<section className="border-b px-4 py-5 sm:px-6">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h2 className="font-medium text-sm">Transfer Website</h2>
							<p className="text-muted-foreground text-sm">
								Move this website to a different organization
							</p>
						</div>
						<Button
							onClick={() =>
								router.push(`/websites/${websiteId}/settings/transfer`)
							}
							size="sm"
							variant="secondary"
						>
							<ArrowSquareOutIcon className="size-3.5" /> Transfer
						</Button>
					</div>
				</section>

				{/* Danger Zone */}
				<section className="px-4 py-5 sm:px-6">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h2 className="font-medium text-sm">Danger Zone</h2>
							<p className="text-muted-foreground text-sm">
								Permanently delete this website and all its data
							</p>
						</div>
						<Button
							onClick={() => setShowDeleteDialog(true)}
							size="sm"
							variant="destructive"
						>
							<TrashIcon className="size-3.5" /> Delete Website
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
	);
}
