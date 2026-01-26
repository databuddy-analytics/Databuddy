"use client";

import {
	ArrowRightIcon,
	ArrowsLeftRightIcon,
	BuildingsIcon,
	GlobeIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizations } from "@/hooks/use-organizations";
import { useWebsiteTransfer } from "@/hooks/use-website-transfer";
import type { Website } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";

interface WebsiteItemProps {
	website: Website;
	selected: boolean;
	onClickAction: () => void;
}

function WebsiteItem({ website, selected, onClickAction }: WebsiteItemProps) {
	return (
		<button
			className={cn(
				"flex w-full items-center gap-3 rounded border bg-card px-3 py-2 text-left",
				selected ? "bg-accent" : "hover:bg-accent"
			)}
			onClick={onClickAction}
			type="button"
		>
			<FaviconImage
				altText={`${website.name} favicon`}
				className="size-6 shrink-0"
				domain={website.domain}
				fallbackIcon={
					<div className="flex size-6 items-center justify-center rounded bg-secondary">
						<GlobeIcon className="text-accent-foreground" size={12} />
					</div>
				}
				size={24}
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm">{website.name ?? website.domain}</p>
				<p className="truncate text-muted-foreground text-xs">
					{website.domain}
				</p>
			</div>
		</button>
	);
}

function LoadingSkeleton() {
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
			<Skeleton className="h-10 w-full" />
		</div>
	);
}

interface TransferAssetsProps {
	organizationId: string;
}

export function TransferAssets({ organizationId }: TransferAssetsProps) {
	const { organizations } = useOrganizations();
	const { organizationWebsites, transferWebsite, isTransferring, isLoading } =
		useWebsiteTransfer(organizationId);

	const [selectedWebsite, setSelectedWebsite] = useState<string | null>(null);
	const [targetOrgId, setTargetOrgId] = useState<string>("");

	const otherOrganizations = organizations?.filter(
		(org) => org.id !== organizationId
	);

	const canTransfer = selectedWebsite && targetOrgId;

	const handleTransfer = () => {
		if (!canTransfer) {
			return;
		}

		transferWebsite(
			{ websiteId: selectedWebsite, organizationId: targetOrgId },
			{
				onSuccess: () => {
					setSelectedWebsite(null);
					setTargetOrgId("");
					toast.success("Website transferred successfully");
				},
			}
		);
	};

	if (isLoading) {
		return <LoadingSkeleton />;
	}

	if (organizationWebsites.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center rounded border border-dashed py-12 text-center">
				<ArrowsLeftRightIcon
					className="mb-3 text-muted-foreground/50"
					size={32}
				/>
				<p className="font-medium text-muted-foreground">
					No websites to transfer
				</p>
				<p className="mt-1 text-muted-foreground/70 text-sm">
					This workspace has no websites
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Websites in current org */}
			<div className="flex flex-col">
				<div className="mb-3 flex items-center gap-2">
					<BuildingsIcon
						className="text-accent-foreground"
						size={14}
						weight="duotone"
					/>
					<span className="font-medium text-sm">Workspace Websites</span>
					<span className="text-muted-foreground text-xs">
						({organizationWebsites.length})
					</span>
				</div>
				<div className="max-h-48 space-y-2 overflow-y-auto">
					{organizationWebsites.map((website) => (
						<WebsiteItem
							key={website.id}
							onClickAction={() =>
								setSelectedWebsite(
									website.id === selectedWebsite ? null : website.id
								)
							}
							selected={selectedWebsite === website.id}
							website={website}
						/>
					))}
				</div>
			</div>

			{/* Target org selector */}
			{selectedWebsite && (
				<div className="space-y-2">
					<label className="font-medium text-sm" htmlFor="target-org">
						Transfer to workspace
					</label>
					<Select onValueChange={setTargetOrgId} value={targetOrgId}>
						<SelectTrigger id="target-org">
							<SelectValue placeholder="Select target workspace" />
						</SelectTrigger>
						<SelectContent>
							{otherOrganizations && otherOrganizations.length > 0 ? (
								otherOrganizations.map((org) => (
									<SelectItem key={org.id} value={org.id}>
										<div className="flex items-center gap-2">
											<BuildingsIcon className="size-4" />
											<span>{org.name}</span>
										</div>
									</SelectItem>
								))
							) : (
								<SelectItem disabled value="no-orgs">
									No other workspaces available
								</SelectItem>
							)}
						</SelectContent>
					</Select>
				</div>
			)}

			{/* Transfer button */}
			<Button
				className="w-full"
				disabled={!canTransfer || isTransferring}
				onClick={handleTransfer}
				variant="outline"
			>
				{isTransferring ? (
					<div className="size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
				) : (
					<>
						<ArrowRightIcon className="mr-2" size={16} />
						Transfer Website
					</>
				)}
			</Button>
		</div>
	);
}
