'use client';

import type { Website } from '@databuddy/shared';
import {
	ArrowRightIcon,
	CheckIcon,
	ClipboardIcon,
	CodeIcon,
	DownloadIcon,
	InfoIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { useAtom } from 'jotai';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { codeToHtml } from 'shiki';
import { toast } from 'sonner';
import { DateRangePicker } from '@/components/date-range-picker';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WebsiteDialog } from '@/components/website-dialog';
import { useDataExport } from '@/hooks/use-data-export';
import { useDeleteWebsite, useTogglePublicWebsite } from '@/hooks/use-websites';
import {
	enableAllAdvancedTrackingAtom,
	enableAllBasicTrackingAtom,
	enableAllOptimizationAtom,
	resetTrackingOptionsAtom,
	toggleTrackingOptionAtom,
	trackingOptionsAtom,
} from '@/stores/jotai/filterAtoms';
import {
	COPY_SUCCESS_TIMEOUT,
	INSTALL_COMMANDS,
	SETTINGS_TABS,
	TOAST_MESSAGES,
} from '../constants/settings-constants';
import { generateNpmCode, generateScriptTag } from '../utils/code-generators';

import type {
	CodeBlockProps,
	DeleteWebsiteDialogProps,
	ExportFormat,
	ExportTabProps,
	OptimizationTabProps,
	PrivacyTabProps,
	SettingsTab,
	TrackingCodeTabProps,
	TrackingOptions,
	TrackingTabProps,
	WebsiteDataTabProps,
} from '../utils/types';
import { SettingsNavigation } from './settings/settings-navigation';
import { WebsiteHeader } from './settings/website-header';

export function WebsiteSettingsTab({
	websiteId,
	websiteData,
}: WebsiteDataTabProps) {
	const router = useRouter();
	const togglePublicMutation = useTogglePublicWebsite();
	const deleteWebsiteMutation = useDeleteWebsite();

	// UI State
	const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<SettingsTab>(
		SETTINGS_TABS.TRACKING
	);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showEditDialog, setShowEditDialog] = useState(false);
	// Data export hook
	const { mutate: exportData, isPending: isExporting } = useDataExport({
		websiteId,
		websiteName: websiteData?.name || undefined,
	});

	// Settings State - use website data directly from props
	const isPublic = websiteData?.isPublic ?? false;

	// Use tracking options atom instead of local state
	const [trackingOptions, setTrackingOptions] = useAtom(trackingOptionsAtom);

	// Event handlers with improved error handling
	const handleCopyCode = useCallback(
		async (code: string, blockId: string, message: string) => {
			try {
				await navigator.clipboard.writeText(code);
				setCopiedBlockId(blockId);
				toast.success(message);
				setTimeout(() => setCopiedBlockId(null), COPY_SUCCESS_TIMEOUT);
			} catch {
				toast.error('Failed to copy to clipboard');
			}
		},
		[]
	);

	const handleTogglePublic = useCallback(async () => {
		if (!websiteData) {
			return;
		}

		const newIsPublic = !isPublic;

		try {
			await toast.promise(
				togglePublicMutation.mutateAsync({
					id: websiteId,
					isPublic: newIsPublic,
				}),
				{
					loading: TOAST_MESSAGES.PRIVACY_UPDATING,
					success: TOAST_MESSAGES.PRIVACY_UPDATED,
					error: TOAST_MESSAGES.PRIVACY_ERROR,
				}
			);
		} catch {
			// Error is already handled by toast.promise
		}
	}, [isPublic, websiteData, websiteId, togglePublicMutation]);

	const [, toggleTrackingOptionAction] = useAtom(toggleTrackingOptionAtom);
	const [, enableAllBasicAction] = useAtom(enableAllBasicTrackingAtom);
	const [, enableAllAdvancedAction] = useAtom(enableAllAdvancedTrackingAtom);
	const [, enableAllOptimizationAction] = useAtom(enableAllOptimizationAtom);
	const [, resetDefaultsAction] = useAtom(resetTrackingOptionsAtom);
	const handleToggleOption = useCallback(
		(option: keyof TrackingOptions) => {
			toggleTrackingOptionAction(option);
		},
		[toggleTrackingOptionAction]
	);

	const handleDeleteWebsite = useCallback(async () => {
		try {
			await toast.promise(
				deleteWebsiteMutation.mutateAsync({ id: websiteId }),
				{
					loading: TOAST_MESSAGES.WEBSITE_DELETING,
					success: () => {
						router.push('/websites');
						return TOAST_MESSAGES.WEBSITE_DELETED;
					},
					error: TOAST_MESSAGES.WEBSITE_DELETE_ERROR,
				}
			);
		} catch {
			// Error is already handled by toast.promise
		}
	}, [websiteId, deleteWebsiteMutation, router]);

	const handleWebsiteUpdated = useCallback(() => {
		setShowEditDialog(false);
		// Cache is automatically updated by the mutation, no need for manual refetch
	}, []);

	const handleExportData = useCallback(
		async (format: ExportFormat, startDate?: string, endDate?: string) => {
			await exportData({ format, startDate, endDate });
		},
		[exportData]
	);

	// Memoized values for performance
	const trackingCode = useMemo(
		() => generateScriptTag(websiteId, trackingOptions),
		[websiteId, trackingOptions]
	);

	const npmCode = useMemo(
		() => generateNpmCode(websiteId, trackingOptions),
		[websiteId, trackingOptions]
	);

	if (!websiteData) {
		return <div>Loading website data...</div>;
	}

	return (
		<div className="space-y-3">
			{/* Header */}
			{websiteData && (
				<WebsiteHeader
					onEditClick={() => setShowEditDialog(true)}
					websiteData={websiteData}
					websiteId={websiteId}
				/>
			)}

			{/* Main Content */}
			<div className="grid grid-cols-12 gap-3">
				<SettingsNavigation
					activeTab={activeTab}
					onDeleteClick={() => setShowDeleteDialog(true)}
					setActiveTab={setActiveTab}
					trackingOptions={trackingOptions}
				/>

				<div className="col-span-12 lg:col-span-7 xl:col-span-9">
					<Card className="rounded border bg-background py-0 shadow-sm">
						<CardContent className="p-3">
							{activeTab === 'tracking' && (
								<TrackingCodeTab
									copiedBlockId={copiedBlockId}
									npmCode={npmCode}
									onCopyCode={handleCopyCode}
									trackingCode={trackingCode}
									websiteData={websiteData}
									websiteId={websiteId}
								/>
							)}

							{activeTab === 'basic' && (
								<BasicTrackingTab
									onToggleOption={handleToggleOption}
									trackingOptions={trackingOptions}
								/>
							)}

							{activeTab === 'advanced' && (
								<AdvancedTrackingTab
									onToggleOption={handleToggleOption}
									trackingOptions={trackingOptions}
								/>
							)}

							{activeTab === 'optimization' && (
								<OptimizationTab
									setTrackingOptions={setTrackingOptions}
									trackingOptions={trackingOptions}
								/>
							)}

							{activeTab === 'privacy' && (
								<PrivacyTab
									isPublic={isPublic}
									onTogglePublic={handleTogglePublic}
									websiteId={websiteId}
								/>
							)}

							{activeTab === 'export' && websiteData && (
								<ExportTab
									isExporting={isExporting}
									onExportData={handleExportData}
									websiteData={websiteData}
									websiteId={websiteId}
								/>
							)}

							{activeTab !== SETTINGS_TABS.TRACKING &&
								activeTab !== 'export' && (
									<TabActions
										onCopyCode={() =>
											handleCopyCode(
												trackingCode,
												'script-tag',
												TOAST_MESSAGES.SCRIPT_COPIED
											)
										}
										onEnableAll={() => {
											switch (activeTab) {
												case SETTINGS_TABS.BASIC:
													enableAllBasicAction();
													break;
												case SETTINGS_TABS.ADVANCED:
													enableAllAdvancedAction();
													break;
												case SETTINGS_TABS.OPTIMIZATION:
													enableAllOptimizationAction();
													break;
												default:
													// No action needed for other tabs
													break;
											}
										}}
										onResetDefaults={resetDefaultsAction}
									/>
								)}
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Edit Dialog */}
			{websiteData && (
				<WebsiteDialog
					onOpenChange={setShowEditDialog}
					onSave={handleWebsiteUpdated}
					open={showEditDialog}
					website={websiteData}
				/>
			)}

			{/* Delete Dialog */}
			{websiteData && (
				<DeleteWebsiteDialog
					isDeleting={deleteWebsiteMutation.isPending}
					onConfirmDelete={handleDeleteWebsite}
					onOpenChange={setShowDeleteDialog}
					open={showDeleteDialog}
					websiteData={websiteData}
				/>
			)}
		</div>
	);
}

