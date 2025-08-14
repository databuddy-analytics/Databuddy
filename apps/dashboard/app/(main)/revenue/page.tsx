'use client';

import {
	ArrowRightIcon,
	ChartBarIcon,
	CheckCircleIcon,
	ClockIcon,
	CurrencyDollarIcon,
	GearSixIcon,
	GlobeIcon,
	LightningIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWebsites } from '@/hooks/use-websites';
import { QuickSettingsModal } from './_components/quick-settings-modal';
import { RevenueOverviewTab } from './_components/tabs/overview-tab';
import { RevenueSettingsTab } from './_components/tabs/settings-tab';
import { useRevenueConfig } from './hooks/use-revenue-config';

export default function RevenuePage() {
	const [activeTab, setActiveTab] = useState('overview');
	const revenueConfig = useRevenueConfig();
	const { websites, isLoading: websitesLoading } = useWebsites();

	if (revenueConfig.isLoading) {
		return (
			<div className="mx-auto max-w-[1200px] p-3 sm:p-4">
				<div className="flex items-center justify-center py-12">
					<div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-[1200px] space-y-6 p-3 sm:p-4">
			{/* Header */}
			<div className="-mx-3 sm:-mx-4 border-b bg-gradient-to-r from-background via-background to-muted/20 px-3 pb-4 sm:px-4">
				<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
					<div className="flex items-center gap-3">
						<div className="rounded-xl border border-green-200 bg-gradient-to-br from-green-100 to-green-50 p-3 dark:border-green-800/50 dark:from-green-900/20 dark:to-green-950/20">
							<CurrencyDollarIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
						</div>
						<div>
							<h1 className="font-bold text-2xl">Revenue Settings</h1>
							<p className="text-muted-foreground">
								Configure Stripe integration and manage revenue tracking
							</p>
						</div>
					</div>
					<div className="flex items-center gap-3">
						{revenueConfig.isSetupComplete ? (
							<div className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-950/20">
								<CheckCircleIcon
									className="h-4 w-4 text-green-500"
									size={16}
									weight="fill"
								/>
								<span className="font-medium text-green-600 text-sm dark:text-green-400">
									{revenueConfig.isLiveMode ? 'Live Mode' : 'Test Mode'}
								</span>
							</div>
						) : (
							<div className="flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-800 dark:bg-orange-950/20">
								<ClockIcon className="h-4 w-4 text-orange-500" size={16} />
								<span className="font-medium text-orange-600 text-sm dark:text-orange-400">
									Setup Required
								</span>
							</div>
						)}
						<QuickSettingsModal
							copyToClipboard={revenueConfig.copyToClipboard}
							isLiveMode={revenueConfig.isLiveMode}
							isRegeneratingToken={revenueConfig.isRegeneratingToken}
							isSaving={revenueConfig.isCreating}
							onRegenerateToken={revenueConfig.regenerateWebhookToken}
							onSave={(data) => {
								revenueConfig.updateConfig({
									webhookSecret: data.webhookSecret,
									isLiveMode: data.isLiveMode,
								});
							}}
							webhookSecret={revenueConfig.webhookSecret}
							webhookToken={revenueConfig.webhookToken}
							webhookUrl={revenueConfig.webhookUrl}
						/>
					</div>
				</div>
			</div>

			{/* Setup Required Banner */}
			{!revenueConfig.isSetupComplete && (
				<Card className="border-orange-200 bg-orange-50 dark:border-orange-800/50 dark:bg-orange-950/20">
					<CardContent className="p-6">
						<div className="flex items-start gap-4">
							<div className="rounded-lg bg-orange-100 p-3 dark:bg-orange-900/30">
								<WarningCircleIcon
									className="h-6 w-6 text-orange-600 dark:text-orange-400"
									size={24}
									weight="duotone"
								/>
							</div>
							<div className="flex-1">
								<h3 className="mb-2 font-semibold text-lg text-orange-900 dark:text-orange-100">
									Revenue Tracking Not Configured
								</h3>
								<p className="mb-4 text-orange-700 dark:text-orange-200">
									Set up your Stripe webhook to start tracking revenue across
									all your websites. This is a one-time setup that works for all
									your sites.
								</p>
								<div className="flex flex-col gap-3 sm:flex-row">
									<Button
										className="gap-2"
										onClick={() => setActiveTab('settings')}
										size="sm"
									>
										<LightningIcon
											className="h-4 w-4"
											size={16}
											weight="duotone"
										/>
										Configure Stripe Integration
									</Button>
									<Button asChild size="sm" variant="outline">
										<Link
											href="https://docs.databuddy.cc/docs/Integrations/stripe"
											rel="noopener noreferrer"
											target="_blank"
										>
											View Setup Guide
										</Link>
									</Button>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Tabs */}
			<Tabs
				className="space-y-4"
				onValueChange={setActiveTab}
				value={activeTab}
			>
				<div className="border-b">
					<TabsList className="h-10 w-full justify-start overflow-x-auto bg-transparent p-0">
						<TabsTrigger
							className="relative h-10 whitespace-nowrap rounded-none px-4 text-xs transition-colors hover:bg-muted/50 sm:text-sm"
							value="overview"
						>
							<ChartBarIcon
								className="mr-2 h-4 w-4"
								size={16}
								weight="duotone"
							/>
							Overview
							{activeTab === 'overview' && (
								<div className="absolute bottom-0 left-0 h-[2px] w-full bg-primary" />
							)}
						</TabsTrigger>
						<TabsTrigger
							className="relative h-10 whitespace-nowrap rounded-none px-4 text-xs transition-colors hover:bg-muted/50 sm:text-sm"
							value="settings"
						>
							<GearSixIcon
								className="mr-2 h-4 w-4"
								size={16}
								weight="duotone"
							/>
							Settings
							{!revenueConfig.isSetupComplete && (
								<div className="ml-1 h-2 w-2 animate-pulse rounded-full bg-orange-500" />
							)}
							{activeTab === 'settings' && (
								<div className="absolute bottom-0 left-0 h-[2px] w-full bg-primary" />
							)}
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent className="space-y-6" value="overview">
					{/* Global Revenue Overview */}
					{revenueConfig.isSetupComplete && (
						<RevenueOverviewTab
							isLiveMode={revenueConfig.isLiveMode}
							isSetupComplete={revenueConfig.isSetupComplete}
							onSetupClick={() => setActiveTab('settings')}
							setupProgress={revenueConfig.setupProgress}
						/>
					)}

					{/* Website Revenue Pages */}
					{revenueConfig.isSetupComplete && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h2 className="font-semibold text-lg">
									Individual Website Analytics
								</h2>
								<Badge className="text-xs" variant="secondary">
									{websites?.length || 0} website
									{(websites?.length || 0) !== 1 ? 's' : ''}
								</Badge>
							</div>

							{websitesLoading ? (
								<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
									{[1, 2, 3].map((i) => (
										<Card className="animate-pulse" key={i}>
											<CardHeader>
												<div className="h-4 w-3/4 rounded bg-muted" />
												<div className="h-3 w-1/2 rounded bg-muted" />
											</CardHeader>
											<CardContent>
												<div className="mb-2 h-8 rounded bg-muted" />
												<div className="h-3 w-2/3 rounded bg-muted" />
											</CardContent>
										</Card>
									))}
								</div>
							) : websites && websites.length > 0 ? (
								<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
									{websites.map((website) => (
										<Link
											href={`/websites/${website.id}/revenue`}
											key={website.id}
										>
											<Card className="group cursor-pointer border-l-4 border-l-primary/20 transition-all duration-300 hover:border-l-primary hover:shadow-lg">
												<CardHeader className="pb-3">
													<div className="flex items-center justify-between">
														<div className="flex min-w-0 flex-1 items-center gap-3">
															<div className="rounded-lg border border-primary/20 bg-primary/10 p-2 transition-colors group-hover:bg-primary/20">
																<GlobeIcon
																	className="h-4 w-4 text-primary"
																	size={16}
																	weight="duotone"
																/>
															</div>
															<div className="min-w-0 flex-1">
																<h3 className="truncate font-semibold text-sm transition-colors group-hover:text-primary">
																	{website.name}
																</h3>
																<p className="truncate text-muted-foreground text-xs">
																	{website.domain}
																</p>
															</div>
														</div>
														<ArrowRightIcon className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
													</div>
												</CardHeader>
												<CardContent className="pt-0">
													<div className="flex items-center justify-center py-6 text-muted-foreground">
														<div className="text-center">
															<CurrencyDollarIcon
																className="mx-auto mb-2 h-8 w-8 opacity-50 transition-opacity group-hover:opacity-70"
																size={32}
																weight="duotone"
															/>
															<p className="font-medium text-sm">
																View Revenue Analytics
															</p>
															<p className="text-muted-foreground text-xs">
																Payments, trends & insights
															</p>
														</div>
													</div>
												</CardContent>
											</Card>
										</Link>
									))}
								</div>
							) : (
								<Card className="border-dashed">
									<CardContent className="p-8 text-center">
										<GlobeIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-50" />
										<h3 className="mb-2 font-semibold">No Websites Found</h3>
										<p className="mb-4 text-muted-foreground text-sm">
											Add websites to start tracking revenue analytics.
										</p>
										<Button asChild>
											<Link href="/websites">Add Your First Website</Link>
										</Button>
									</CardContent>
								</Card>
							)}
						</div>
					)}
				</TabsContent>

				<TabsContent className="space-y-6" value="settings">
					<RevenueSettingsTab revenueConfig={revenueConfig} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
