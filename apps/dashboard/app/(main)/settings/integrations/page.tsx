'use client';

import {
	CheckCircleIcon,
	LinkIcon,
	PlusIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
	type Integration,
	useDisconnectIntegration,
	useIntegrations,
} from '@/hooks/use-integrations';

const categoryLabels = {
	deployment: 'Deployment',
	analytics: 'Analytics',
	monitoring: 'Monitoring',
	communication: 'Communication',
};

function LoadingSkeleton() {
	return (
		<div className="space-y-8">
			<div className="space-y-3">
				<Skeleton className="h-9 w-64" />
				<Skeleton className="h-5 w-96" />
			</div>
			<div className="space-y-6">
				<div className="flex items-center gap-3">
					<Skeleton className="h-7 w-32" />
					<Skeleton className="h-6 w-6 rounded-full" />
				</div>
				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{[1, 2, 3, 4].map((num) => (
						<Card className="animate-pulse border-0 shadow-sm" key={num}>
							<CardContent className="p-6">
								<div className="space-y-4">
									<div className="flex items-start justify-between">
										<Skeleton className="h-12 w-12 rounded-lg" />
										<Skeleton className="h-5 w-16 rounded-full" />
									</div>
									<div className="space-y-2">
										<Skeleton className="h-6 w-24" />
										<Skeleton className="h-4 w-full" />
										<Skeleton className="h-4 w-3/4" />
									</div>
									<Skeleton className="h-9 w-full rounded-lg" />
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		</div>
	);
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex h-64 items-center justify-center">
			<div className="text-center">
				<WarningIcon className="mx-auto h-12 w-12 text-destructive" />
				<h3 className="mt-2 font-medium text-foreground text-sm">
					Failed to load integrations
				</h3>
				<p className="mt-1 text-muted-foreground text-sm">
					There was an issue loading your integrations. Please try again.
				</p>
				<Button className="mt-4" onClick={onRetry} variant="outline">
					Try Again
				</Button>
			</div>
		</div>
	);
}

export default function IntegrationsPage() {
	const searchParams = useSearchParams();
	const [connectingProvider, setConnectingProvider] = useState<string | null>(
		null
	);
	const [showSuccessMessage, setShowSuccessMessage] = useState(false);
	const { integrations, isLoading, isError, refetch } = useIntegrations();
	const disconnectMutation = useDisconnectIntegration();

	// Check for success message from OAuth callback
	useEffect(() => {
		if (searchParams.get('vercel_integrated') === 'true') {
			setShowSuccessMessage(true);
			refetch(); // Refresh integrations to show the new connection

			// Remove the query parameter from URL
			const url = new URL(window.location.href);
			url.searchParams.delete('vercel_integrated');
			window.history.replaceState({}, '', url.toString());

			// Hide success message after 5 seconds
			const timer = setTimeout(() => {
				setShowSuccessMessage(false);
			}, 5000);

			return () => clearTimeout(timer);
		}
	}, [searchParams, refetch]);

	const handleConnect = (integration: Integration) => {
		if (integration.id === 'vercel') {
			setConnectingProvider(integration.id);
			window.location.href = 'https://vercel.com/marketplace/databuddy';
		}
	};

	const handleDisconnect = async (integration: Integration) => {
		try {
			await disconnectMutation.mutateAsync({
				provider: integration.id as 'vercel',
			});
		} catch (error) {
			console.error('Failed to disconnect integration:', error);
		}
	};

	if (isLoading) {
		return <LoadingSkeleton />;
	}

	if (isError) {
		return <ErrorState onRetry={refetch} />;
	}

	const groupedIntegrations = integrations.reduce(
		(acc, integration) => {
			if (!acc[integration.category]) {
				acc[integration.category] = [];
			}
			acc[integration.category].push(integration);
			return acc;
		},
		{} as Record<string, Integration[]>
	);

	return (
		<div className="space-y-8">
			{showSuccessMessage && (
				<div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/50">
					<div className="flex items-start gap-3">
						<CheckCircleIcon className="mt-0.5 h-5 w-5 text-green-600 dark:text-green-400" />
						<div className="flex-1">
							<h3 className="font-semibold text-green-900 dark:text-green-100">
								Integration Connected Successfully
							</h3>
							<p className="mt-1 text-green-700 text-sm dark:text-green-300">
								Vercel has been connected to your account. You can now manage
								your deployments.
							</p>
						</div>
						<Button
							className="-mt-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200"
							onClick={() => setShowSuccessMessage(false)}
							size="sm"
							variant="ghost"
						>
							×
						</Button>
					</div>
				</div>
			)}

			{Object.entries(groupedIntegrations).map(
				([category, categoryIntegrations]) => (
					<div className="space-y-6" key={category}>
						<div className="flex items-center gap-3">
							<h2 className="font-semibold text-foreground text-xl">
								{categoryLabels[category as keyof typeof categoryLabels]}
							</h2>
							<div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs">
								{categoryIntegrations.length}
							</div>
						</div>

						<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{categoryIntegrations.map((integration) => (
								<Card
									className="group relative border-0 shadow-sm transition-all duration-200 hover:shadow-black/5 hover:shadow-md"
									key={integration.id}
								>
									<CardContent className="p-6">
										<div className="space-y-4">
											<div className="flex items-start justify-between">
												<div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-white shadow-sm dark:bg-gray-800">
													<Image
														alt={`${integration.name} logo`}
														className="h-7 w-7 brightness-0 dark:brightness-100"
														height={28}
														src={integration.logo}
														width={28}
													/>
												</div>
												{integration.connected && (
													<Badge
														className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-100"
														variant="default"
													>
														Connected
													</Badge>
												)}
											</div>

											<div className="space-y-2">
												<h3 className="font-semibold text-lg leading-none tracking-tight">
													{integration.name}
												</h3>
												<p className="text-muted-foreground text-sm leading-relaxed">
													{integration.description}
												</p>
											</div>

											<div className="pt-2">
												{integration.connected ? (
													<div className="flex gap-2">
														<Link
															href={`/settings/integrations/${integration.id}`}
														>
															<Button
																className="flex-1"
																size="sm"
																variant="outline"
															>
																Configure
															</Button>
														</Link>
														<Button
															className="text-destructive hover:bg-destructive/10 hover:text-destructive"
															disabled={disconnectMutation.isPending}
															onClick={() => handleDisconnect(integration)}
															size="sm"
															variant="ghost"
														>
															{disconnectMutation.isPending
																? 'Disconnecting...'
																: 'Disconnect'}
														</Button>
													</div>
												) : (
													<Button
														className="w-full font-medium"
														disabled={connectingProvider === integration.id}
														onClick={() => handleConnect(integration)}
													>
														{connectingProvider === integration.id ? (
															'Connecting...'
														) : (
															<>
																<PlusIcon className="mr-2 h-4 w-4" />
																Connect
															</>
														)}
													</Button>
												)}
											</div>
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					</div>
				)
			)}

			{integrations.length === 0 && (
				<div className="flex h-64 items-center justify-center">
					<div className="text-center">
						<LinkIcon className="mx-auto h-12 w-12 text-muted-foreground" />
						<h3 className="mt-2 font-medium text-foreground text-sm">
							No integrations available
						</h3>
						<p className="mt-1 text-muted-foreground text-sm">
							Check back later for new integrations.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
