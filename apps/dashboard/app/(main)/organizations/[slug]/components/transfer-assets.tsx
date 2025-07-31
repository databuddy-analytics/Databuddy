'use client';

import { ArrowRightIcon, BuildingsIcon, UserIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWebsiteTransfer } from '@/hooks/use-website-transfer';
import { WebsiteSelector } from './website-selector';

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
		fromSide: 'personal' | 'organization';
	} | null>(null);

	const selectedSide = personalWebsites.some((w) => w.id === selectedWebsite)
		? 'personal'
		: organizationWebsites.some((w) => w.id === selectedWebsite)
			? 'organization'
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
			selectedSide === 'personal' ? organizationId : undefined;

		// Set the transferring website for animation
		setTransferringWebsite({
			id: website.id,
			name: website.name || '',
			domain: website.domain,
			fromSide: selectedSide,
		});

		transferWebsite(
			{ websiteId: selectedWebsite, organizationId: organizationIdToUse },
			{
				onSuccess: () => {
					setSelectedWebsite(null);
					setTransferringWebsite(null);
					toast.success('Website transferred successfully');
				},
				onError: (error) => {
					setTransferringWebsite(null);
					toast.error(error.message || 'Failed to transfer website');
				},
			}
		);
	};

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto_1fr]">
					{/* Personal Websites Skeleton */}
					<Card>
						<CardHeader className="pb-4">
							<CardTitle className="flex items-center gap-2 text-base">
								<UserIcon size={18} weight="duotone" />
								Your Personal Websites
							</CardTitle>
							<CardDescription>
								Transfer these to the organization
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								{[1, 2, 3].map((i) => (
									<div
										className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/50 p-3"
										key={i}
									>
										<Skeleton className="h-4 w-4 rounded" />
										<div className="flex-1 space-y-1">
											<Skeleton className="h-3 w-24" />
											<Skeleton className="h-2 w-32" />
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					<div className="flex items-center justify-center">
						<Skeleton className="h-10 w-10 rounded-lg" />
					</div>

					{/* Organization Websites Skeleton */}
					<Card>
						<CardHeader className="pb-4">
							<CardTitle className="flex items-center gap-2 text-base">
								<BuildingsIcon size={18} weight="duotone" />
								Organization Websites
							</CardTitle>
							<CardDescription>
								Transfer these back to your personal account
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								{[1, 2, 3].map((i) => (
									<div
										className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/50 p-3"
										key={i}
									>
										<Skeleton className="h-4 w-4 rounded" />
										<div className="flex-1 space-y-1">
											<Skeleton className="h-3 w-24" />
											<Skeleton className="h-2 w-32" />
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
		<div className="space-y-6">
			{/* Transfer Animation Overlay */}
			{transferringWebsite && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
					<div className="relative w-full max-w-4xl">
						{/* Animated Website Card */}
						<div
							className={`-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 flex items-center gap-3 rounded-lg border-2 border-primary/30 bg-primary/10 p-3 shadow-lg transition-all duration-1000 ease-in-out ${
								transferringWebsite.fromSide === 'personal'
									? 'animate-[slide-right_1s_ease-in-out]'
									: 'animate-[slide-left_1s_ease-in-out]'
							}`}
						>
							<div className="rounded bg-primary/20 p-1.5">
								<UserIcon className="h-3.5 w-3.5 text-primary" size={14} />
							</div>
							<div className="min-w-0">
								<p className="truncate font-medium text-foreground text-sm">
									{transferringWebsite.name}
								</p>
								<p className="truncate text-muted-foreground text-xs">
									{transferringWebsite.domain}
								</p>
							</div>
						</div>

						{/* Transfer Direction Indicator */}
						<div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2">
							<div className="flex items-center gap-2 rounded-full bg-primary/20 px-4 py-2 shadow-lg">
								<ArrowRightIcon
									className={`text-primary transition-transform duration-1000 ${
										transferringWebsite.fromSide === 'organization'
											? 'rotate-180'
											: ''
									}`}
									size={18}
								/>
								<span className="font-medium text-primary text-sm">
									Transferring...
								</span>
							</div>
						</div>
					</div>
				</div>
			)}

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto_1fr]">
				{/* Personal Websites */}
				<Card>
					<CardHeader className="pb-4">
						<CardTitle className="flex items-center gap-2 text-base">
							<UserIcon size={18} weight="duotone" />
							Your Personal Websites
						</CardTitle>
						<CardDescription>
							Transfer these to the organization
						</CardDescription>
					</CardHeader>
					<CardContent>
						<WebsiteSelector
							onSelectWebsite={setSelectedWebsite}
							selectedWebsite={selectedWebsite}
							websites={personalWebsites}
						/>
					</CardContent>
				</Card>

				<div className="flex items-center justify-center">
					<Button
						className="h-10 w-10 rounded-lg border-2 shadow-sm"
						disabled={!selectedSide || isTransferring}
						onClick={handleTransfer}
						size="icon"
						variant="outline"
					>
						{isTransferring ? (
							<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
						) : (
							<ArrowRightIcon
								className={`transition-transform duration-300 ${
									selectedSide === 'organization' ? 'rotate-180' : ''
								}`}
								size={18}
							/>
						)}
					</Button>
				</div>

				{/* Organization Websites */}
				<Card>
					<CardHeader className="pb-4">
						<CardTitle className="flex items-center gap-2 text-base">
							<BuildingsIcon size={18} weight="duotone" />
							Organization Websites
						</CardTitle>
						<CardDescription>
							Transfer these back to your personal account
						</CardDescription>
					</CardHeader>
					<CardContent>
						<WebsiteSelector
							onSelectWebsite={setSelectedWebsite}
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