// Extracted Components

function TrackingCodeTab({
	trackingCode,
	npmCode,
	websiteData,
	websiteId,
	copiedBlockId,
	onCopyCode,
}: TrackingCodeTabProps) {
	return (
		<div className="space-y-2">
			<div>
				<h3 className="mb-0.5 font-medium text-sm">Tracking Installation</h3>
				<p className="text-muted-foreground text-xs">
					Add this tracking code to your website to start collecting analytics
					data
				</p>
			</div>

			<Tabs className="w-full" defaultValue="script">
				<TabsList className="mb-1 grid h-6 grid-cols-2">
					<TabsTrigger className="h-5 text-xs" value="script">
						Script Tag
					</TabsTrigger>
					<TabsTrigger className="h-5 text-xs" value="npm">
						NPM Package
					</TabsTrigger>
				</TabsList>

				<TabsContent className="mt-0" value="script">
					<CodeBlock
						code={trackingCode}
						copied={copiedBlockId === 'script-tag'}
						description="Add this script to the <head> section of your website:"
						onCopy={() =>
							onCopyCode(
								trackingCode,
								'script-tag',
								TOAST_MESSAGES.SCRIPT_COPIED
							)
						}
					/>
				</TabsContent>

				<TabsContent className="mt-0" value="npm">
					<div className="space-y-1">
						<p className="mb-1 text-muted-foreground text-xs">
							Install the DataBuddy package using your preferred package
							manager:
						</p>

						<Tabs className="w-full" defaultValue="npm">
							<TabsList className="mb-1 grid h-5 grid-cols-4">
								<TabsTrigger className="h-4 text-xs" value="npm">
									npm
								</TabsTrigger>
								<TabsTrigger className="h-4 text-xs" value="yarn">
									yarn
								</TabsTrigger>
								<TabsTrigger className="h-4 text-xs" value="pnpm">
									pnpm
								</TabsTrigger>
								<TabsTrigger className="h-4 text-xs" value="bun">
									bun
								</TabsTrigger>
							</TabsList>

							<TabsContent className="mt-0" value="npm">
								<CodeBlock
									code={INSTALL_COMMANDS.npm}
									copied={copiedBlockId === 'npm-install'}
									description=""
									onCopy={() =>
										onCopyCode(
											INSTALL_COMMANDS.npm,
											'npm-install',
											TOAST_MESSAGES.COMMAND_COPIED
										)
									}
								/>
							</TabsContent>

							<TabsContent className="mt-0" value="yarn">
								<CodeBlock
									code={INSTALL_COMMANDS.yarn}
									copied={copiedBlockId === 'yarn-install'}
									description=""
									onCopy={() =>
										onCopyCode(
											INSTALL_COMMANDS.yarn,
											'yarn-install',
											TOAST_MESSAGES.COMMAND_COPIED
										)
									}
								/>
							</TabsContent>

							<TabsContent className="mt-0" value="pnpm">
								<CodeBlock
									code={INSTALL_COMMANDS.pnpm}
									copied={copiedBlockId === 'pnpm-install'}
									description=""
									onCopy={() =>
										onCopyCode(
											INSTALL_COMMANDS.pnpm,
											'pnpm-install',
											TOAST_MESSAGES.COMMAND_COPIED
										)
									}
								/>
							</TabsContent>

							<TabsContent className="mt-0" value="bun">
								<CodeBlock
									code={INSTALL_COMMANDS.bun}
									copied={copiedBlockId === 'bun-install'}
									description=""
									onCopy={() =>
										onCopyCode(
											INSTALL_COMMANDS.bun,
											'bun-install',
											TOAST_MESSAGES.COMMAND_COPIED
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
								onCopyCode(
									npmCode,
									'tracking-code',
									TOAST_MESSAGES.TRACKING_COPIED
								)
							}
						/>
					</div>
				</TabsContent>
			</Tabs>

			<WebsiteInfoSection websiteData={websiteData} websiteId={websiteId} />
		</div>
	);
}

function CodeBlock({ code, description, copied, onCopy }: CodeBlockProps) {
	const [highlightedCode, setHighlightedCode] = useState<string>('');

	// Determine language based on code content
	const getLanguage = useCallback((codeContent: string) => {
		if (
			codeContent.includes('npm install') ||
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
	}, []);

	useEffect(() => {
		const highlightCode = async () => {
			try {
				const html = await codeToHtml(code, {
					lang: getLanguage(code),
					theme: 'github-light',
				});
				setHighlightedCode(html);
			} catch (error) {
				console.error('Error highlighting code:', error);
				setHighlightedCode(`<pre><code>${code}</code></pre>`);
			}
		};

		highlightCode();
	}, [code, getLanguage]);

	return (
		<div className="space-y-2">
			{description && (
				<p className="text-muted-foreground text-sm">
					{description ===
					'Add this script to the <head> section of your website:' ? (
						<>
							Add this script to the{' '}
							<code className="rounded bg-muted px-1 py-0.5 text-xs">
								&lt;head&gt;
							</code>{' '}
							section of your website:
						</>
					) : (
						description
					)}
				</p>
			)}
			<div className="relative">
				<div
					className="[&_pre]:!bg-transparent [&_code]:!bg-transparent [&_*]:!font-mono overflow-hidden rounded-lg border border-sidebar-border bg-sidebar/40 p-6 text-sm leading-relaxed"
					dangerouslySetInnerHTML={{ __html: highlightedCode }}
					style={{
						fontSize: '14px',
						lineHeight: '1.6',
						fontFamily:
							'var(--font-geist-mono), ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
					}}
				/>
				<Button
					className="absolute top-2 right-2 h-6 w-6 rounded border-0 shadow-none transition-colors duration-200 hover:bg-background/50"
					onClick={onCopy}
					size="icon"
					variant="ghost"
				>
					{copied ? (
						<CheckIcon className="h-3.5 w-3.5 text-green-500" weight="bold" />
					) : (
						<ClipboardIcon
							className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
							weight="regular"
						/>
					)}
				</Button>
			</div>
		</div>
	);
}

function WebsiteInfoSection({
	websiteData,
	websiteId,
}: {
	websiteData: Website;
	websiteId: string;
}) {
	return (
		<div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
			<div className="space-y-3 rounded-lg border border-sidebar-border bg-sidebar/30 p-4">
				<h4 className="flex items-center gap-2 font-medium text-sm">
					<div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
						<InfoIcon className="h-3.5 w-3.5 text-primary" weight="duotone" />
					</div>
					Website Details
				</h4>
				<div className="space-y-2 text-sm">
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Created</span>
						<span className="font-medium">
							{new Date(websiteData.createdAt).toLocaleDateString()}
						</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Website ID</span>
						<div className="flex items-center gap-2">
							<code className="rounded bg-muted/50 px-2 py-1 font-mono text-xs">
								{websiteId}
							</code>
							<Button
								className="h-6 w-6 rounded hover:bg-background/50"
								onClick={() => {
									navigator.clipboard.writeText(websiteId);
									toast.success(TOAST_MESSAGES.WEBSITE_ID_COPIED);
								}}
								size="icon"
								variant="ghost"
							>
								<ClipboardIcon className="h-3 w-3" weight="regular" />
							</Button>
						</div>
					</div>
				</div>
			</div>

			<div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15">
							<CheckIcon
								className="h-3.5 w-3.5 text-primary"
								weight="duotone"
							/>
						</div>
						<h4 className="font-medium text-sm">Ready to Track</h4>
					</div>

					<div className="space-y-2">
						<p className="text-muted-foreground text-sm">
							Add the tracking code to your website to start collecting data.
						</p>
						<Button
							className="h-6 px-0 text-primary text-xs hover:text-primary/80"
							size="sm"
							variant="link"
						>
							View Documentation
							<ArrowRightIcon className="ml-1 h-3 w-3" weight="regular" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function BasicTrackingTab({
	trackingOptions,
	onToggleOption,
}: TrackingTabProps) {
	const trackingOptionsConfig: Array<{
		key: keyof TrackingOptions;
		title: string;
		description: string;
		data: string[];
		required?: boolean;
		inverted?: boolean;
	}> = [
		{
			key: 'disabled',
			title: 'Enable Tracking',
			description: 'Master switch for all tracking functionality',
			required: false,
			inverted: true, // This option is inverted (checked when disabled is false)
			data: [
				'Controls whether any tracking occurs',
				'When disabled, no data is collected',
				'Useful for privacy compliance or testing',
			],
		},
		{
			key: 'trackScreenViews',
			title: 'Page Views',
			description: 'Track when users navigate to different pages',
			required: true,
			data: ['Page URL, title and referrer', 'Timestamp', 'User session ID'],
		},
		{
			key: 'trackHashChanges',
			title: 'Hash Changes',
			description: 'Track navigation using URL hash changes (SPA routing)',
			data: [
				'Hash fragment changes',
				'Previous and new hash values',
				'Useful for single-page applications',
			],
		},
		{
			key: 'trackSessions',
			title: 'Sessions',
			description: 'Track user sessions and engagement',
			data: [
				'Session duration',
				'Session start/end times',
				'Number of pages visited',
				'Bounce detection',
			],
		},
		{
			key: 'trackInteractions',
			title: 'Interactions',
			description: 'Track button clicks and form submissions',
			data: [
				'Element clicked (button, link, etc.)',
				'Element ID, class and text content',
				'Form submission success/failure',
			],
		},
		{
			key: 'trackAttributes',
			title: 'Data Attributes',
			description: 'Track events automatically using HTML data-* attributes',
			data: [
				'Elements with data-track attributes',
				'All data-* attribute values converted to camelCase',
				'Automatic event generation from markup',
			],
		},
		{
			key: 'trackOutgoingLinks',
			title: 'Outbound Links',
			description: 'Track when users click links to external sites',
			data: ['Target URL', 'Link text', 'Page URL where link was clicked'],
		},
	];

	return (
		<TrackingOptionsGrid
			description="Configure what user activity and page data to collect"
			onToggleOption={onToggleOption}
			options={trackingOptionsConfig}
			title="Basic Tracking Options"
			trackingOptions={trackingOptions}
		/>
	);
}

function AdvancedTrackingTab({
	trackingOptions,
	onToggleOption,
}: TrackingTabProps) {
	const advancedOptionsConfig: Array<{
		key: keyof TrackingOptions;
		title: string;
		description: string;
		data: string[];
		required?: boolean;
		inverted?: boolean;
	}> = [
		{
			key: 'trackEngagement',
			title: 'Engagement Tracking',
			description: 'Track detailed user engagement metrics',
			data: [
				'Time on page',
				'Scroll behavior',
				'Mouse movements',
				'Interaction patterns',
			],
		},
		{
			key: 'trackScrollDepth',
			title: 'Scroll Depth',
			description: 'Track how far users scroll on pages',
			data: [
				'Maximum scroll percentage',
				'Scroll milestones (25%, 50%, 75%, 100%)',
				'Time spent at different scroll positions',
			],
		},
		{
			key: 'trackErrors',
			title: 'Error Tracking',
			description: 'Track JavaScript errors and exceptions',
			data: [
				'Error message and type',
				'Stack trace',
				'Browser and OS info',
				'Page URL where error occurred',
			],
		},
		{
			key: 'trackPerformance',
			title: 'Performance',
			description: 'Track page load and runtime performance',
			data: [
				'Page load time',
				'DOM content loaded time',
				'First paint and first contentful paint',
				'Resource timing',
			],
		},
		{
			key: 'trackWebVitals',
			title: 'Web Vitals',
			description: 'Track Core Web Vitals metrics',
			data: [
				'Largest Contentful Paint (LCP)',
				'First Input Delay (FID)',
				'Cumulative Layout Shift (CLS)',
				'Interaction to Next Paint (INP)',
			],
		},
	];

	return (
		<TrackingOptionsGrid
			description="Enable additional tracking features for deeper insights"
			onToggleOption={onToggleOption}
			options={advancedOptionsConfig}
			title="Advanced Tracking Features"
			trackingOptions={trackingOptions}
		/>
	);
}

function TrackingOptionsGrid({
	title,
	description,
	options,
	trackingOptions,
	onToggleOption,
}: {
	title: string;
	description: string;
	options: {
		key: keyof TrackingOptions;
		title: string;
		description: string;
		data: string[];
		required?: boolean;
		inverted?: boolean;
	}[];
	trackingOptions: TrackingOptions;
	onToggleOption: (option: keyof TrackingOptions) => void;
}) {
	return (
		<div className="space-y-2">
			<div className="space-y-0.5">
				<h3 className="font-medium text-sm">{title}</h3>
				<p className="text-muted-foreground text-xs">{description}</p>
			</div>

			<div className="grid grid-cols-2 gap-2">
				{options.map((option) => {
					const { key, ...optionProps } = option;
					return (
						<TrackingOptionCard
							key={key}
							{...optionProps}
							enabled={trackingOptions[key] as boolean}
							inverted={optionProps.inverted ?? false}
							onToggle={() => onToggleOption(key)}
							required={optionProps.required ?? false}
						/>
					);
				})}
			</div>
		</div>
	);
}

function TrackingOptionCard({
	title,
	description,
	data,
	enabled,
	onToggle,
	required = false,
	inverted = false,
}: {
	title: string;
	description: string;
	data: string[];
	enabled: boolean;
	onToggle: () => void;
	required?: boolean;
	inverted?: boolean;
}) {
	const isEnabled = inverted ? !enabled : enabled;

	return (
		<div className="rounded-lg border border-sidebar-border bg-sidebar/20 p-4 transition-all duration-200 hover:bg-sidebar/30">
			<div className="flex items-start justify-between pb-3">
				<div className="min-w-0 flex-1 space-y-1 pr-3">
					<div className="font-medium text-sm">{title}</div>
					<div className="text-muted-foreground text-xs leading-relaxed">
						{description}
					</div>
				</div>
				<Switch checked={isEnabled} onCheckedChange={onToggle} />
			</div>
			{required && !isEnabled && (
				<div className="mb-3 rounded-md border border-destructive/20 bg-destructive/5 p-3">
					<div className="flex items-start gap-2">
						<WarningCircleIcon
							className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive"
							weight="duotone"
						/>
						<div>
							<span className="font-medium text-destructive text-sm">
								Warning:
							</span>
							<p className="mt-1 text-destructive text-xs">
								Disabling page views will prevent analytics from working. This
								option is required.
							</p>
						</div>
					</div>
				</div>
			)}
			<div className="border-sidebar-border border-t pt-3">
				<div className="text-muted-foreground text-xs">
					<span className="font-medium">Data collected:</span>
					<ul className="mt-2 space-y-1">
						{data.map((item: string) => (
							<li className="flex items-start gap-2 text-xs" key={item}>
								<span className="mt-1 text-[8px] text-primary">●</span>
								<span className="leading-relaxed">{item}</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}

function OptimizationTab({
	trackingOptions,
	setTrackingOptions,
}: OptimizationTabProps) {
	return (
		<div className="space-y-2">
			<div className="space-y-0.5">
				<h3 className="font-medium text-sm">Performance Optimization</h3>
				<p className="text-muted-foreground text-xs">
					Configure tracking performance and data collection settings
				</p>
			</div>

			<div className="space-y-2">
				<SamplingRateSection
					onSamplingRateChange={(rate: number) =>
						setTrackingOptions((prev) => ({ ...prev, samplingRate: rate }))
					}
					samplingRate={trackingOptions.samplingRate}
				/>

				<BatchingSection
					setTrackingOptions={setTrackingOptions}
					trackingOptions={trackingOptions}
				/>

				<NetworkResilienceSection
					setTrackingOptions={setTrackingOptions}
					trackingOptions={trackingOptions}
				/>
			</div>
		</div>
	);
}

function SamplingRateSection({
	samplingRate,
	onSamplingRateChange,
}: {
	samplingRate: number;
	onSamplingRateChange: (rate: number) => void;
}) {
	return (
		<div className="rounded-lg border border-sidebar-border bg-sidebar/20 p-4">
			<div className="mb-3 flex items-center gap-2">
				<div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
					<InfoIcon className="h-3.5 w-3.5 text-primary" weight="duotone" />
				</div>
				<h4 className="font-medium text-sm">Sampling Rate</h4>
			</div>
			<div className="space-y-4">
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<Label className="font-medium text-sm" htmlFor="sampling-rate">
								Data Collection Rate
							</Label>
							<span className="font-semibold text-primary text-sm">
								{Math.round(samplingRate * 100)}%
							</span>
						</div>
						<Slider
							className="py-2"
							id="sampling-rate"
							max={100}
							min={1}
							onValueChange={(value) => onSamplingRateChange(value[0] / 100)}
							step={1}
							value={[samplingRate * 100]}
						/>
						<div className="flex justify-between text-muted-foreground text-xs">
							<span>1%</span>
							<span>50%</span>
							<span>100%</span>
						</div>
					</div>

					<div className="space-y-2">
						<p className="text-muted-foreground text-sm leading-relaxed">
							Sampling rate determines what percentage of your visitors will be
							tracked. Lower rates reduce costs.
						</p>
						<div className="rounded-md border border-primary/10 bg-primary/5 p-3">
							<p className="flex items-start gap-2 text-muted-foreground text-xs">
								<InfoIcon
									className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary"
									weight="duotone"
								/>
								<span>
									<strong>Recommended:</strong> 100% for low traffic, 10-50% for
									high traffic
								</span>
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function BatchingSection({
	trackingOptions,
	setTrackingOptions,
}: {
	trackingOptions: TrackingOptions;
	setTrackingOptions: (
		options: TrackingOptions | ((prev: TrackingOptions) => TrackingOptions)
	) => void;
}) {
	return (
		<div className="rounded-lg border border-sidebar-border bg-sidebar/20 p-4">
			<div className="mb-3 flex items-center gap-2">
				<div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
					<CodeIcon className="h-3.5 w-3.5 text-primary" weight="duotone" />
				</div>
				<h4 className="font-medium text-sm">Request Batching</h4>
			</div>
			<div className="space-y-4">
				<div className="flex items-center space-x-3">
					<Switch
						checked={trackingOptions.enableBatching}
						id="enable-batching"
						onCheckedChange={(checked) =>
							setTrackingOptions((prev) => ({
								...prev,
								enableBatching: checked,
							}))
						}
					/>
					<Label className="font-medium text-sm" htmlFor="enable-batching">
						Enable request batching
					</Label>
				</div>

				{trackingOptions.enableBatching && (
					<div className="space-y-4 border-primary/20 border-l-2 pl-6">
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label className="font-medium text-sm" htmlFor="batch-size">
									Batch Size
								</Label>
								<div className="flex items-center space-x-2">
									<Button
										className="h-8 w-8 rounded-md"
										disabled={trackingOptions.batchSize <= 1}
										onClick={() =>
											setTrackingOptions((prev) => ({
												...prev,
												batchSize: Math.max(1, prev.batchSize - 1),
											}))
										}
										size="icon"
										variant="outline"
									>
										-
									</Button>
									<span className="w-8 rounded bg-muted px-2 py-1 text-center font-medium text-sm">
										{trackingOptions.batchSize}
									</span>
									<Button
										className="h-8 w-8 rounded-md"
										disabled={trackingOptions.batchSize >= 10}
										onClick={() =>
											setTrackingOptions((prev) => ({
												...prev,
												batchSize: Math.min(10, prev.batchSize + 1),
											}))
										}
										size="icon"
										variant="outline"
									>
										+
									</Button>
								</div>
							</div>

							<div className="space-y-2">
								<Label className="font-medium text-sm" htmlFor="batch-timeout">
									Batch Timeout (ms)
								</Label>
								<input
									className="h-9 w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-sm"
									id="batch-timeout"
									max="5000"
									min="100"
									onChange={(e) =>
										setTrackingOptions((prev) => ({
											...prev,
											batchTimeout: Number.parseInt(e.target.value, 10),
										}))
									}
									step="100"
									type="number"
									value={trackingOptions.batchTimeout}
								/>
							</div>
						</div>

						<div className="rounded-md border border-primary/10 bg-primary/5 p-3">
							<p className="text-muted-foreground text-xs leading-relaxed">
								<strong>Batching</strong> groups multiple events into single
								requests, reducing server load and improving performance.
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function NetworkResilienceSection({
	trackingOptions,
	setTrackingOptions,
}: {
	trackingOptions: TrackingOptions;
	setTrackingOptions: (
		options: TrackingOptions | ((prev: TrackingOptions) => TrackingOptions)
	) => void;
}) {
	return (
		<div className="rounded border p-2">
			<h4 className="mb-1 font-medium text-xs">Network Resilience</h4>
			<div className="space-y-2">
				<div className="flex items-center space-x-1">
					<Switch
						checked={trackingOptions.enableRetries}
						id="enable-retries"
						onCheckedChange={(checked) =>
							setTrackingOptions((prev) => ({
								...prev,
								enableRetries: checked,
							}))
						}
					/>
					<Label className="text-xs" htmlFor="enable-retries">
						Enable request retries
					</Label>
				</div>

				{trackingOptions.enableRetries && (
					<div className="grid grid-cols-2 gap-2 pl-3">
						<div className="space-y-1">
							<Label className="text-xs" htmlFor="max-retries">
								Maximum Retry Attempts
							</Label>
							<div className="flex items-center space-x-1">
								<Button
									className="h-5 w-5"
									disabled={trackingOptions.maxRetries <= 1}
									onClick={() =>
										setTrackingOptions((prev) => ({
											...prev,
											maxRetries: Math.max(1, prev.maxRetries - 1),
										}))
									}
									size="icon"
									variant="outline"
								>
									-
								</Button>
								<span className="w-6 text-center text-xs">
									{trackingOptions.maxRetries}
								</span>
								<Button
									className="h-5 w-5"
									disabled={trackingOptions.maxRetries >= 10}
									onClick={() =>
										setTrackingOptions((prev) => ({
											...prev,
											maxRetries: Math.min(10, prev.maxRetries + 1),
										}))
									}
									size="icon"
									variant="outline"
								>
									+
								</Button>
							</div>
						</div>

						<div className="space-y-1">
							<Label className="text-xs" htmlFor="retry-delay">
								Initial Retry Delay (ms)
							</Label>
							<input
								className="h-6 w-full rounded border border-input bg-background px-2 py-0.5 text-xs"
								id="retry-delay"
								max="5000"
								min="100"
								onChange={(e) =>
									setTrackingOptions((prev) => ({
										...prev,
										initialRetryDelay: Number.parseInt(e.target.value, 10),
									}))
								}
								step="100"
								type="number"
								value={trackingOptions.initialRetryDelay}
							/>
						</div>

						<div className="col-span-2 text-muted-foreground text-xs">
							Retries use exponential backoff with jitter to avoid overwhelming
							servers.
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function TabActions({
	onResetDefaults,
	onEnableAll,
	onCopyCode,
}: {
	onResetDefaults: () => void;
	onEnableAll: () => void;
	onCopyCode: () => void;
}) {
	return (
		<div className="mt-4 flex justify-between border-t pt-2">
			<Button
				className="h-6 text-xs"
				onClick={onResetDefaults}
				size="sm"
				variant="outline"
			>
				Reset to defaults
			</Button>

			<div className="flex gap-1">
				<Button
					className="h-6 text-xs"
					onClick={onEnableAll}
					size="sm"
					variant="outline"
				>
					<CheckIcon className="mr-1 h-3 w-3" />
					Enable all
				</Button>

				<Button className="h-6 text-xs" onClick={onCopyCode} size="sm">
					<CodeIcon className="mr-1 h-3 w-3" />
					Copy script
				</Button>
			</div>
		</div>
	);
}

function DeleteWebsiteDialog({
	open,
	onOpenChange,
	websiteData,
	isDeleting,
	onConfirmDelete,
}: DeleteWebsiteDialogProps) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Website</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-4">
							<p className="text-muted-foreground text-sm">
								Are you sure you want to delete{' '}
								<span className="font-medium">
									{websiteData.name || websiteData.domain}
								</span>
								? This action cannot be undone.
							</p>

							<div className="rounded-md bg-amber-50 p-3 text-amber-700 text-sm dark:bg-amber-950/20 dark:text-amber-400">
								<div className="flex items-start gap-2">
									<WarningCircleIcon className="h-5 w-5 flex-shrink-0 text-amber-500" />
									<div className="space-y-1">
										<p className="font-medium">Warning:</p>
										<ul className="list-disc space-y-1 pl-4 text-xs">
											<li>All analytics data will be permanently deleted</li>
											<li>Tracking will stop immediately</li>
											<li>All website settings will be lost</li>
										</ul>
									</div>
								</div>
							</div>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-red-600 text-white hover:bg-red-700 hover:text-white"
						disabled={isDeleting}
						onClick={onConfirmDelete}
					>
						{isDeleting ? 'Deleting...' : 'Delete Website'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function PrivacyTab({ isPublic, onTogglePublic, websiteId }: PrivacyTabProps) {
	const shareableLink = `${window.location.origin}/demo/${websiteId}`;

	const handleCopyLink = () => {
		navigator.clipboard.writeText(shareableLink);
		toast.success(TOAST_MESSAGES.SHAREABLE_LINK_COPIED);
	};

	return (
		<div className="space-y-2">
			<div className="space-y-0.5">
				<h3 className="font-medium text-sm">Sharing & Privacy</h3>
				<p className="text-muted-foreground text-xs">
					Manage your website's public visibility and shareable link.
				</p>
			</div>
			<div className="rounded border p-2">
				<div className="flex items-start justify-between">
					<div className="space-y-0.5">
						<Label className="font-medium text-xs" htmlFor="public-access">
							Public Access
						</Label>
						<p className="text-muted-foreground text-xs">
							Allow anyone with the link to view your website's dashboard.
						</p>
					</div>
					<Switch
						checked={isPublic}
						id="public-access"
						onCheckedChange={onTogglePublic}
					/>
				</div>

				{isPublic && (
					<div className="mt-2 space-y-1 border-t pt-2">
						<Label className="text-xs" htmlFor="shareable-link">
							Shareable Link
						</Label>
						<div className="flex items-center gap-1">
							<input
								className="flex-grow rounded border bg-background px-2 py-1 text-xs"
								id="shareable-link"
								readOnly
								type="text"
								value={shareableLink}
							/>
							<Button
								className="h-6 gap-1 px-2 text-xs"
								onClick={handleCopyLink}
								size="sm"
								variant="outline"
							>
								<ClipboardIcon className="h-3 w-3" />
								Copy
							</Button>
						</div>
						<p className="text-muted-foreground text-xs">
							Anyone with this link can view the analytics for this website.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

function ExportTab({
	isExporting,
	onExportData,
	websiteData,
	websiteId: _websiteId,
}: ExportTabProps) {
	const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
	const [dateRange, setDateRange] = useState<DayPickerRange | undefined>(
		undefined
	);
	const [useCustomRange, setUseCustomRange] = useState(false);

	const formatOptions = [
		{
			value: 'json',
			label: 'JSON',
			description: 'Structured data format, ideal for developers',
		},
		{
			value: 'csv',
			label: 'CSV',
			description: 'Spreadsheet format, perfect for Excel/Google Sheets',
		},
		{
			value: 'txt',
			label: 'TXT',
			description: 'Plain text format for simple data viewing',
		},
	] as const;

	const handleExport = () => {
		if (useCustomRange && dateRange?.from && dateRange?.to) {
			const startDate = dayjs(dateRange.from).format('YYYY-MM-DD');
			const endDate = dayjs(dateRange.to).format('YYYY-MM-DD');
			onExportData(selectedFormat, startDate, endDate);
		} else {
			onExportData(selectedFormat);
		}
	};

	return (
		<div className="space-y-3">
			<div className="space-y-0.5">
				<h3 className="font-medium text-sm">Data Export</h3>
				<p className="text-muted-foreground text-xs">
					Export your website's analytics data for backup, analysis, or
					migration purposes.
				</p>
			</div>

			{/* Export Format Selection */}
			<div className="space-y-2">
				<div className="space-y-1">
					<Label className="font-medium text-xs">Export Format</Label>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
						{formatOptions.map((format) => (
							<button
								className={`cursor-pointer rounded border p-2 transition-all hover:border-primary/50 ${
									selectedFormat === format.value
										? 'border-primary bg-primary/5'
										: 'border-border'
								}`}
								key={format.value}
								onClick={() => setSelectedFormat(format.value)}
								type="button"
							>
								<div className="flex items-center gap-2">
									<div className="flex h-6 w-6 items-center justify-center rounded bg-muted">
										<span className="font-mono font-semibold text-xs">
											{format.value.toUpperCase()}
										</span>
									</div>
									<div className="flex-1">
										<div className="font-medium text-xs">{format.label}</div>
										<div className="text-muted-foreground text-xs">
											{format.description}
										</div>
									</div>
									{selectedFormat === format.value && (
										<CheckIcon className="h-3 w-3 text-primary" />
									)}
								</div>
							</button>
						))}
					</div>
				</div>

				{/* Date Range Selection */}
				<div className="space-y-1">
					<div className="flex items-center space-x-1">
						<Switch
							checked={useCustomRange}
							id="custom-range"
							onCheckedChange={setUseCustomRange}
						/>
						<Label className="font-medium text-xs" htmlFor="custom-range">
							Custom Date Range
						</Label>
					</div>
					<p className="text-muted-foreground text-xs">
						{useCustomRange
							? 'Select a specific date range for your export'
							: 'Export all available data (recommended)'}
					</p>

					{useCustomRange && (
						<div className="flex items-center gap-1">
							<Label className="text-xs">Date Range:</Label>
							<DateRangePicker
								className="w-auto"
								maxDate={new Date()}
								minDate={new Date(2020, 0, 1)}
								onChange={(range) => setDateRange(range)}
								value={dateRange}
							/>
						</div>
					)}
				</div>
			</div>

			{/* Export Info */}
			<div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
				<div className="flex items-start gap-3">
					<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary/15">
						<InfoIcon className="h-4 w-4 text-primary" weight="duotone" />
					</div>
					<div className="space-y-3">
						<h4 className="font-medium text-sm">
							What's included in your export?
						</h4>
						<ul className="space-y-2">
							<li className="flex items-start gap-2 text-sm">
								<span className="mt-1 text-[8px] text-primary">●</span>
								<span>Page views and user sessions</span>
							</li>
							<li className="flex items-start gap-2 text-sm">
								<span className="mt-1 text-[8px] text-primary">●</span>
								<span>User interactions and events</span>
							</li>
							<li className="flex items-start gap-2 text-sm">
								<span className="mt-1 text-[8px] text-primary">●</span>
								<span>Performance metrics and Web Vitals</span>
							</li>
							<li className="flex items-start gap-2 text-sm">
								<span className="mt-1 text-[8px] text-primary">●</span>
								<span>Error logs and debugging data</span>
							</li>
							<li className="flex items-start gap-2 text-sm">
								<span className="mt-1 text-[8px] text-primary">●</span>
								<span>Device, browser, and location data</span>
							</li>
						</ul>
						<p className="text-muted-foreground text-sm leading-relaxed">
							Data is exported as a ZIP file containing multiple files organized
							by data type.
						</p>
					</div>
				</div>
			</div>

			{/* Export Actions */}
			<div className="flex items-center justify-between border-t pt-2">
				<div className="space-y-0.5">
					<p className="font-medium text-xs">
						Ready to export {websiteData.name || 'your website'} data?
					</p>
					<p className="text-muted-foreground text-xs">
						Export format: {selectedFormat.toUpperCase()}
						{useCustomRange && dateRange?.from && dateRange?.to && (
							<span>
								{' '}
								• Date range: {dayjs(dateRange.from).format('YYYY-MM-DD')} to{' '}
								{dayjs(dateRange.to).format('YYYY-MM-DD')}
							</span>
						)}
					</p>
				</div>

				<Button
					className="h-6 gap-1 text-xs"
					disabled={
						isExporting ||
						(useCustomRange && !(dateRange?.from && dateRange?.to))
					}
					onClick={handleExport}
					size="sm"
				>
					{isExporting ? (
						<>
							<div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
							Exporting...
						</>
					) : (
						<>
							<DownloadIcon className="h-3 w-3" />
							Export Data
						</>
					)}
				</Button>
			</div>
		</div>
	);
}
