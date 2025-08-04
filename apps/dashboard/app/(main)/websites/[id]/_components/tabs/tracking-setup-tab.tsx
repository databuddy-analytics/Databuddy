'use client';

import {
	ActivityIcon,
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	BookOpenIcon,
	ChatCircleIcon,
	CheckIcon,
	ClipboardIcon,
	CodeIcon,
	FileCodeIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import {
	generateNpmCode,
	generateNpmComponentCode,
	generateScriptTag,
} from '../utils/code-generators';

import { RECOMMENDED_DEFAULTS } from '../utils/tracking-defaults';
import { toggleTrackingOption } from '../utils/tracking-helpers';
import type { TrackingOptions, WebsiteDataTabProps } from '../utils/types';

const CodeBlock = ({
	code,
	description,
	onCopy,
	copied,
}: {
	code: string;
	description?: string;
	onCopy: () => void;
	copied: boolean;
}) => {
	const getLanguage = (codeContent: string) => {
		if (
			codeContent.includes('npm install') ||
			codeContent.includes('yarn add') ||
			codeContent.includes('pnpm add') ||
			codeContent.includes('bun add')
		) {
			return 'bash';
		}
		if (codeContent.includes('<script')) {
			return 'html';
		}
		if (codeContent.includes('import') && codeContent.includes('from')) {
			return 'jsx';
		}
		return 'javascript';
	};

	return (
		<div className="space-y-2">
			{description && (
				<p className="text-muted-foreground text-sm">{description}</p>
			)}
			<div className="relative">
				<div className="overflow-hidden rounded-md border">
					<SyntaxHighlighter
						customStyle={{
							margin: 0,
							fontSize: '12px',
							lineHeight: '1.5',
							padding: '12px',
						}}
						language={getLanguage(code)}
						showLineNumbers={false}
						style={oneDark}
					>
						{code}
					</SyntaxHighlighter>
				</div>
				<Button
					className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
					onClick={onCopy}
					size="icon"
					variant="ghost"
				>
					{copied ? (
						<CheckIcon
							className="h-3.5 w-3.5 text-green-500"
							weight="duotone"
						/>
					) : (
						<ClipboardIcon className="h-3.5 w-3.5" weight="duotone" />
					)}
				</Button>
			</div>
		</div>
	);
};

export function WebsiteTrackingSetupTab({ websiteId }: WebsiteDataTabProps) {
	const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
	const [installMethod, setInstallMethod] = useState<'script' | 'npm'>(
		'script'
	);
	const [trackingOptions, setTrackingOptions] =
		useState<TrackingOptions>(RECOMMENDED_DEFAULTS);

	const trackingCode = generateScriptTag(websiteId, trackingOptions);
	const npmCode = generateNpmCode(websiteId, trackingOptions);

	const handleCopyCode = (code: string, blockId: string, message: string) => {
		navigator.clipboard.writeText(code);
		setCopiedBlockId(blockId);
		toast.success(message);
		setTimeout(() => setCopiedBlockId(null), 2000);
	};

	const handleToggleOption = (option: keyof TrackingOptions) => {
		setTrackingOptions((prev) => toggleTrackingOption(prev, option));
	};

	const utils = trpc.useUtils();

	const handleRefresh = () => {
		utils.websites.isTrackingSetup.invalidate({ websiteId });
		toast.success('Checking tracking status...');
	};

	return (
		<div className="space-y-6">
			{/* Quick Setup Alert */}
			<Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20">
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2 text-lg">
							<WarningCircleIcon className="h-5 w-5" weight="duotone" />
							Tracking Not Setup
						</CardTitle>
						<Button
							aria-label="Refresh tracking status"
							className="h-8 w-8"
							onClick={handleRefresh}
							size="icon"
							variant="outline"
						>
							<ArrowClockwiseIcon className="h-4 w-4" weight="fill" />
						</Button>
					</div>
					<CardDescription>
						Install the tracking script to start collecting analytics data for
						your website.
					</CardDescription>
				</CardHeader>
			</Card>

			{/* Installation Instructions */}
			<Card>
				<CardHeader className="pb-4">
					<CardTitle className="flex items-center gap-2 text-lg">
						<CodeIcon className="h-5 w-5" weight="duotone" />
						Installation
					</CardTitle>
					<CardDescription>
						Choose your preferred installation method
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Tabs
						onValueChange={(value) =>
							setInstallMethod(value as 'script' | 'npm')
						}
						value={installMethod}
					>
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger className="flex items-center gap-2" value="script">
								<FileCodeIcon className="h-4 w-4" weight="duotone" />
								HTML Script Tag
							</TabsTrigger>
							<TabsTrigger className="flex items-center gap-2" value="npm">
								<CodeIcon className="h-4 w-4" weight="duotone" />
								NPM Package
							</TabsTrigger>
						</TabsList>

						<TabsContent className="space-y-4" value="script">
							<CodeBlock
								code={trackingCode}
								copied={copiedBlockId === 'script-tag'}
								description="Add this script to the <head> section of your HTML:"
								onCopy={() =>
									handleCopyCode(
										trackingCode,
										'script-tag',
										'Script tag copied to clipboard!'
									)
								}
							/>
							<p className="text-muted-foreground text-xs">
								Data will appear within a few minutes after installation.
							</p>
						</TabsContent>

						<TabsContent className="space-y-4" value="npm">
							<div className="space-y-2">
								<p className="mb-3 text-muted-foreground text-xs">
									Install the DataBuddy package using your preferred package
									manager:
								</p>

								<Tabs className="w-full" defaultValue="npm">
									<TabsList className="mb-2 grid h-8 grid-cols-4">
										<TabsTrigger className="text-xs" value="npm">
											npm
										</TabsTrigger>
										<TabsTrigger className="text-xs" value="yarn">
											yarn
										</TabsTrigger>
										<TabsTrigger className="text-xs" value="pnpm">
											pnpm
										</TabsTrigger>
										<TabsTrigger className="text-xs" value="bun">
											bun
										</TabsTrigger>
									</TabsList>

									<TabsContent className="mt-0" value="npm">
										<CodeBlock
											code="npm install @databuddy/sdk"
											copied={copiedBlockId === 'npm-install'}
											description=""
											onCopy={() =>
												handleCopyCode(
													'npm install @databuddy/sdk',
													'npm-install',
													'Command copied to clipboard!'
												)
											}
										/>
									</TabsContent>

									<TabsContent className="mt-0" value="yarn">
										<CodeBlock
											code="yarn add @databuddy/sdk"
											copied={copiedBlockId === 'yarn-install'}
											description=""
											onCopy={() =>
												handleCopyCode(
													'yarn add @databuddy/sdk',
													'yarn-install',
													'Command copied to clipboard!'
												)
											}
										/>
									</TabsContent>

									<TabsContent className="mt-0" value="pnpm">
										<CodeBlock
											code="pnpm add @databuddy/sdk"
											copied={copiedBlockId === 'pnpm-install'}
											description=""
											onCopy={() =>
												handleCopyCode(
													'pnpm add @databuddy/sdk',
													'pnpm-install',
													'Command copied to clipboard!'
												)
											}
										/>
									</TabsContent>

									<TabsContent className="mt-0" value="bun">
										<CodeBlock
											code="bun add @databuddy/sdk"
											copied={copiedBlockId === 'bun-install'}
											description=""
											onCopy={() =>
												handleCopyCode(
													'bun add @databuddy/sdk',
													'bun-install',
													'Command copied to clipboard!'
												)
											}
										/>
									</TabsContent>
								</Tabs>

								<CodeBlock
									code={npmCode}
									copied={copiedBlockId === 'tracking-code'}
									description="Then initialize the tracker in your code:"
									onCopy={() =>
										handleCopyCode(
											generateNpmComponentCode(websiteId, trackingOptions),
											'tracking-code',
											'Tracking code copied to clipboard!'
										)
									}
								/>
							</div>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>

			{/* Tracking Configuration */}
			<Card>
				<CardHeader className="pb-4">
					<CardTitle className="flex items-center gap-2 text-lg">
						<ActivityIcon className="h-5 w-5" weight="duotone" />
						Configuration
					</CardTitle>
					<CardDescription>
						Customize tracking options (optional)
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
						{/* Core Tracking */}
						<div className="space-y-3">
							<h4 className="font-medium text-sm">Core Tracking</h4>
							<div className="space-y-2">
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="disabled">
											Enable Tracking
										</Label>
										<div className="text-muted-foreground text-xs">
											Master switch for all tracking
										</div>
									</div>
									<Switch
										checked={!trackingOptions.disabled}
										id="disabled"
										onCheckedChange={() => handleToggleOption('disabled')}
									/>
								</div>
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackScreenViews">
											Page Views
										</Label>
										<div className="text-muted-foreground text-xs">
											Track page visits
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackScreenViews}
										id="trackScreenViews"
										onCheckedChange={() =>
											handleToggleOption('trackScreenViews')
										}
									/>
								</div>
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackHashChanges">
											Hash Changes
										</Label>
										<div className="text-muted-foreground text-xs">
											Track URL hash navigation
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackHashChanges}
										id="trackHashChanges"
										onCheckedChange={() =>
											handleToggleOption('trackHashChanges')
										}
									/>
								</div>
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackSessions">
											Sessions
										</Label>
										<div className="text-muted-foreground text-xs">
											Track session duration
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackSessions}
										id="trackSessions"
										onCheckedChange={() => handleToggleOption('trackSessions')}
									/>
								</div>
							</div>
						</div>

						{/* Interaction Tracking */}
						<div className="space-y-3">
							<h4 className="font-medium text-sm">Interaction Tracking</h4>
							<div className="space-y-2">
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackInteractions">
											Interactions
										</Label>
										<div className="text-muted-foreground text-xs">
											Track clicks and forms
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackInteractions}
										id="trackInteractions"
										onCheckedChange={() =>
											handleToggleOption('trackInteractions')
										}
									/>
								</div>
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackAttributes">
											Data Attributes
										</Label>
										<div className="text-muted-foreground text-xs">
											Track data-* attributes
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackAttributes}
										id="trackAttributes"
										onCheckedChange={() =>
											handleToggleOption('trackAttributes')
										}
									/>
								</div>
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackOutgoingLinks">
											Outbound Links
										</Label>
										<div className="text-muted-foreground text-xs">
											Track external link clicks
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackOutgoingLinks}
										id="trackOutgoingLinks"
										onCheckedChange={() =>
											handleToggleOption('trackOutgoingLinks')
										}
									/>
								</div>
							</div>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
						{/* Engagement Tracking */}
						<div className="space-y-3">
							<h4 className="font-medium text-sm">Engagement Tracking</h4>
							<div className="space-y-2">
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackEngagement">
											Engagement
										</Label>
										<div className="text-muted-foreground text-xs">
											Track user engagement
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackEngagement}
										id="trackEngagement"
										onCheckedChange={() =>
											handleToggleOption('trackEngagement')
										}
									/>
								</div>
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackScrollDepth">
											Scroll Depth
										</Label>
										<div className="text-muted-foreground text-xs">
											Track scroll percentage
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackScrollDepth}
										id="trackScrollDepth"
										onCheckedChange={() =>
											handleToggleOption('trackScrollDepth')
										}
									/>
								</div>
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackExitIntent">
											Exit Intent
										</Label>
										<div className="text-muted-foreground text-xs">
											Track exit behavior
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackExitIntent}
										id="trackExitIntent"
										onCheckedChange={() =>
											handleToggleOption('trackExitIntent')
										}
									/>
								</div>
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackBounceRate">
											Bounce Rate
										</Label>
										<div className="text-muted-foreground text-xs">
											Track bounce detection
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackBounceRate}
										id="trackBounceRate"
										onCheckedChange={() =>
											handleToggleOption('trackBounceRate')
										}
									/>
								</div>
							</div>
						</div>

						{/* Performance Tracking */}
						<div className="space-y-3">
							<h4 className="font-medium text-sm">Performance Tracking</h4>
							<div className="space-y-2">
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackPerformance">
											Load Times
										</Label>
										<div className="text-muted-foreground text-xs">
											Track page performance
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackPerformance}
										id="trackPerformance"
										onCheckedChange={() =>
											handleToggleOption('trackPerformance')
										}
									/>
								</div>
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackWebVitals">
											Web Vitals
										</Label>
										<div className="text-muted-foreground text-xs">
											Track Core Web Vitals
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackWebVitals}
										id="trackWebVitals"
										onCheckedChange={() => handleToggleOption('trackWebVitals')}
									/>
								</div>
								<div className="flex items-center justify-between py-2">
									<div>
										<Label className="text-sm" htmlFor="trackErrors">
											Errors
										</Label>
										<div className="text-muted-foreground text-xs">
											Track JS errors
										</div>
									</div>
									<Switch
										checked={trackingOptions.trackErrors}
										id="trackErrors"
										onCheckedChange={() => handleToggleOption('trackErrors')}
									/>
								</div>
							</div>
						</div>
					</div>

					{/* Optimization */}
					<div className="space-y-3">
						<h4 className="font-medium text-sm">Optimization</h4>
						<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
							<div className="flex items-center justify-between py-2">
								<div>
									<Label className="text-sm" htmlFor="enableBatching">
										Enable Batching
									</Label>
									<div className="text-muted-foreground text-xs">
										Batch requests for efficiency
									</div>
								</div>
								<Switch
									checked={trackingOptions.enableBatching}
									id="enableBatching"
									onCheckedChange={() => handleToggleOption('enableBatching')}
								/>
							</div>
							<div className="flex items-center justify-between py-2">
								<div>
									<Label className="text-sm" htmlFor="enableRetries">
										Enable Retries
									</Label>
									<div className="text-muted-foreground text-xs">
										Retry failed requests
									</div>
								</div>
								<Switch
									checked={trackingOptions.enableRetries}
									id="enableRetries"
									onCheckedChange={() => handleToggleOption('enableRetries')}
								/>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Help Links */}
			<div className="grid grid-cols-2 gap-3">
				<Button asChild size="sm" variant="outline">
					<a
						className="flex items-center justify-center gap-2"
						href="https://www.databuddy.cc/docs"
						rel="noopener noreferrer"
						target="_blank"
					>
						<BookOpenIcon className="h-4 w-4" weight="duotone" />
						Documentation
					</a>
				</Button>
				<Button asChild size="sm" variant="outline">
					<a
						className="flex items-center justify-center gap-2"
						href="mailto:support@databuddy.cc"
					>
						<ChatCircleIcon className="h-4 w-4" weight="duotone" />
						Get Support
					</a>
				</Button>
			</div>
		</div>
	);
}
