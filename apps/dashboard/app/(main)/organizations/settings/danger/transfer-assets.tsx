"use client";

import {
	ArrowRightIcon,
	ArrowsLeftRightIcon,
	BuildingsIcon,
	GlobeIcon,
	UserIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebsiteTransfer } from "@/hooks/use-website-transfer";
import type { Website } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";

type WebsiteItemProps = {
	website: Website;
	selected: boolean;
	onClick: () => void;
};

function WebsiteItem({ website, selected, onClick }: WebsiteItemProps) {
	return (
		<button
			className={cn(
				"flex w-full items-center gap-3 rounded border bg-card px-3 py-2 text-left",
				selected ? "bg-accent" : "hover:bg-accent"
			)}
			onClick={onClick}
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

type EmptyListProps = {
	label: string;
};

function EmptyList({ label }: EmptyListProps) {
	return (
		<div className="flex flex-col items-center justify-center rounded border border-dashed py-8 text-center">
			<GlobeIcon className="mb-2 text-muted-foreground/50" size={24} />
			<p className="text-muted-foreground text-xs">{label}</p>
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
			<div className="flex items-center justify-center">
				<Skeleton className="h-9 w-9 rounded" />
			</div>
			<div className="space-y-2">
				<Skeleton className="h-4 w-40" />
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		</div>
	);
}

type TransferAssetsProps = {
	organizationId: string;
};

export function TransferAssets({ organizationId }: TransferAssetsProps) {
	const {
		personalWebsites,
		organizationWebsites,
		transferWebsite,
		isTransferring,
		isLoading,
	} = useWebsiteTransfer(organizationId);

	const [selectedWebsite, setSelectedWebsite] = useState<string | null>(null);

	const selectedSide = personalWebsites.some((w) => w.id === selectedWebsite)
		? "personal"
		: organizationWebsites.some((w) => w.id === selectedWebsite)
			? "organization"
			: null;

	const handleTransfer = () => {
		if (!(selectedWebsite && selectedSide)) {
			return;
		}

		const organizationIdToUse =
			selectedSide === "personal" ? organizationId : undefined;

		transferWebsite(
			{ websiteId: selectedWebsite, organizationId: organizationIdToUse },
			{
				onSuccess: () => {
					setSelectedWebsite(null);
					toast.success("Website transferred successfully");
				},
				onError: (error: any) => {
					toast.error(error.message ?? "Failed to transfer website");
				},
			}
		);
	};

	if (isLoading) {
		return <LoadingSkeleton />;
	}

	const hasNoWebsites =
		personalWebsites.length === 0 && organizationWebsites.length === 0;

	if (hasNoWebsites) {
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
					Add websites to your account or organization first
				</p>
			</div>
		);
	}

	return (
		<div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
			{/* Personal Websites */}
			<div className="flex flex-1 flex-col">
				<div className="mb-3 flex items-center gap-2">
					<UserIcon
						className="text-accent-foreground"
						size={14}
						weight="duotone"
					/>
					<span className="font-medium text-sm">Personal</span>
					<span className="text-muted-foreground text-xs">
						({personalWebsites.length})
					</span>
				</div>
				<div className="flex-1 space-y-2 overflow-y-auto">
					{personalWebsites.length > 0 ? (
						personalWebsites.map((website) => (
							<WebsiteItem
								key={website.id}
								onClick={() =>
									setSelectedWebsite(
										website.id === selectedWebsite ? null : website.id
									)
								}
								selected={selectedWebsite === website.id}
								website={website}
							/>
						))
					) : (
						<EmptyList label="No personal websites" />
					)}
				</div>
			</div>

			{/* Transfer Button */}
			<div className="flex items-center justify-center">
				<Button
					className="h-9 w-9"
					disabled={!selectedSide || isTransferring}
					onClick={handleTransfer}
					size="icon"
					variant={selectedWebsite && selectedSide ? "default" : "outline"}
				>
					{isTransferring ? (
						<div className="size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
					) : (
						<ArrowRightIcon
							className={cn(
								"transition-transform",
								selectedSide === "organization" && "rotate-180"
							)}
							size={16}
						/>
					)}
				</Button>
			</div>

			{/* Organization Websites */}
			<div className="flex flex-1 flex-col">
				<div className="mb-3 flex items-center gap-2">
					<BuildingsIcon
						className="text-accent-foreground"
						size={14}
						weight="duotone"
					/>
					<span className="font-medium text-sm">Organization</span>
					<span className="text-muted-foreground text-xs">
						({organizationWebsites.length})
					</span>
				</div>
				<div className="flex-1 space-y-2 overflow-y-auto">
					{organizationWebsites.length > 0 ? (
						organizationWebsites.map((website) => (
							<WebsiteItem
								key={website.id}
								onClick={() =>
									setSelectedWebsite(
										website.id === selectedWebsite ? null : website.id
									)
								}
								selected={selectedWebsite === website.id}
								website={website}
							/>
						))
					) : (
						<EmptyList label="No organization websites" />
					)}
				</div>
			</div>
		</div>
	);
}
