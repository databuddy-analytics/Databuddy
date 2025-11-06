"use client";

import { ArrowRightIcon, BuildingsIcon, UserIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebsiteTransfer } from "@/hooks/use-website-transfer";
import { WebsiteSelector } from "./website-selector";

export function TransferAssets({ organizationId }: { organizationId: string }) {
	const {
		personalWebsites,
		organizationWebsites,
		transferWebsite,
		isTransferring,
		isLoading,
	} = useWebsiteTransfer(organizationId);

	const [selectedWebsite, setSelectedWebsite] = useState<string | null>(null);
	const [transferringWebsite, setTransferringWebsite] = useState<{
		id: string;
		name: string;
		domain: string;
		fromSide: "personal" | "organization";
	} | null>(null);

	const selectedSide = personalWebsites.some((w) => w.id === selectedWebsite)
		? "personal"
		: organizationWebsites.some((w) => w.id === selectedWebsite)
			? "organization"
			: null;

	const handleTransfer = () => {
		if (!(selectedWebsite && selectedSide)) {
			return;
		}

		const website = [...personalWebsites, ...organizationWebsites].find(
			(w) => w.id === selectedWebsite
		);
		if (!website) {
			return;
		}

		const organizationIdToUse =
			selectedSide === "personal" ? organizationId : undefined;

		// Set the transferring website for animation
		setTransferringWebsite({
			id: website.id,
			name: website.name || "",
			domain: website.domain,
			fromSide: selectedSide,
		});

		transferWebsite(
			{ websiteId: selectedWebsite, organizationId: organizationIdToUse },
			{
				onSuccess: () => {
					setSelectedWebsite(null);
					setTransferringWebsite(null);
					toast.success("Website transferred successfully");
				},
				onError: (error) => {
					setTransferringWebsite(null);
					toast.error(error.message || "Failed to transfer website");
				},
			}
		);
	};

	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr]">
					{/* Personal Websites Skeleton */}
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 text-sm">
								<UserIcon className="text-primary" size={16} weight="duotone" />
								Your Personal Websites
							</CardTitle>
							<CardDescription className="text-xs">
								Transfer these to the organization
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<div className="space-y-2">
								{[1, 2, 3].map((i) => (
									<div
										className="flex items-center gap-2 rounded border border-border/30 bg-background/50 p-2"
										key={i.toString()}
									>
										<Skeleton className="h-3 w-3 rounded" />
										<div className="flex-1 space-y-1">
											<Skeleton className="h-3 w-20" />
											<Skeleton className="h-2 w-24" />
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					<div className="flex items-center justify-center">
						<Skeleton className="h-8 w-8 rounded" />
					</div>

					{/* Organization Websites Skeleton */}
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 text-sm">
								<BuildingsIcon
									className="text-primary"
									size={16}
									weight="duotone"
								/>
								Organization Websites
							</CardTitle>
							<CardDescription className="text-xs">
								Transfer these back to your personal account
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<div className="space-y-2">
								{[1, 2, 3].map((i) => (
									<div
										className="flex items-center gap-2 rounded border border-border/30 bg-background/50 p-2"
										key={i.toString()}
									>
										<Skeleton className="h-3 w-3 rounded" />
										<div className="flex-1 space-y-1">
											<Skeleton className="h-3 w-20" />
											<Skeleton className="h-2 w-24" />
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Transfer Animation Overlay */}
			{transferringWebsite && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
					<div className="relative w-full max-w-4xl">
						{/* Animated Website Card */}
						<div
							className={`-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 flex items-center gap-2 rounded border-2 border-primary/30 bg-primary/10 p-2 shadow-lg transition-all duration-1000 ease-in-out ${
								transferringWebsite.fromSide === "personal"
									? "animate-[slide-right_1s_ease-in-out]"
									: "animate-[slide-left_1s_ease-in-out]"
							}`}
						>
							<FaviconImage
								altText={`${transferringWebsite.name} favicon`}
								className="rounded"
								domain={transferringWebsite.domain}
								fallbackIcon={
									<div className="rounded bg-primary/20 p-1">
										<UserIcon className="h-3 w-3 text-primary" size={12} />
									</div>
								}
								size={16}
							/>
							<div className="min-w-0">
								<p className="truncate font-medium text-foreground text-xs">
									{transferringWebsite.name}
								</p>
								<p className="truncate text-muted-foreground text-xs">
									{transferringWebsite.domain}
								</p>
							</div>
						</div>

						{/* Transfer Direction Indicator */}
						<div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2">
							<div className="flex items-center gap-2 rounded-full bg-primary/20 px-3 py-1 shadow-lg">
								<ArrowRightIcon
									className={`text-primary transition-transform duration-1000 ${
										transferringWebsite.fromSide === "organization"
											? "rotate-180"
											: ""
									}`}
									size={14}
								/>
								<span className="font-medium text-primary text-xs">
									Transferring...
								</span>
							</div>
						</div>
					</div>
				</div>
			)}

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr]">
				{/* Personal Websites */}
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center gap-2 text-sm">
							<UserIcon className="text-primary" size={16} weight="duotone" />
							Your Personal Websites
						</CardTitle>
						<CardDescription className="text-xs">
							Transfer these to the organization
						</CardDescription>
					</CardHeader>
					<CardContent className="pt-0">
						<WebsiteSelector
							onSelectWebsiteAction={setSelectedWebsite}
							selectedWebsite={selectedWebsite}
							websites={personalWebsites}
						/>
					</CardContent>
				</Card>

				<div className="flex items-center justify-center">
					<Button
						className="h-8 w-8 rounded border-2 shadow-sm"
						disabled={!selectedSide || isTransferring}
						onClick={handleTransfer}
						size="icon"
						variant="outline"
					>
						{isTransferring ? (
							<div className="h-3 w-3 animate-spin rounded-full border border-primary/30 border-t-primary" />
						) : (
							<ArrowRightIcon
								className={`transition-transform duration-300 ${
									selectedSide === "organization" ? "rotate-180" : ""
								}`}
								size={14}
							/>
						)}
					</Button>
				</div>

				{/* Organization Websites */}
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center gap-2 text-sm">
							<BuildingsIcon
								className="text-primary"
								size={16}
								weight="duotone"
							/>
							Organization Websites
						</CardTitle>
						<CardDescription className="text-xs">
							Transfer these back to your personal account
						</CardDescription>
					</CardHeader>
					<CardContent className="pt-0">
						<WebsiteSelector
							onSelectWebsiteAction={setSelectedWebsite}
							selectedWebsite={selectedWebsite}
							websites={organizationWebsites}
						/>
					</CardContent>
				</Card>
			</div>

			<style jsx>{`
        @keyframes slide-right {
          0% {
            transform: translate(-50%, -50%) translateX(-200px);
            opacity: 1;
          }
          50% {
            transform: translate(-50%, -50%) translateX(0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) translateX(200px);
            opacity: 0;
          }
        }
        
        @keyframes slide-left {
          0% {
            transform: translate(-50%, -50%) translateX(200px);
            opacity: 1;
          }
          50% {
            transform: translate(-50%, -50%) translateX(0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) translateX(-200px);
            opacity: 0;
          }
        }
      `}</style>
		</div>
	);
}
