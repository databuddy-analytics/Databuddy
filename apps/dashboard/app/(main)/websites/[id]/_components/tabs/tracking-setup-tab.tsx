"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { BookOpenIcon } from "@phosphor-icons/react";
import { BugIcon } from "@phosphor-icons/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { CheckIcon } from "@phosphor-icons/react";
import { ClipboardIcon } from "@phosphor-icons/react";
import { CodeIcon } from "@phosphor-icons/react";
import { GearIcon } from "@phosphor-icons/react";
import { LightningIcon } from "@phosphor-icons/react";
import { PackageIcon } from "@phosphor-icons/react";
import { PulseIcon } from "@phosphor-icons/react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import html from "shiki/langs/html.mjs";
import tsx from "shiki/langs/tsx.mjs";
import vesper from "shiki/themes/vesper.mjs";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	toggleTrackingOptionAtom,
	trackingOptionsAtom,
} from "@/stores/jotai/filterAtoms";
import {
	ADVANCED_TRACKING_OPTIONS,
	BASIC_TRACKING_OPTIONS,
	COPY_SUCCESS_TIMEOUT,
} from "../shared/tracking-constants";
import { generateNpmCode, generateScriptTag } from "../utils/code-generators";
import type { TrackingOptionConfig, TrackingOptions } from "../utils/types";

interface TrackingSetupTabProps {
	websiteId: string;
}

const highlighter = createHighlighterCoreSync({
	themes: [vesper],
	langs: [tsx, html, bash],
	engine: createJavaScriptRegexEngine(),
});

function getLanguage(code: string): "bash" | "html" | "tsx" {
	if (
		code.includes("npm install") ||
		code.includes("yarn add") ||
		code.includes("pnpm add") ||
		code.includes("bun add")
	) {
		return "bash";
	}
	if (code.includes("<script")) {
		return "html";
	}
	return "tsx";
}

function CodeSnippet({
	code,
	label,
	copied,
	onCopy,
}: {
	code: string;
	label?: string;
	copied: boolean;
	onCopy: () => void;
}) {
	const highlightedCode = useMemo(
		() =>
			highlighter.codeToHtml(code, {
				lang: getLanguage(code),
				theme: "vesper",
			}),
		[code]
	);

	return (
		<div className="group relative">
			{label && (
				<div className="mb-2 text-muted-foreground text-xs">{label}</div>
			)}
			<div className="relative overflow-hidden rounded border border-white/10 bg-[#101010]">
				<div
					className={cn(
						"overflow-x-auto font-mono text-[13px] leading-relaxed",
						"[&>pre]:m-0 [&>pre]:overflow-visible [&>pre]:p-4 [&>pre]:leading-relaxed",
						"[&>pre>code]:block [&>pre>code]:w-full",
						"[&_.line]:min-h-5"
					)}
					dangerouslySetInnerHTML={{ __html: highlightedCode }}
				/>
				<Button
					className="absolute top-2 right-2 size-7 bg-white/10 opacity-0 backdrop-blur-sm transition-opacity hover:bg-white/20 group-hover:opacity-100"
					onClick={onCopy}
					size="icon"
					variant="ghost"
				>
					{copied ? (
						<CheckIcon className="size-3.5 text-emerald-400" weight="bold" />
					) : (
						<ClipboardIcon
							className="size-3.5 text-white/70"
							weight="duotone"
						/>
					)}
				</Button>
			</div>
		</div>
	);
}

function StepIndicator({
	step,
	title,
	description,
	isComplete,
	isActive,
}: {
	step: number;
	title: string;
	description: string;
	isComplete?: boolean;
	isActive?: boolean;
}) {
	return (
		<div className="flex items-start gap-3">
			<div
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded border font-semibold text-sm",
					isComplete
						? "border-success/30 bg-success/10 text-success"
						: isActive
							? "border-primary bg-primary/10 text-primary"
							: "border-accent-foreground/20 bg-accent text-muted-foreground"
				)}
			>
				{isComplete ? (
					<CheckIcon className="size-4" weight="bold" />
				) : (
					<span>{step}</span>
				)}
			</div>
			<div className="min-w-0 flex-1">
				<h3 className="font-semibold text-sm">{title}</h3>
				<p className="text-muted-foreground text-xs">{description}</p>
			</div>
		</div>
	);
}

