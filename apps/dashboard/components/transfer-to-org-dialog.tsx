"use client";

import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
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

function getDicebearUrl(seed: string): string {
	return `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed)}`;
}

interface TransferToOrgDialogProps {
	children?: React.ReactNode;
	currentOrganizationId: string;
	description: string;
	isPending: boolean;
	onOpenChangeAction: (open: boolean) => void;
	onTransferAction: (targetOrganizationId: string) => void;
	open: boolean;
	title: string;
	warning?: string;
}

export function TransferToOrgDialog({
	open,
	onOpenChangeAction,
	title,
	description,
	warning,
	currentOrganizationId,
	isPending,
	onTransferAction,
	children,
}: TransferToOrgDialogProps) {
	const { organizations, isLoading: isLoadingOrgs } = useOrganizations();
	const [selectedOrgId, setSelectedOrgId] = useState<string>("");

	const currentOrg = organizations?.find(
		(org: Organization) => org.id === currentOrganizationId
	);

	const availableOrgs =
		organizations?.filter(
			(org: Organization) => org.id !== currentOrganizationId
		) ?? [];

	const selectedOrg = selectedOrgId
		? organizations?.find((org: Organization) => org.id === selectedOrgId)
		: null;

	const handleClose = (nextOpen: boolean) => {
		if (!nextOpen) {
			setSelectedOrgId("");
		}
		onOpenChangeAction(nextOpen);
	};

	const handleTransfer = () => {
		if (!selectedOrgId) {
			return;
		}
		onTransferAction(selectedOrgId);
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label className="text-muted-foreground text-xs">
							Current Workspace
						</Label>
						<div className="flex items-center gap-2.5 rounded border bg-secondary p-2.5">
							<img
								alt={currentOrg?.name ?? "Current workspace"}
								className="size-8 shrink-0 rounded"
								height={32}
								src={getDicebearUrl(
									currentOrg?.logo || currentOrg?.id || currentOrganizationId
								)}
								width={32}
							/>
							<p className="truncate font-medium text-sm">
								{currentOrg?.name ?? "Current workspace"}
							</p>
						</div>
					</div>

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

					{children}

					{!isLoadingOrgs && availableOrgs.length === 0 ? (
						<div className="flex items-start gap-2 rounded border border-orange-200 bg-orange-50 p-3 text-orange-800 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-200">
							<WarningIcon className="mt-0.5 size-4 shrink-0" />
							<p className="text-xs">
								No other workspaces available. Create a new workspace or get
								invited to one to transfer.
							</p>
						</div>
					) : null}

					{selectedOrg && warning ? (
						<div className="flex items-start gap-2 rounded border border-orange-200 bg-orange-50 p-3 text-orange-800 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-200">
							<WarningIcon className="mt-0.5 size-4 shrink-0" />
							<p className="text-xs">
								{warning.replace("{orgName}", selectedOrg.name)}
							</p>
						</div>
					) : null}
				</div>

				<DialogFooter>
					<Button
						disabled={isPending}
						onClick={() => handleClose(false)}
						type="button"
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={!selectedOrgId || isPending}
						onClick={handleTransfer}
						type="button"
					>
						{isPending ? (
							<>
								<div className="mr-2 size-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
								Transferring…
							</>
						) : (
							<>
								<ArrowSquareOutIcon className="mr-2 size-4" weight="fill" />
								Transfer
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
