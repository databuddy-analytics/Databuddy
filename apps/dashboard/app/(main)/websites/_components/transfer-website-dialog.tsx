"use client";

import type { Website } from "@databuddy/shared/types/website";
import {
	ArrowRightIcon,
	ArrowSquareOutIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { type Organization, useOrganizations } from "@/hooks/use-organizations";
import { useWebsiteTransferToOrg } from "@/hooks/use-website-transfer-to-org";

function getDicebearUrl(seed: string): string {
	return `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed)}`;
}

interface TransferWebsiteDialogProps {
	website: Website;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onTransferSuccess?: () => void;
}

export function TransferWebsiteDialog({
	website,
	open,
	onOpenChange,
	onTransferSuccess,
}: TransferWebsiteDialogProps) {
	const { organizations, isLoading: isLoadingOrgs } = useOrganizations();
	const { transferWebsiteToOrg, isTransferring } = useWebsiteTransferToOrg();

	const [selectedOrgId, setSelectedOrgId] = useState<string>("");
	const [showConfirmDialog, setShowConfirmDialog] = useState(false);

	const currentOrg = organizations?.find(
		(org: Organization) => org.id === website.organizationId
	) || {
		id: website.organizationId,
		name: "Current Workspace",
		slug: "",
		logo: null as string | null,
		createdAt: new Date(),
	};

	const availableOrgs =
		organizations?.filter(
			(org: Organization) => org.id !== website.organizationId
		) || [];

	const selectedOrg = selectedOrgId
		? organizations?.find((org: Organization) => org.id === selectedOrgId) ||
			null
		: null;

	const handleTransfer = useCallback(() => {
		if (!(selectedOrgId && website)) {
			return;
		}

		const targetOrg = organizations?.find((org) => org.id === selectedOrgId);
		if (!targetOrg) {
			toast.error("Selected organization not found");
			return;
		}

		transferWebsiteToOrg(
			{
				websiteId: website.id,
				targetOrganizationId: selectedOrgId,
			},
			{
				onSuccess: () => {
					toast.success(
						`Website "${website.name}" has been transferred to "${targetOrg.name}"`
					);
					setShowConfirmDialog(false);
					setSelectedOrgId("");
					onOpenChange(false);
					onTransferSuccess?.();
				},
			}
		);
	}, [
		selectedOrgId,
		website,
		organizations,
		transferWebsiteToOrg,
		onOpenChange,
		onTransferSuccess,
	]);

	const handleClose = useCallback(() => {
		setSelectedOrgId("");
		setShowConfirmDialog(false);
		onOpenChange(false);
	}, [onOpenChange]);

	const handleConfirmClose = useCallback(() => {
		setShowConfirmDialog(false);
	}, []);

	if (showConfirmDialog) {
		return (
			<Dialog onOpenChange={handleConfirmClose} open={showConfirmDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirm Website Transfer</DialogTitle>
						<DialogDescription>This action cannot be undone.</DialogDescription>
					</DialogHeader>

					<div className="space-y-3">
						{/* Website being transferred */}
						<div className="flex items-center gap-2.5 rounded border bg-accent/50 p-2.5">
							<div className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10">
								<span className="font-semibold text-primary text-xs">
									{website.name?.charAt(0).toUpperCase() ||
										website.domain.charAt(0).toUpperCase()}
								</span>
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-sm">
									{website.name || website.domain}
								</p>
								<p className="truncate text-muted-foreground text-xs">
									{website.domain}
								</p>
							</div>
						</div>

						{/* Transfer flow - stacked layout */}
						<div className="space-y-2">
							<div className="flex items-center gap-2.5 rounded border p-2.5">
								<img
									alt={currentOrg.name}
									className="size-8 shrink-0 rounded"
									height={32}
									src={getDicebearUrl(currentOrg.logo || currentOrg.id)}
									width={32}
								/>
								<div className="min-w-0 flex-1">
									<p className="text-muted-foreground text-xs">From</p>
									<p className="truncate font-medium text-sm">
										{currentOrg.name}
									</p>
								</div>
							</div>

							<div className="flex justify-center">
								<ArrowRightIcon
									className="size-4 rotate-90 text-muted-foreground"
									weight="fill"
								/>
							</div>

							<div className="flex items-center gap-2.5 rounded border border-primary/30 bg-primary/5 p-2.5">
								<img
									alt={selectedOrg?.name ?? ""}
									className="size-8 shrink-0 rounded"
									height={32}
									src={getDicebearUrl(
										selectedOrg?.logo || selectedOrg?.id || ""
									)}
									width={32}
								/>
								<div className="min-w-0 flex-1">
									<p className="text-muted-foreground text-xs">To</p>
									<p className="truncate font-medium text-primary text-sm">
										{selectedOrg?.name}
									</p>
								</div>
							</div>
						</div>

						{/* Warning */}
						<p className="text-muted-foreground text-xs leading-relaxed">
							All ownership, data, settings, and analytics will be transferred.
							Members of{" "}
							<span className="font-medium text-foreground">
								{selectedOrg?.name}
							</span>{" "}
							will gain full access.
						</p>
					</div>

					<DialogFooter>
						<Button
							disabled={isTransferring}
							onClick={handleConfirmClose}
							variant="outline"
						>
							Cancel
						</Button>
						<Button disabled={isTransferring} onClick={handleTransfer}>
							{isTransferring ? (
								<>
									<div className="mr-2 size-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
									Transferring…
								</>
							) : (
								<>
									<ArrowSquareOutIcon className="mr-2 size-4" weight="fill" />
									Confirm Transfer
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Transfer Website</DialogTitle>
					<DialogDescription>
						Move "{website.name || website.domain}" to a different workspace
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Current Organization */}
					<div className="space-y-2">
						<Label className="text-muted-foreground text-xs">
							Current Workspace
						</Label>
						<div className="flex items-center gap-2.5 rounded border bg-secondary p-2.5">
							<img
								alt={currentOrg.name}
								className="size-8 shrink-0 rounded"
								height={32}
								src={getDicebearUrl(currentOrg.logo || currentOrg.id)}
								width={32}
							/>
							<p className="truncate font-medium text-sm">{currentOrg.name}</p>
						</div>
					</div>

					{/* Target Organization Selector */}
					<div className="space-y-2">
						<Label htmlFor="target-org">Transfer to</Label>
						<Select
							disabled={isLoadingOrgs || availableOrgs.length === 0}
							onValueChange={setSelectedOrgId}
							value={selectedOrgId}
						>
							<SelectTrigger className="w-full" id="target-org">
								<SelectValue placeholder="Choose a workspace" />
							</SelectTrigger>
							<SelectContent>
								{availableOrgs.length > 0 ? (
									availableOrgs.map((org: Organization) => (
										<SelectItem key={org.id} value={org.id}>
											<div className="flex items-center gap-2">
												<img
													alt={org.name}
													className="size-4 rounded"
													height={16}
													src={getDicebearUrl(org.logo || org.id)}
													width={16}
												/>
												<span>{org.name}</span>
											</div>
										</SelectItem>
									))
								) : (
									<SelectItem disabled value="no-orgs">
										No workspaces available
									</SelectItem>
								)}
							</SelectContent>
						</Select>
					</div>

					{/* No organizations warning */}
					{!isLoadingOrgs && availableOrgs.length === 0 && (
						<div className="flex items-start gap-2 rounded border border-orange-200 bg-orange-50 p-3 text-orange-800 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-200">
							<WarningIcon className="mt-0.5 size-4 shrink-0" />
							<p className="text-xs">
								No other workspaces available. Create a new workspace or get
								invited to one to transfer this website.
							</p>
						</div>
					)}

					{/* Warning when org is selected */}
					{selectedOrgId && (
						<div className="flex items-start gap-2 rounded border border-orange-200 bg-orange-50 p-3 text-orange-800 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-200">
							<WarningIcon className="mt-0.5 size-4 shrink-0" />
							<p className="text-xs">
								This will transfer all data, settings, and analytics to{" "}
								<strong>{selectedOrg?.name}</strong>. This action cannot be
								undone.
							</p>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						disabled={isTransferring}
						onClick={handleClose}
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={!selectedOrgId || isTransferring}
						onClick={() => setShowConfirmDialog(true)}
					>
						<ArrowSquareOutIcon className="mr-2 size-4" />
						Transfer Website
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