function TrackingStatusBanner({
	isSetup,
	onRefresh,
	isRefreshing,
}: {
	isSetup: boolean;
	onRefresh: () => void;
	isRefreshing: boolean;
}) {
	return (
		<Card
			className={cn(
				"gap-0 overflow-hidden py-0",
				isSetup
					? "border-success/30 bg-success/5"
					: "border-amber-500/30 bg-amber-500/5"
			)}
		>
			<CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<div
						className={cn(
							"flex size-10 items-center justify-center rounded",
							isSetup ? "bg-success/10" : "bg-amber-500/10"
						)}
					>
						{isSetup ? (
							<PulseIcon className="size-5 text-success" weight="duotone" />
						) : (
							<WarningCircleIcon
								className="size-5 text-amber-500"
								weight="duotone"
							/>
						)}
					</div>
					<div>
						<div className="flex items-center gap-2">
							<h3 className="font-semibold text-sm">
								{isSetup ? "Tracking Active" : "Awaiting Installation"}
							</h3>
							<Badge variant={isSetup ? "green" : "amber"}>
								{isSetup ? "Live" : "Pending"}
							</Badge>
						</div>
						<p className="text-muted-foreground text-xs">
							{isSetup
								? "Data is being collected successfully"
								: "Complete the setup steps below to start tracking"}
						</p>
					</div>
				</div>
				<Button
					className="shrink-0"
					disabled={isRefreshing}
					onClick={onRefresh}
					size="sm"
					variant="outline"
				>
					<ArrowClockwiseIcon
						className={cn("size-3.5", isRefreshing && "animate-spin")}
						weight="bold"
					/>
					{isRefreshing ? "Checking…" : "Check Status"}
				</Button>
			</CardContent>
		</Card>
	);
}

