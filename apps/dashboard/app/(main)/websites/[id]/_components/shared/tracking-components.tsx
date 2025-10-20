'use client';

import {
	CheckIcon,
	ClipboardIcon,
	InfoIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type {
	CodeBlockProps,
	TrackingOptionCardProps,
	TrackingOptionsGridProps,
} from '../utils/types';

/**
 * Shared CodeBlock component for displaying syntax-highlighted code
 */
export function CodeBlock({
	code,
	description,
	copied,
	onCopy,
}: CodeBlockProps) {
	const [highlightedCode, setHighlightedCode] = useState<string>('');

	const getLanguage = useCallback((codeContent: string) => {
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
	}, []);

	useEffect(() => {
		const highlightCode = async () => {
			try {
				const isDarkMode = document.documentElement.classList.contains('dark');
				const theme = isDarkMode ? 'github-dark' : 'github-light';

				const html = await codeToHtml(code, {
					lang: getLanguage(code),
					theme,
				});
				setHighlightedCode(html);
			} catch (error) {
				console.error('Error highlighting code:', error);
				setHighlightedCode(`<pre><code>${code}</code></pre>`);
			}
		};

		highlightCode();

		// Listen for theme changes
		const observer = new MutationObserver(() => {
			highlightCode();
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class'],
		});

		return () => observer.disconnect();
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
					className="[&_pre]:!bg-transparent [&_code]:!bg-transparent [&_*]:!font-mono overflow-hidden rounded border bg-muted p-6 text-sm leading-relaxed"
					dangerouslySetInnerHTML={{ __html: highlightedCode }}
					style={{
						fontSize: '14px',
						lineHeight: '1.6',
						fontFamily:
							'var(--font-geist-mono), ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
					}}
				/>
				<Button
					className="absolute top-2 right-2 h-6 w-6 rounded border-0 shadow-none transition-colors duration-200 hover:bg-accent"
					onClick={onCopy}
					size="icon"
					variant="ghost"
				>
					{copied ? (
						<CheckIcon
							className="h-3.5 w-3.5 text-accent-foreground"
							weight="bold"
						/>
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

/**
 * Package manager installation tabs
 */
export function PackageManagerTabs({
	copiedBlockId,
	onCopyCode,
}: {
	copiedBlockId: string | null;
	onCopyCode: (code: string, blockId: string, message: string) => void;
}) {
	const installCommands = {
		npm: 'npm install @databuddy/sdk',
		yarn: 'yarn add @databuddy/sdk',
		pnpm: 'pnpm add @databuddy/sdk',
		bun: 'bun add @databuddy/sdk',
	};

	return (
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

			{Object.entries(installCommands).map(([manager, command]) => (
				<TabsContent className="mt-0" key={manager} value={manager}>
					<CodeBlock
						code={command}
						copied={copiedBlockId === `${manager}-install`}
						description=""
						onCopy={() =>
							onCopyCode(
								command,
								`${manager}-install`,
								'Command copied to clipboard!'
							)
						}
					/>
				</TabsContent>
			))}
		</Tabs>
	);
}

/**
 * Shared tracking option card component
 */
export function TrackingOptionCard({
	title,
	description,
	data,
	enabled,
	onToggle,
	required = false,
	inverted = false,
}: TrackingOptionCardProps) {
	const isEnabled = inverted ? !enabled : enabled;

	return (
		<div className="rounded border bg-card p-4 transition-all duration-200 hover:bg-muted/20">
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
				<div className="mb-3 rounded border border-destructive/20 bg-destructive/10 p-3">
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
			<div className="border-t pt-3">
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

/**
 * Grid layout for tracking options
 */
export function TrackingOptionsGrid({
	title,
	description,
	options,
	trackingOptions,
	onToggleOption,
}: TrackingOptionsGridProps) {
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

/**
 * Status card component for tracking setup
 */
export function TrackingStatusCard({
	isSetup,
	integrationType,
	onRefresh,
}: {
	isSetup: boolean;
	integrationType?: string;
	onRefresh: () => void;
}) {
	return (
		<Card>
			<div className="flex items-center justify-between p-4">
				<div className="flex items-center gap-3">
					<div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
						{isSetup ? (
							<CheckIcon className="h-4 w-4" weight="duotone" />
						) : (
							<WarningCircleIcon className="h-4 w-4" weight="duotone" />
						)}
					</div>
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-sm">
							{isSetup
								? integrationType === 'vercel'
									? 'Vercel Integration Active'
									: 'Tracking Active'
								: integrationType === 'vercel'
									? 'Vercel Integration Ready'
									: 'Tracking Not Setup'}
						</span>
						<span className="text-muted-foreground text-xs">
							{isSetup
								? integrationType === 'vercel'
									? 'Data is being collected via Vercel integration'
									: 'Data is being collected successfully'
								: integrationType === 'vercel'
									? 'Environment variables configured, waiting for traffic'
									: 'Install the tracking script to start collecting data'}
						</span>
					</div>
				</div>
				<Button
					aria-label="Refresh tracking status"
					className="h-7 w-7"
					onClick={onRefresh}
					size="icon"
					variant="ghost"
				>
					{isSetup ? (
						<CheckIcon className="h-3.5 w-3.5" weight="fill" />
					) : (
						<WarningCircleIcon className="h-3.5 w-3.5" weight="fill" />
					)}
				</Button>
			</div>
		</Card>
	);
}

/**
 * Info section component
 */
export function InfoSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-2 text-base">
					<div className="flex h-6 w-6 items-center justify-center rounded bg-muted">
						<InfoIcon className="h-4 w-4" weight="duotone" />
					</div>
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-2">{children}</CardContent>
		</Card>
	);
}

/**
 * Installation method tabs (Script vs NPM)
 */
export function InstallationTabs({
	trackingCode,
	npmCode,
	copiedBlockId,
	onCopyCode,
	children,
}: {
	trackingCode: string;
	npmCode: string;
	copiedBlockId: string | null;
	onCopyCode: (code: string, blockId: string, message: string) => void;
	children?: React.ReactNode;
}) {
	return (
		<Tabs className="w-full" defaultValue="script">
			<TabsList className="grid w-full grid-cols-2">
				<TabsTrigger className="flex items-center gap-2" value="script">
					Script Tag
				</TabsTrigger>
				<TabsTrigger className="flex items-center gap-2" value="npm">
					NPM Package
				</TabsTrigger>
			</TabsList>

			<TabsContent className="space-y-4" value="script">
				<CodeBlock
					code={trackingCode}
					copied={copiedBlockId === 'script-tag'}
					description="Add this script to the <head> section of your HTML:"
					onCopy={() =>
						onCopyCode(
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
						Install the DataBuddy package using your preferred package manager:
					</p>

					<PackageManagerTabs
						copiedBlockId={copiedBlockId}
						onCopyCode={onCopyCode}
					/>

					<CodeBlock
						code={npmCode}
						copied={copiedBlockId === 'tracking-code'}
						description="Then initialize the tracker in your code:"
						onCopy={() =>
							onCopyCode(
								npmCode,
								'tracking-code',
								'Tracking code copied to clipboard!'
							)
						}
					/>
				</div>
			</TabsContent>

			{children}
		</Tabs>
	);
}
