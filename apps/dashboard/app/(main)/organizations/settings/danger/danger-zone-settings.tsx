"use client";

import { authClient } from "@databuddy/auth/client";
import {
	BookOpenIcon,
	SignOutIcon,
	TrashIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { type Organization, useOrganizations } from "@/hooks/use-organizations";
import { TransferAssets } from "./transfer-assets";

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

	const { deleteOrganizationAsync, leaveOrganizationAsync } =
		useOrganizations();

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
				setIsOwner(member?.role === "owner");
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
			router.push("/organizations");
		} catch {
			toast.error("Failed to delete organization");
		} finally {
			setIsDeleting(false);
			setShowDeleteDialog(false);
		}
	};

	const handleLeave = async () => {
		setIsLeaving(true);
		try {
			await leaveOrganizationAsync(organization.id);
			router.push("/organizations");
		} catch {
			toast.error("Failed to leave organization");
		} finally {
			setIsLeaving(false);
			setShowLeaveDialog(false);
		}
	};

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			{/* Main Content */}
			<div className="flex flex-col gap-6 border-b p-5 lg:border-b-0 lg:border-r">
				{/* Transfer Assets Section */}
				<section>
					<div className="mb-4">
						<h3 className="font-semibold">Transfer Assets</h3>
						<p className="text-muted-foreground text-sm">
							Move websites between your personal account and this organization
						</p>
					</div>
					<TransferAssets organizationId={organization.id} />
				</section>

				{/* Destructive Action */}
				<section className="mt-auto rounded border border-destructive/20 bg-destructive/5 p-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<h3 className="font-semibold text-destructive">
								{isOwner === null
									? "Loading..."
									: isOwner
										? "Delete Organization"
										: "Leave Organization"}
							</h3>
							<p className="mt-1 text-destructive/70 text-sm">
								{isOwner === null
									? "Checking permissions..."
									: isOwner
										? "Permanently delete this organization and all its data"
										: "You will lose access to all resources"}
							</p>
						</div>
						{isOwner === null ? (
							<Button disabled size="sm" variant="destructive">
								<div className="mr-2 h-3 w-3 animate-spin rounded-full border border-destructive-foreground/30 border-t-destructive-foreground" />
								Loading
							</Button>
						) : isOwner ? (
							<Button
								onClick={() => setShowDeleteDialog(true)}
								size="sm"
								variant="destructive"
							>
								<TrashIcon className="mr-2" size={14} />
								Delete
							</Button>
						) : (
							<Button
								onClick={() => setShowLeaveDialog(true)}
								size="sm"
								variant="destructive"
							>
								<SignOutIcon className="mr-2" size={14} />
								Leave
							</Button>
						)}
					</div>
				</section>
			</div>

			{/* Sidebar */}
			<aside className="flex flex-col gap-4 bg-muted/30 p-5">
				{/* Warning Card */}
				<div className="flex items-start gap-3 rounded border border-amber-500/20 bg-amber-500/5 p-4">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-amber-500/10">
						<WarningIcon className="text-amber-600" size={16} weight="fill" />
					</div>
					<div>
						<p className="font-medium text-amber-700 text-sm dark:text-amber-400">
							Danger Zone
						</p>
						<p className="mt-1 text-amber-600/80 text-xs dark:text-amber-500/80">
							Actions here can result in permanent data loss
						</p>
					</div>
				</div>

				{/* Docs Link */}
				<Button asChild className="w-full justify-start" variant="outline">
					<a
						href="https://www.databuddy.cc/docs/getting-started"
						rel="noopener noreferrer"
						target="_blank"
					>
						<BookOpenIcon className="mr-2" size={16} />
						Documentation
					</a>
				</Button>

				{/* Tip */}
				<div className="mt-auto rounded border border-dashed bg-background/50 p-4">
					<p className="mb-2 font-medium text-sm">Need help?</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						Contact support if you need to recover deleted data or transfer
						ownership of an organization.
					</p>
				</div>
			</aside>

			{/* Delete Dialog */}
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
								"Delete Organization"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Leave Dialog */}
			<AlertDialog onOpenChange={setShowLeaveDialog} open={showLeaveDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Leave organization?</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to leave "{organization.name}"? You will
							lose access to this organization and all its resources.
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
								"Leave Organization"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
