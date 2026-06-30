"use client";

import type { WebsiteOutput } from "@databuddy/rpc";
import type { Website } from "@databuddy/db/schema";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { type Organization, useOrganizations } from "@/hooks/use-organizations";
import { useWebsiteTransferToOrg } from "@/hooks/use-website-transfer-to-org";
import {
	ArrowRightIcon,
	ArrowSquareOutIcon,
	WarningIcon,
} from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";
import { Dialog, DropdownMenu } from "@databuddy/ui/client";

function getDicebearUrl(seed: string): string {
	return `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed)}`;
}

interface TransferWebsiteDialogProps {
	onOpenChange: (open: boolean) => void;
	onTransferSuccess?: () => void;
	open: boolean;
	website: Website | WebsiteOutput;
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
		name: "Current Organization",
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
				<Dialog.Content>
					<Dialog.Close />
					<Dialog.Header>
						<Dialog.Title>Confirm Website Transfer</Dialog.Title>
						<Dialog.Description>
							This action cannot be undone.
						</Dialog.Description>
					</Dialog.Header>

					<Dialog.Body className="space-y-3">
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

						<p className="text-muted-foreground text-xs leading-relaxed">
							All ownership, data, settings, and analytics will be transferred.
							Members of{" "}
							<span className="font-medium text-foreground">
								{selectedOrg?.name}
							</span>{" "}
							will gain full access.
						</p>
					</Dialog.Body>

					<Dialog.Footer>
						<Button onClick={handleConfirmClose} variant="secondary">
							Cancel
						</Button>
						<Button loading={isTransferring} onClick={handleTransfer}>
							<ArrowSquareOutIcon className="size-4" weight="fill" />
							Confirm Transfer
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog>
		);
	}

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<Dialog.Content className="sm:max-w-md">
				<Dialog.Close />
				<Dialog.Header>
					<Dialog.Title>Transfer Website</Dialog.Title>
					<Dialog.Description>
						Move "{website.name || website.domain}" to a different organization
					</Dialog.Description>
				</Dialog.Header>

				<Dialog.Body className="space-y-4">
					<div className="space-y-2">
						<span className="font-medium text-foreground text-xs">
							Current Organization
						</span>
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

					<div className="space-y-2">
						<label
							className="font-medium text-foreground text-xs"
							htmlFor="target-org"
						>
							Transfer to
						</label>
						<DropdownMenu>
							<DropdownMenu.Trigger
								className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-sm disabled:pointer-events-none disabled:opacity-50"
								disabled={isLoadingOrgs || availableOrgs.length === 0}
								id="target-org"
							>
								{selectedOrgId
									? (availableOrgs.find(
											(org: Organization) => org.id === selectedOrgId
										)?.name ?? "Choose an organization")
									: "Choose an organization"}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content
								align="start"
								className="w-[var(--anchor-width)]"
							>
								{availableOrgs.length > 0 ? (
									<DropdownMenu.RadioGroup
										onValueChange={setSelectedOrgId}
										value={selectedOrgId}
									>
										{availableOrgs.map((org: Organization) => (
											<DropdownMenu.RadioItem key={org.id} value={org.id}>
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
											</DropdownMenu.RadioItem>
										))}
									</DropdownMenu.RadioGroup>
								) : (
									<div className="px-2.5 py-2 text-muted-foreground text-sm">
										No organizations available
									</div>
								)}
							</DropdownMenu.Content>
						</DropdownMenu>
					</div>

					{!isLoadingOrgs && availableOrgs.length === 0 && (
						<div className="flex items-start gap-2 rounded border border-orange-200 bg-orange-50 p-3 text-orange-800 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-200">
							<WarningIcon className="mt-0.5 size-4 shrink-0" />
							<p className="text-xs">
								No other organizations available. Create a new organization or
								get invited to one to transfer this website.
							</p>
						</div>
					)}

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
				</Dialog.Body>

				<Dialog.Footer>
					<Button onClick={handleClose} variant="secondary">
						Cancel
					</Button>
					<Button
						disabled={!selectedOrgId}
						loading={isTransferring}
						onClick={() => setShowConfirmDialog(true)}
					>
						<ArrowSquareOutIcon className="size-4" />
						Transfer Website
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	);
}
