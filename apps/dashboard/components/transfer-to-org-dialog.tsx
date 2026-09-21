"use client";

import { useState } from "react";
import { type Organization, useOrganizations } from "@/hooks/use-organizations";
import { ArrowSquareOutIcon, WarningIcon } from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";
import { Dialog, Select } from "@databuddy/ui/client";

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
			<Dialog.Content className="sm:max-w-md">
				<Dialog.Header>
					<Dialog.Title>{title}</Dialog.Title>
					<Dialog.Description>{description}</Dialog.Description>
				</Dialog.Header>

				<Dialog.Body className="space-y-4">
					<div className="space-y-2">
						<span className="font-medium text-foreground text-xs">
							Current Organization
						</span>
						<div className="flex items-center gap-2.5 rounded border bg-secondary p-2.5">
							<img
								alt={currentOrg?.name ?? "Current organization"}
								className="size-8 shrink-0 rounded"
								height={32}
								src={getDicebearUrl(
									currentOrg?.logo || currentOrg?.id || currentOrganizationId
								)}
								width={32}
							/>
							<p className="truncate font-medium text-sm">
								{currentOrg?.name ?? "Current organization"}
							</p>
						</div>
					</div>

					<div className="space-y-2">
						<label
							className="font-medium text-foreground text-xs"
							htmlFor="target-org"
						>
							Transfer to
						</label>
						<Select
							disabled={isLoadingOrgs || availableOrgs.length === 0}
							onValueChange={(v) => setSelectedOrgId(String(v))}
							value={selectedOrgId}
						>
							<Select.Trigger id="target-org">
								{selectedOrgId ? (
									<Select.Value />
								) : (
									<span className="text-muted-foreground">
										Choose an organization
									</span>
								)}
							</Select.Trigger>
							<Select.Content>
								{availableOrgs.length > 0 ? (
									availableOrgs.map((org: Organization) => (
										<Select.Item key={org.id} value={org.id}>
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
										</Select.Item>
									))
								) : (
									<Select.Item disabled value="no-orgs">
										No organizations available
									</Select.Item>
								)}
							</Select.Content>
						</Select>
					</div>

					{children}

					{!isLoadingOrgs && availableOrgs.length === 0 ? (
						<div className="flex items-start gap-2 rounded border border-orange-200 bg-orange-50 p-3 text-orange-800 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-200">
							<WarningIcon className="mt-0.5 size-4 shrink-0" />
							<p className="text-xs">
								No other organizations available. Create a new organization or
								get invited to one to transfer.
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
				</Dialog.Body>

				<Dialog.Footer>
					<Button
						disabled={isPending}
						onClick={() => handleClose(false)}
						variant="secondary"
					>
						Cancel
					</Button>
					<Button
						disabled={!selectedOrgId}
						loading={isPending}
						onClick={handleTransfer}
					>
						<ArrowSquareOutIcon className="size-4" />
						Transfer
					</Button>
				</Dialog.Footer>
				<Dialog.Close />
			</Dialog.Content>
		</Dialog>
	);
}
