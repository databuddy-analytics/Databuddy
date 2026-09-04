"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { toast } from "sonner";
import { NoticeBanner } from "@/app/(main)/websites/_components/notice-banner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { type Organization, useOrganizations } from "@/hooks/use-organizations";
import { useWebsiteTransferToOrg } from "@/hooks/use-website-transfer-to-org";
import { useWebsite } from "@/hooks/use-websites";
import {
	ArrowRightIcon,
	ArrowSquareOutIcon,
	BuildingsIcon,
	InfoIcon,
	WarningIcon,
} from "@databuddy/ui/icons";
import { Dialog, DropdownMenu } from "@databuddy/ui/client";
import { Button, Card, Skeleton } from "@databuddy/ui";

function TransferPageContent() {
	const params = useParams();
	const router = useRouter();
	const websiteId = params.id as string;
	const { data: websiteData, isLoading: isLoadingWebsite } =
		useWebsite(websiteId);
	const { organizations, isLoading: isLoadingOrganizations } =
		useOrganizations();
	const { transferWebsiteToOrg, isTransferring } = useWebsiteTransferToOrg();

	const [selectedOrgId, setSelectedOrgId] = useState<string>("");
	const [showConfirmDialog, setShowConfirmDialog] = useState(false);

	const handleTransfer = useCallback(() => {
		if (!(selectedOrgId && websiteData)) {
			return;
		}

		const targetOrg = organizations?.find((org) => org.id === selectedOrgId);
		if (!targetOrg) {
			toast.error("Selected organization not found");
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
					setSelectedOrgId("");
					setTimeout(() => {
						router.push("/websites");
					}, 500);
				},
			}
		);
	}, [
		selectedOrgId,
		websiteData,
		organizations,
		transferWebsiteToOrg,
		websiteId,
		router,
	]);

	if (isLoadingWebsite || isLoadingOrganizations || !websiteData) {
		return (
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-2xl space-y-6 p-5">
					<Card>
						<Card.Header>
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-48" />
						</Card.Header>
						<Card.Content className="space-y-3">
							<Skeleton className="h-16 w-full" />
							<Skeleton className="h-10 w-full" />
						</Card.Content>
					</Card>
				</div>
			</div>
		);
	}

	const websiteOrgId =
		"organizationId" in websiteData ? websiteData.organizationId : null;

	const currentOrg = organizations?.find(
		(org: Organization) => org.id === websiteOrgId
	) || {
		id: websiteOrgId ?? "",
		name: "Current Organization",
		slug: "",
		logo: null as string | null,
		createdAt: new Date(),
	};

	const availableOrgs =
		organizations?.filter((org: Organization) => org.id !== websiteOrgId) || [];

	const selectedOrg = selectedOrgId
		? organizations?.find((org: Organization) => org.id === selectedOrgId) ||
			null
		: null;

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-2xl space-y-6 p-5">
					<Card>
						<Card.Header>
							<Card.Title>Transfer Website</Card.Title>
							<Card.Description>
								Move this website to a different organization
							</Card.Description>
						</Card.Header>
						<Card.Content className="space-y-4">
							<div className="flex items-center gap-3">
								<div className="flex min-w-0 flex-1 items-center gap-3 rounded border bg-secondary p-3">
									<BuildingsIcon className="size-5 shrink-0 text-muted-foreground" />
									<div className="min-w-0 flex-1">
										<p className="mb-0.5 text-muted-foreground text-xs">From</p>
										<p className="truncate font-medium text-sm">
											{currentOrg.name}
										</p>
									</div>
								</div>

								<ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />

								<div className="flex min-w-0 flex-1 items-center gap-3 rounded border bg-secondary p-3">
									<BuildingsIcon className="size-5 shrink-0 text-muted-foreground" />
									<div className="min-w-0 flex-1">
										<p className="mb-0.5 text-muted-foreground text-xs">To</p>
										<p className="truncate font-medium text-sm">
											{selectedOrg?.name || "Select organization"}
										</p>
									</div>
								</div>
							</div>

							<NoticeBanner
								description="Ownership and all data move to the target organization. Its members will gain access."
								icon={<InfoIcon />}
								title="What transfers"
							/>
						</Card.Content>
					</Card>

					<Card>
						<Card.Header>
							<Card.Title>Target Organization</Card.Title>
							<Card.Description>
								Select where to transfer this website
							</Card.Description>
						</Card.Header>
						<Card.Content className="space-y-3">
							<DropdownMenu>
								<DropdownMenu.Trigger
									className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-sm disabled:pointer-events-none disabled:opacity-50"
									disabled={availableOrgs.length === 0}
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
														<BuildingsIcon className="size-4" />
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

							{availableOrgs.length === 0 && (
								<NoticeBanner
									description="Create or join another organization to transfer this website."
									icon={<WarningIcon />}
									title="No target organizations"
								/>
							)}
						</Card.Content>
					</Card>

					{selectedOrgId && (
						<Alert className="border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-200">
							<WarningIcon className="size-4" />
							<AlertDescription className="text-xs">
								<div>
									<strong className="font-semibold">Important:</strong> This
									action is irreversible. All data, settings, and analytics will
									be transferred to{" "}
									<strong className="font-semibold">{selectedOrg?.name}</strong>
									. Ensure you have the necessary permissions on both
									organizations.
								</div>
							</AlertDescription>
						</Alert>
					)}
				</div>
			</div>

			<div className="angled-rectangle-gradient sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t bg-secondary px-5 py-4">
				<p className="text-muted-foreground text-sm">
					{selectedOrgId
						? "Review the details and confirm to proceed"
						: "Select a target organization to continue"}
				</p>
				<Button
					disabled={!selectedOrgId}
					loading={isTransferring}
					onClick={() => setShowConfirmDialog(true)}
					size="sm"
				>
					<ArrowSquareOutIcon className="size-4" />
					Transfer Website
				</Button>
			</div>

			<Dialog onOpenChange={setShowConfirmDialog} open={showConfirmDialog}>
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
									{websiteData.name?.charAt(0).toUpperCase() ||
										websiteData.domain.charAt(0).toUpperCase()}
								</span>
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-sm">
									{websiteData.name || websiteData.domain}
								</p>
								<p className="truncate text-muted-foreground text-xs">
									{websiteData.domain}
								</p>
							</div>
						</div>

						<div className="space-y-2">
							<div className="flex items-center gap-2.5 rounded border p-2.5">
								<div className="flex size-8 shrink-0 items-center justify-center rounded border bg-background">
									{currentOrg.logo ? (
										<img
											alt={currentOrg.name}
											className="size-full rounded object-cover"
											height={32}
											src={currentOrg.logo}
											width={32}
										/>
									) : (
										<BuildingsIcon className="size-4 text-muted-foreground" />
									)}
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-muted-foreground text-xs">From</p>
									<p className="truncate font-medium text-sm">
										{currentOrg.name}
									</p>
								</div>
							</div>

							<div className="flex justify-center">
								<ArrowRightIcon className="size-4 rotate-90 text-muted-foreground" />
							</div>

							<div className="flex items-center gap-2.5 rounded border border-primary/30 bg-primary/5 p-2.5">
								<div className="flex size-8 shrink-0 items-center justify-center rounded border border-primary/30 bg-background">
									{selectedOrg?.logo ? (
										<img
											alt={selectedOrg.name}
											className="size-full rounded object-cover"
											height={32}
											src={selectedOrg.logo}
											width={32}
										/>
									) : (
										<BuildingsIcon className="size-4 text-primary" />
									)}
								</div>
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
						<Button
							onClick={() => setShowConfirmDialog(false)}
							variant="secondary"
						>
							Cancel
						</Button>
						<Button loading={isTransferring} onClick={handleTransfer}>
							<ArrowSquareOutIcon className="size-4" />
							Confirm Transfer
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog>
		</div>
	);
}

export default function TransferPage() {
	return (
		<Suspense
			fallback={
				<div className="flex-1 overflow-y-auto">
					<div className="mx-auto max-w-2xl space-y-6 p-5">
						<Card>
							<Card.Header>
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-48" />
							</Card.Header>
							<Card.Content className="space-y-3">
								<Skeleton className="h-16 w-full" />
								<Skeleton className="h-10 w-full" />
							</Card.Content>
						</Card>
					</div>
				</div>
			}
		>
			<TransferPageContent />
		</Suspense>
	);
}