function InstallationStep({
	websiteId,
	trackingCode,
	npmCode,
	copiedBlockId,
	onCopyCode,
}: {
	websiteId: string;
	trackingCode: string;
	npmCode: string;
	copiedBlockId: string | null;
	onCopyCode: (code: string, blockId: string, message: string) => void;
}) {
	const installCommands = {
		bun: "bun add @databuddy/sdk",
		npm: "npm install @databuddy/sdk",
		yarn: "yarn add @databuddy/sdk",
		pnpm: "pnpm add @databuddy/sdk",
	};

	return (
		<div className="space-y-4">
			<Tabs className="w-full" defaultValue="script" variant="underline">
				<TabsList>
					<TabsTrigger value="script">
						<CodeIcon className="size-3.5" weight="duotone" />
						Script Tag
					</TabsTrigger>
					<TabsTrigger value="npm">
						<PackageIcon className="size-3.5" weight="duotone" />
						SDK Package
					</TabsTrigger>
				</TabsList>

				<TabsContent className="mt-4 space-y-3" value="script">
					<p className="text-muted-foreground text-sm">
						Add this script to the{" "}
						<code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">
							{"<head>"}
						</code>{" "}
						section of your website:
					</p>
					<CodeSnippet
						code={trackingCode}
						copied={copiedBlockId === "script-tag"}
						onCopy={() =>
							onCopyCode(
								trackingCode,
								"script-tag",
								"Script tag copied to clipboard!"
							)
						}
					/>
					<div className="flex items-start gap-2 rounded border border-dashed bg-background/50 p-3">
						<LightningIcon
							className="mt-0.5 size-4 shrink-0 text-amber-500"
							weight="duotone"
						/>
						<p className="text-muted-foreground text-xs leading-relaxed">
							The script loads asynchronously and won't block your page
							rendering. Data typically appears within 2-3 minutes after
							installation.
						</p>
					</div>
				</TabsContent>

				<TabsContent className="mt-4 space-y-4" value="npm">
					<div className="space-y-3">
						<p className="text-muted-foreground text-sm">
							Install the package using your preferred package manager:
						</p>
						<Tabs className="w-full" defaultValue="bun" variant="underline">
							<TabsList>
								{Object.keys(installCommands).map((manager) => (
									<TabsTrigger
										className="text-xs"
										key={manager}
										value={manager}
									>
										{manager}
									</TabsTrigger>
								))}
							</TabsList>
							{Object.entries(installCommands).map(([manager, command]) => (
								<TabsContent className="mt-3" key={manager} value={manager}>
									<CodeSnippet
										code={command}
										copied={copiedBlockId === `${manager}-install`}
										onCopy={() =>
											onCopyCode(
												command,
												`${manager}-install`,
												"Command copied!"
											)
										}
									/>
								</TabsContent>
							))}
						</Tabs>
					</div>

					<div className="space-y-3">
						<p className="text-muted-foreground text-sm">
							Then add the component to your app layout:
						</p>
						<CodeSnippet
							code={npmCode}
							copied={copiedBlockId === "npm-code"}
							onCopy={() =>
								onCopyCode(npmCode, "npm-code", "Code copied to clipboard!")
							}
						/>
					</div>
				</TabsContent>
			</Tabs>

			<div className="flex items-center gap-2 pt-2">
				<span className="text-muted-foreground text-xs">Website ID:</span>
				<button
					className="group flex items-center gap-1.5 rounded bg-accent px-2 py-1 font-mono text-xs hover:bg-accent-brighter"
					onClick={() =>
						onCopyCode(websiteId, "website-id", "Website ID copied!")
					}
					type="button"
				>
					<span className="truncate">{websiteId}</span>
					{copiedBlockId === "website-id" ? (
						<CheckIcon className="size-3 text-success" weight="bold" />
					) : (
						<ClipboardIcon
							className="size-3 opacity-50 transition-opacity group-hover:opacity-100"
							weight="duotone"
						/>
					)}
				</button>
			</div>
		</div>
	);
}

function OptionToggle({
	option,
	enabled,
	onToggle,
}: {
	option: TrackingOptionConfig;
	enabled: boolean;
	onToggle: () => void;
}) {
	const isEnabled = option.inverted ? !enabled : enabled;
	const switchId = `switch-${option.key}`;

	return (
		<label
			className={cn(
				"group flex w-full cursor-pointer items-center gap-3 rounded border p-3 text-left transition-all",
				"hover:border-primary/50 hover:bg-accent/50",
				isEnabled && "border-primary/30 bg-primary/5"
			)}
			htmlFor={switchId}
		>
			<Switch
				checked={isEnabled}
				className="shrink-0"
				id={switchId}
				onCheckedChange={onToggle}
			/>
			<div className="min-w-0 flex-1">
				<span className="font-medium text-sm">{option.title}</span>
				<p className="text-muted-foreground text-xs">{option.description}</p>
			</div>
		</label>
	);
}

