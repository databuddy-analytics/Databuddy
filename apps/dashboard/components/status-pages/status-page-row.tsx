"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { TransferToOrgDialog } from "@/components/transfer-to-org-dialog";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { getStatusPageUrl } from "@/lib/app-url";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	ArrowSquareOutIcon,
	CopyIcon,
	DotsThreeIcon,
	OpenExternalIcon as BrowserIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { Badge, Field } from "@databuddy/ui";
import { DropdownMenu, Switch } from "@databuddy/ui/client";

export interface StatusPage {
	createdAt: Date | string;
	description: string | null;
	faviconUrl?: string | null;
	id: string;
	logoUrl?: string | null;
	monitorCount: number;
	name: string;
	organizationId: string;
	slug: string;
	supportUrl?: string | null;
	theme?: string | null;
	updatedAt: Date | string;
	websiteUrl?: string | null;
}

interface StatusPageRowProps {
	onDeleteAction: () => void;
	onEditAction: () => void;
	onTransferSuccessAction?: () => void;
	statusPage: StatusPage;
}

function StatusPageActions({
	statusPage,
	onEditAction,
	onDeleteAction,
	onTransferSuccessAction,
}: StatusPageRowProps) {
	const url = getStatusPageUrl(statusPage.slug);
	const [isTransferOpen, setIsTransferOpen] = useState(false);
	const [includeMonitors, setIncludeMonitors] = useState(true);

	const { copyToClipboard } = useCopyToClipboard({
		onCopy: () => toast.success("URL copied to clipboard"),
	});

	const transferMutation = useMutation({
		...orpc.statusPage.transfer.mutationOptions(),
	});

	const handleTransfer = async (targetOrganizationId: string) => {
		try {
			await transferMutation.mutateAsync({
				statusPageId: statusPage.id,
				targetOrganizationId,
				includeMonitors,
			});
			toast.success("Status page transferred");
			setIsTransferOpen(false);
			onTransferSuccessAction?.();
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: "Failed to transfer status page";
			toast.error(errorMessage);
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenu.Trigger
					aria-label="Status page actions"
					className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-interactive-hover hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
					data-dropdown-trigger
				>
					<DotsThreeIcon className="size-4" weight="bold" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" className="w-52">
					<DropdownMenu.Item
						render={
							<Link
								className="gap-2"
								href={`/monitors/status-pages/${statusPage.id}`}
							/>
						}
					>
						<PencilSimpleIcon className="size-4" weight="duotone" />
						Manage Monitors
					</DropdownMenu.Item>
					<DropdownMenu.Item className="gap-2" onClick={onEditAction}>
						<PencilSimpleIcon className="size-4" weight="duotone" />
						Edit Details
					</DropdownMenu.Item>
					<DropdownMenu.Item
						className="gap-2"
						onClick={() => copyToClipboard(url)}
					>
						<CopyIcon className="size-4" weight="duotone" />
						Copy URL
					</DropdownMenu.Item>
					<DropdownMenu.Item
						render={
							<Link
								className="gap-2"
								href={url}
								rel="noopener noreferrer"
								target="_blank"
							/>
						}
					>
						<ArrowSquareOutIcon className="size-4" weight="duotone" />
						View Page
					</DropdownMenu.Item>
					<DropdownMenu.Item
						className="gap-2"
						onClick={() => setIsTransferOpen(true)}
					>
						<ArrowSquareOutIcon className="size-4" weight="duotone" />
						Transfer to Organization
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item
						className="gap-2 text-destructive focus:text-destructive"
						onClick={onDeleteAction}
						variant="destructive"
					>
						<TrashIcon className="size-4 fill-destructive" weight="duotone" />
						Delete
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu>

			<TransferToOrgDialog
				currentOrganizationId={statusPage.organizationId}
				description={`Move "${statusPage.name}" to a different organization.`}
				isPending={transferMutation.isPending}
				onOpenChangeAction={setIsTransferOpen}
				onTransferAction={handleTransfer}
				open={isTransferOpen}
				title="Transfer Status Page"
				warning="The status page and its configuration will be transferred to {orgName}."
			>
				<div className="flex items-center justify-between rounded border p-3">
					<Field.Label
						className="cursor-pointer text-sm"
						htmlFor="include-monitors-row"
					>
						Include all linked monitors
					</Field.Label>
					<Switch
						checked={includeMonitors}
						id="include-monitors-row"
						onCheckedChange={setIncludeMonitors}
					/>
				</div>
			</TransferToOrgDialog>
		</>
	);
}

export function StatusPageRow({
	statusPage,
	onEditAction,
	onDeleteAction,
	onTransferSuccessAction,
}: StatusPageRowProps) {
	const hasMonitors = statusPage.monitorCount > 0;

	const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
		const target = e.target as HTMLElement;
		if (
			target.closest("[data-dropdown-trigger]") ||
			target.closest("[data-radix-popper-content-wrapper]") ||
			target.closest("a[target='_blank']")
		) {
			e.preventDefault();
		}
	};

	return (
		<Link
			className="group flex items-center hover:bg-interactive-hover"
			href={`/monitors/status-pages/${statusPage.id}`}
			onClick={handleClick}
		>
			<div className="flex flex-1 items-center gap-4 px-5 py-3">
				<div
					className={cn(
						"flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60",
						hasMonitors
							? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
							: "bg-secondary text-muted-foreground"
					)}
				>
					<BrowserIcon className="size-5" weight="duotone" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="truncate font-medium text-foreground text-sm">
							{statusPage.name}
						</span>
						<Badge
							className="shrink-0"
							variant={hasMonitors ? "success" : "muted"}
						>
							{hasMonitors ? "Active" : "Empty"}
						</Badge>
					</div>
					<div className="mt-0.5 flex items-center gap-1.5">
						<span className="truncate text-muted-foreground text-xs">
							/{statusPage.slug}
						</span>
						{statusPage.description && (
							<>
								<span className="text-muted-foreground text-xs">·</span>
								<span className="hidden truncate text-muted-foreground text-xs md:inline">
									{statusPage.description}
								</span>
							</>
						)}
						<span className="text-muted-foreground text-xs">·</span>
						<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
							{statusPage.monitorCount}{" "}
							{statusPage.monitorCount === 1 ? "monitor" : "monitors"}
						</span>
					</div>
				</div>
			</div>

			<div className="flex shrink-0 items-center pr-4">
				<StatusPageActions
					onDeleteAction={onDeleteAction}
					onEditAction={onEditAction}
					onTransferSuccessAction={onTransferSuccessAction}
					statusPage={statusPage}
				/>
			</div>
		</Link>
	);
}
