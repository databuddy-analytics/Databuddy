'use client';

import { useFlags } from '@databuddy/sdk/react';
import { FlagIcon, InfoIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { useParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWebsite } from '@/hooks/use-websites';
import { trpc } from '@/lib/trpc';
import { isAnalyticsRefreshingAtom } from '@/stores/jotai/filterAtoms';
import { WebsitePageHeader } from '../_components/website-page-header';
import { FlagSheet } from './_components/flag-sheet';
import { FlagsList } from './_components/flags-list';
import type { Flag } from './_components/types';

const FlagsListSkeleton = () => (
	<div className="space-y-3">
		{[...new Array(3)].map((_, i) => (
			<Card className="animate-pulse rounded" key={`flag-skeleton-${i + 1}`}>
				<div className="p-6">
					<div className="mb-4 flex items-start justify-between">
						<div className="flex-1 space-y-3">
							<div className="flex items-center gap-3">
								<div className="h-6 w-48 rounded-lg bg-muted" />
								<div className="h-4 w-4 rounded bg-muted" />
							</div>
							<div className="flex items-center gap-3">
								<div className="h-5 w-16 rounded-full bg-muted" />
								<div className="h-4 w-20 rounded bg-muted" />
							</div>
						</div>
						<div className="h-8 w-8 rounded bg-muted" />
					</div>
					<div className="space-y-3">
						<div className="h-4 w-2/3 rounded bg-muted" />
						<div className="rounded-lg bg-muted/50 p-3">
							<div className="mb-2 h-3 w-24 rounded bg-muted" />
							<div className="flex gap-2">
								<div className="h-8 w-32 rounded-lg bg-muted" />
								<div className="h-4 w-4 rounded bg-muted" />
								<div className="h-8 w-28 rounded-lg bg-muted" />
							</div>
						</div>
					</div>
				</div>
			</Card>
		))}
	</div>
);

export default function FlagsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [editingFlag, setEditingFlag] = useState<Flag | null>(null);

	const { data: website } = useWebsite(websiteId);
	const { isEnabled } = useFlags();
	const experimentFlag = isEnabled('experiment-50');
	const {
		data: flags,
		isLoading,
		error: flagsError,
		refetch: refetchFlags,
	} = trpc.flags.list.useQuery({
		websiteId,
	});

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await refetchFlags();
		} catch (error) {
			console.error('Failed to refresh flag data:', error);
		} finally {
			setIsRefreshing(false);
		}
	}, [refetchFlags, setIsRefreshing]);

	const handleCreateFlag = () => {
		setEditingFlag(null);
		setIsSheetOpen(true);
	};

	const handleEditFlag = (flag: Flag) => {
		setEditingFlag(flag);
		setIsSheetOpen(true);
	};

	const handleSheetClose = () => {
		setIsSheetOpen(false);
		setEditingFlag(null);
	};

	if (flagsError) {
		return (
			<div className="mx-auto max-w-[1600px] p-3 sm:p-4 lg:p-6">
				<Card className="rounded border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
					<CardContent className="pt-6">
						<div className="flex items-center gap-2">
							<FlagIcon
								className="h-5 w-5 text-red-600"
								size={16}
								weight="duotone"
							/>
							<p className="font-medium text-red-600">
								Error loading feature flags
							</p>
						</div>
						<p className="mt-2 text-red-600/80 text-sm">{flagsError.message}</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto mt-6 max-w-[1600px] space-y-4">
			<WebsitePageHeader
				createActionLabel="Create Flag"
				description="Control feature rollouts and A/B testing"
				docsUrl="https://www.databuddy.cc/docs/features/feature-flags"
				hasError={!!flagsError}
				icon={
					<FlagIcon
						className="h-6 w-6 text-primary"
						size={16}
						weight="duotone"
					/>
				}
				isLoading={isLoading}
				isRefreshing={isRefreshing}
				onCreateAction={handleCreateFlag}
				onRefresh={handleRefresh}
				subtitle={
					isLoading
						? undefined
						: `${flags?.length || 0} flag${(flags?.length || 0) !== 1 ? 's' : ''}`
				}
				title="Feature Flags"
				websiteId={websiteId}
				websiteName={website?.name || undefined}
			/>
			{experimentFlag.isReady && (
				<div className="flex items-center gap-3">
					<FlagIcon
						className="h-5 w-5"
						color={experimentFlag.enabled ? 'red' : 'blue'}
						size={16}
						weight="fill"
					/>
					{experimentFlag.enabled ? (
						<Badge className="bg-red-500 text-white">Red Team</Badge>
					) : (
						<Badge className="bg-blue-500 text-white">Blue Team</Badge>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<InfoIcon className="h-4 w-4" weight="duotone" />
						</TooltipTrigger>
						<TooltipContent className="max-w-xs">
							<div className="space-y-2">
								<p className="font-medium">A/B Test Experiment</p>
								<p className="text-xs leading-relaxed">
									This is a proof-of-concept feature flag demonstrating A/B
									testing capabilities. Approximately 50% of users are randomly
									assigned to the "Red Team" experience, while the other 50% see
									the "Blue Team" experience. This live experiment helps test
									feature flag functionality and user experience variations.
								</p>
							</div>
						</TooltipContent>
					</Tooltip>
				</div>
			)}
			<Suspense fallback={<FlagsListSkeleton />}>
				<FlagsList
					flags={(flags as any) || []}
					isLoading={isLoading}
					onCreateFlag={handleCreateFlag}
					onEditFlag={handleEditFlag}
				/>
			</Suspense>

			{isSheetOpen && (
				<Suspense fallback={null}>
					<FlagSheet
						flag={editingFlag}
						isOpen={isSheetOpen}
						onClose={handleSheetClose}
						websiteId={websiteId}
					/>
				</Suspense>
			)}
		</div>
	);
}