function ConfigurationStep({
	trackingOptions,
	onToggleOption,
}: {
	trackingOptions: TrackingOptions;
	onToggleOption: (option: keyof TrackingOptions) => void;
}) {
	const [basicOpen, setBasicOpen] = useState(true);
	const [advancedOpen, setAdvancedOpen] = useState(false);

	const enabledBasicCount = BASIC_TRACKING_OPTIONS.filter((opt) => {
		const value = trackingOptions[opt.key] as boolean;
		return opt.inverted ? !value : value;
	}).length;

	const enabledAdvancedCount = ADVANCED_TRACKING_OPTIONS.filter(
		(opt) => trackingOptions[opt.key] as boolean
	).length;

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-sm">
				Customize what data to collect. Most defaults work great for standard
				analytics.
			</p>

			<Collapsible onOpenChange={setBasicOpen} open={basicOpen}>
				<CollapsibleTrigger asChild>
					<button
						className="flex w-full items-center justify-between rounded border bg-card p-3 hover:bg-accent"
						type="button"
					>
						<div className="flex items-center gap-3">
							<div className="flex size-8 items-center justify-center rounded bg-accent">
								<GearIcon
									className="size-4 text-muted-foreground"
									weight="duotone"
								/>
							</div>
							<div className="text-left">
								<h4 className="font-medium text-sm">Core Tracking</h4>
								<p className="text-muted-foreground text-xs">
									{enabledBasicCount}/{BASIC_TRACKING_OPTIONS.length} enabled
								</p>
							</div>
						</div>
						<CaretDownIcon
							className={cn(
								"size-4 text-muted-foreground transition-transform",
								basicOpen && "rotate-180"
							)}
							weight="bold"
						/>
					</button>
				</CollapsibleTrigger>
				<CollapsibleContent className="pt-3">
					<div className="grid gap-2 sm:grid-cols-2">
						{BASIC_TRACKING_OPTIONS.map((option) => (
							<OptionToggle
								enabled={trackingOptions[option.key] as boolean}
								key={option.key}
								onToggle={() => onToggleOption(option.key)}
								option={option}
							/>
						))}
					</div>
				</CollapsibleContent>
			</Collapsible>

			<Collapsible onOpenChange={setAdvancedOpen} open={advancedOpen}>
				<CollapsibleTrigger asChild>
					<button
						className="flex w-full items-center justify-between rounded border bg-card p-3 hover:bg-accent"
						type="button"
					>
						<div className="flex items-center gap-3">
							<div className="flex size-8 items-center justify-center rounded bg-accent">
								<LightningIcon
									className="size-4 text-muted-foreground"
									weight="duotone"
								/>
							</div>
							<div className="text-left">
								<h4 className="font-medium text-sm">Advanced Features</h4>
								<p className="text-muted-foreground text-xs">
									{enabledAdvancedCount}/{ADVANCED_TRACKING_OPTIONS.length}{" "}
									enabled
								</p>
							</div>
						</div>
						<CaretDownIcon
							className={cn(
								"size-4 text-muted-foreground transition-transform",
								advancedOpen && "rotate-180"
							)}
							weight="bold"
						/>
					</button>
				</CollapsibleTrigger>
				<CollapsibleContent className="pt-3">
					<div className="grid gap-2 sm:grid-cols-2">
						{ADVANCED_TRACKING_OPTIONS.map((option) => (
							<OptionToggle
								enabled={trackingOptions[option.key] as boolean}
								key={option.key}
								onToggle={() => onToggleOption(option.key)}
								option={option}
							/>
						))}
					</div>
				</CollapsibleContent>
			</Collapsible>
		</div>
	);
}

