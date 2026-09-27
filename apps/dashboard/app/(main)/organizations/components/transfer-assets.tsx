"use client";

import { FaviconImage } from "@/components/analytics/favicon-image";
import { useOrganizations } from "@/hooks/use-organizations";
import type { Website } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import {
	ArrowRightIcon,
	ArrowsLeftRightIcon,
	BuildingsIcon,
	GlobeIcon,
} from "@databuddy/ui/icons";
import { useState } from "react";
import { toast } from "sonner";
import { useWebsiteTransfer } from "../settings/destructive/hooks/use-website-transfer";
import { Select } from "@databuddy/ui/client";
import { Button, EmptyState, Skeleton, Text } from "@databuddy/ui";

function WebsiteItem({
	website,
	selected,
	onClickAction,
}: {
	website: Website;
	selected: boolean;
	onClickAction: () => void;
}) {
	return (
		<button
			className={cn(
				"flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
				selected
					? "border-primary/30 bg-primary/5"
					: "hover:bg-interactive-hover"
			)}
			onClick={onClickAction}
			type="button"
		>
			<FaviconImage
				altText={`${website.name} favicon`}
				className="size-8"
				domain={website.domain}
				fallbackIcon={
					<GlobeIcon
						className="absolute inset-0 m-auto text-muted-foreground"
						size={20}
					/>
				}
				size={32}
			/>
			<div className="min-w-0 flex-1">
				<Text className="truncate" variant="label">
					{website.name ?? website.domain}
				</Text>
				<Text className="truncate" tone="muted" variant="caption">
					{website.domain}
				</Text>
			</div>
		</button>
	);
}

export function TransferAssets({ organizationId }: { organizationId: string }) {
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
		return (
			<div className="space-y-3">
				<Skeleton className="h-10 w-full rounded-md" />
				<Skeleton className="h-10 w-full rounded-md" />
				<Skeleton className="h-8 w-full rounded-md" />
			</div>
		);
	}

	if (organizationWebsites.length === 0) {
		return (
			<EmptyState
				description="This organization has no websites to transfer"
				icon={<ArrowsLeftRightIcon />}
				title="No websites"
			/>
		);
	}

	return (
		<div className="space-y-4">
			<div>
				<div className="mb-2 flex items-center gap-2">
					<BuildingsIcon className="text-muted-foreground" size={13} />
					<Text variant="label">Select a website</Text>
					<Text tone="muted" variant="caption">
						({organizationWebsites.length})
					</Text>
				</div>
				<div className="max-h-48 space-y-1.5 overflow-y-auto">
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

			{selectedWebsite && (
				<div className="space-y-1.5">
					<Text variant="label">Transfer to</Text>
					<Select
						onValueChange={(val) => setTargetOrgId(val as string)}
						value={targetOrgId}
					>
						<Select.Trigger />
						<Select.Content>
							{otherOrganizations && otherOrganizations.length > 0 ? (
								otherOrganizations.map((org) => (
									<Select.Item key={org.id} value={org.id}>
										{org.name}
									</Select.Item>
								))
							) : (
								<Select.Item disabled value="none">
									No other organizations
								</Select.Item>
							)}
						</Select.Content>
					</Select>
				</div>
			)}

			<Button
				className="w-full"
				disabled={!canTransfer}
				loading={isTransferring}
				onClick={handleTransfer}
				variant="secondary"
			>
				<ArrowRightIcon size={14} />
				Transfer Website
			</Button>
		</div>
	);
}