function DiagnosticsStep() {
	const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

	return (
		<div className="space-y-3">
			<Collapsible onOpenChange={setDiagnosticsOpen} open={diagnosticsOpen}>
				<CollapsibleTrigger asChild>
					<button
						className="flex w-full items-center justify-between rounded border bg-card p-3 hover:bg-accent"
						type="button"
					>
						<div className="flex items-center gap-3">
							<div className="flex size-8 items-center justify-center rounded bg-accent">
								<BugIcon
									className="size-4 text-muted-foreground"
									weight="duotone"
								/>
							</div>
							<div className="text-left">
								<h4 className="font-medium text-sm">Troubleshooting Guide</h4>
								<p className="text-muted-foreground text-xs">
									Common issues and how to fix them
								</p>
							</div>
						</div>
						<CaretDownIcon
							className={cn(
								"size-4 text-muted-foreground transition-transform",
								diagnosticsOpen && "rotate-180"
							)}
							weight="bold"
						/>
					</button>
				</CollapsibleTrigger>
				<CollapsibleContent className="pt-3">
					<div className="space-y-3">
						<div className="space-y-3 rounded border bg-background/50 p-4">
							<div className="space-y-2">
								<div className="flex items-start gap-2">
									<WarningCircleIcon
										className="mt-0.5 size-4 shrink-0 text-amber-500"
										weight="duotone"
									/>
									<div className="min-w-0 flex-1">
										<h5 className="font-semibold text-sm">
											Localhost events are disabled
										</h5>
										<p className="text-muted-foreground text-xs">
											Events from localhost are disabled by default.
										</p>
									</div>
								</div>
							</div>

							<div className="space-y-2">
								<div className="flex items-start gap-2">
									<WarningCircleIcon
										className="mt-0.5 size-4 shrink-0 text-amber-500"
										weight="duotone"
									/>
									<div className="min-w-0 flex-1">
										<h5 className="font-semibold text-sm">Origin mismatch</h5>
										<p className="text-muted-foreground text-xs">
											Events must be sent from the same domain configured for
											your website. Cross-origin requests are blocked for
											security. Verify your website URL matches the domain in
											website settings.
										</p>
									</div>
								</div>
							</div>

							<div className="space-y-2">
								<div className="flex items-start gap-2">
									<WarningCircleIcon
										className="mt-0.5 size-4 shrink-0 text-amber-500"
										weight="duotone"
									/>
									<div className="min-w-0 flex-1">
										<h5 className="font-semibold text-sm">
											Script not loading
										</h5>
										<p className="text-muted-foreground text-xs">
											Open your browser's Developer Tools (F12) → Network tab
											and reload your page. Look for a request to{" "}
											<code className="rounded bg-accent px-1 py-0.5 font-mono">
												databuddy.js
											</code>{" "}
											or similar. If it fails, verify the script tag is in the{" "}
											<code className="rounded bg-accent px-1 py-0.5 font-mono">
												{"<head>"}
											</code>{" "}
											section and your website ID is correct.
										</p>
									</div>
								</div>
							</div>

							<div className="space-y-2">
								<div className="flex items-start gap-2">
									<WarningCircleIcon
										className="mt-0.5 size-4 shrink-0 text-amber-500"
										weight="duotone"
									/>
									<div className="min-w-0 flex-1">
										<h5 className="font-semibold text-sm">
											Ad blockers & privacy tools
										</h5>
										<p className="text-muted-foreground text-xs">
											Browser extensions like uBlock Origin, Privacy Badger, or
											strict browser privacy settings may block analytics
											scripts. Test with extensions disabled or use a custom
											tracking domain (contact support for setup).
										</p>
									</div>
								</div>
							</div>

							<div className="space-y-2">
								<div className="flex items-start gap-2">
									<LightningIcon
										className="mt-0.5 size-4 shrink-0 text-blue-500"
										weight="duotone"
									/>
									<div className="min-w-0 flex-1">
										<h5 className="font-semibold text-sm">
											Data appears delayed
										</h5>
										<p className="text-muted-foreground text-xs">
											Analytics data typically appears within 10-20 seconds
											after events are sent.
										</p>
									</div>
								</div>
							</div>

							<div className="space-y-2">
								<div className="flex items-start gap-2">
									<WarningCircleIcon
										className="mt-0.5 size-4 shrink-0 text-amber-500"
										weight="duotone"
									/>
									<div className="min-w-0 flex-1">
										<h5 className="font-semibold text-sm">
											Content Security Policy (CSP)
										</h5>
										<p className="text-muted-foreground text-xs">
											If your site has strict CSP headers, you may need to
											whitelist our tracking domain. Check browser console for
											CSP errors and add the appropriate directives to your CSP
											configuration.
										</p>
									</div>
								</div>
							</div>
						</div>

						<div className="rounded border border-blue-500/30 bg-blue-500/5 p-4">
							<div className="flex items-start gap-2">
								<BookOpenIcon
									className="mt-0.5 size-4 shrink-0 text-blue-500"
									weight="duotone"
								/>
								<div className="min-w-0 flex-1">
									<h5 className="font-semibold text-sm">
										Still having issues?
									</h5>
									<p className="mt-1 text-muted-foreground text-xs">
										Check our{" "}
										<a
											className="text-primary underline-offset-4 hover:underline"
											href="https://www.databuddy.cc/docs/troubleshooting"
											rel="noopener noreferrer"
											target="_blank"
										>
											troubleshooting documentation
										</a>{" "}
										for detailed debugging steps, or contact support with your
										website ID for personalized help.
									</p>
								</div>
							</div>
						</div>
					</div>
				</CollapsibleContent>
			</Collapsible>
		</div>
	);
}

export function WebsiteTrackingSetupTab({ websiteId }: TrackingSetupTabProps) {
	const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [trackingOptions] = useAtom(trackingOptionsAtom);
	const [, toggleTrackingOptionAction] = useAtom(toggleTrackingOptionAtom);

	const trackingCode = generateScriptTag(websiteId, trackingOptions);
	const npmCode = generateNpmCode(websiteId, trackingOptions);

	const { data: trackingSetupData, refetch: refetchTrackingSetup } = useQuery({
		...orpc.websites.isTrackingSetup.queryOptions({ input: { websiteId } }),
		enabled: !!websiteId,
	});

	const isSetup = Boolean(trackingSetupData?.tracking_setup);

	const handleCopyCode = (code: string, blockId: string, message: string) => {
		navigator.clipboard.writeText(code);
		setCopiedBlockId(blockId);
		toast.success(message);
		setTimeout(() => setCopiedBlockId(null), COPY_SUCCESS_TIMEOUT);
	};

	const handleToggleOption = (option: keyof TrackingOptions) => {
		toggleTrackingOptionAction(option);
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			const result = await refetchTrackingSetup();
			if (result.data?.tracking_setup) {
				toast.success("Tracking verified! Data is flowing.");
			} else {
				toast.error("No tracking detected yet. Check your installation.");
			}
		} catch {
			toast.error("Couldn't verify tracking. Try again shortly.");
		} finally {
			setIsRefreshing(false);
		}
	};

	return (
		<div className="space-y-4">
			<TrackingStatusBanner
				isRefreshing={isRefreshing}
				isSetup={isSetup}
				onRefresh={handleRefresh}
			/>

			<div className="space-y-4">
				{/* Step 1: Install */}
				<Card className="gap-0 py-0">
					<CardContent className="p-0">
						<div className="border-b p-4">
							<StepIndicator
								description="Add the tracking script to your website"
								isActive={!isSetup}
								isComplete={isSetup}
								step={1}
								title="Install Tracking Code"
							/>
						</div>
						<div className="p-4">
							<InstallationStep
								copiedBlockId={copiedBlockId}
								npmCode={npmCode}
								onCopyCode={handleCopyCode}
								trackingCode={trackingCode}
								websiteId={websiteId}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Step 2: Configure */}
				<Card className="gap-0 py-0">
					<CardContent className="p-0">
						<div className="border-b p-4">
							<StepIndicator
								description="Choose what data to collect"
								isActive={isSetup}
								step={2}
								title="Configure Options"
							/>
						</div>
						<div className="p-4">
							<ConfigurationStep
								onToggleOption={handleToggleOption}
								trackingOptions={trackingOptions}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Step 3: Diagnostics */}
				<Card className="gap-0 py-0">
					<CardContent className="p-0">
						<div className="border-b p-4">
							<StepIndicator
								description="Test your setup and troubleshoot issues"
								step={3}
								title="Verify & Troubleshoot"
							/>
						</div>
						<div className="p-4">
							<DiagnosticsStep />
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-4 rounded border border-dashed bg-background/50 p-3">
				<span className="text-muted-foreground text-sm">
					Need help setting up?
				</span>
				<Button asChild size="sm" variant="outline">
					<a
						href="https://www.databuddy.cc/docs"
						rel="noopener noreferrer"
						target="_blank"
					>
						<BookOpenIcon className="size-4" weight="duotone" />
						Documentation
					</a>
				</Button>
			</div>
		</div>
	);
}
