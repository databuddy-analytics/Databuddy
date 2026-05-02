"use client";

import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import html from "shiki/langs/html.mjs";
import tsx from "shiki/langs/tsx.mjs";
import vue from "shiki/langs/vue.mjs";
import vesper from "shiki/themes/vesper.mjs";
import { toast } from "sonner";
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
import {
	generateNpmCode,
	generateScriptTag,
	generateVueCode,
	type VersionedScript,
} from "../utils/code-generators";
import type { TrackingOptionConfig, TrackingOptions } from "../utils/types";
import {
	ArrowClockwiseIcon,
	BookOpenIcon,
	CaretDownIcon,
	CheckIcon,
	ClipboardIcon,
	CodeIcon,
	GlobeIcon,
	LightningIcon,
	PackageIcon,
	PulseIcon,
	ShieldCheckIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Card } from "@databuddy/ui";
import { Switch, Tabs } from "@databuddy/ui/client";

interface TrackingSetupTabProps {
	websiteId: string;
}

const highlighter = createHighlighterCoreSync({
	themes: [vesper],
	langs: [tsx, html, bash, vue],
	engine: createJavaScriptRegexEngine(),
});

type Lang = "bash" | "html" | "tsx" | "vue";

function getLanguage(code: string): Lang {
	if (
		code.includes("npm install") ||
		code.includes("yarn add") ||
		code.includes("pnpm add") ||
		code.includes("bun add")
	) {
		return "bash";
	}
	if (code.includes("<script setup>")) {
		return "vue";
	}
	if (code.includes("<script")) {
		return "html";
	}
	return "tsx";
}

function CodeBlock({
	code,
	copied,
	onCopy,
}: {
	code: string;
	copied: boolean;
	onCopy: () => void;
}) {
	const highlighted = useMemo(
		() =>
			highlighter.codeToHtml(code, {
				lang: getLanguage(code),
				theme: "vesper",
			}),
		[code],
	);

	return (
		<div className="group relative overflow-hidden rounded-lg border border-white/10 bg-[#101010]">
			<div
				className={cn(
					"overflow-x-auto font-mono text-[13px] leading-relaxed",
					"[&>pre]:m-0 [&>pre]:overflow-visible [&>pre]:p-4 [&>pre]:leading-relaxed",
					"[&>pre>code]:block [&>pre>code]:w-full",
					"[&_.line]:min-h-5",
				)}
				dangerouslySetInnerHTML={{ __html: highlighted }}
			/>
			<Button
				aria-label="Copy code"
				className="absolute top-2 right-2 size-7 bg-white/10 opacity-0 backdrop-blur-sm transition-opacity hover:bg-white/20 group-hover:opacity-100"
				onClick={onCopy}
				size="icon"
				variant="ghost"
			>
				{copied ? (
					<CheckIcon className="size-3.5 text-emerald-400" weight="bold" />
				) : (
					<ClipboardIcon className="size-3.5 text-white/70" weight="duotone" />
				)}
			</Button>
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
				"flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
				"hover:border-primary/40 hover:bg-accent/50",
				isEnabled && "border-primary/30 bg-primary/5",
			)}
			htmlFor={switchId}
		>
			<Switch
				checked={isEnabled}
				className="shrink-0"
				id={switchId}
				onCheckedChange={onToggle}
			/>
			<div className="min-w-0">
				<span className="font-medium text-sm">{option.title}</span>
				<p className="text-muted-foreground text-xs">{option.description}</p>
			</div>
		</label>
	);
}

const INSTALL_COMMANDS = {
	bun: "bun add @databuddy/sdk",
	npm: "npm install @databuddy/sdk",
	yarn: "yarn add @databuddy/sdk",
	pnpm: "pnpm add @databuddy/sdk",
};

const TROUBLESHOOTING_ITEMS = [
	{
		title: "Localhost events are disabled",
		description: "Events from localhost are disabled by default.",
	},
	{
		title: "Origin mismatch",
		description:
			"Events must come from the same domain configured for your website. Verify your website URL matches in settings.",
	},
	{
		title: "Script not loading",
		description:
			"Check Developer Tools (F12) Network tab for the databuddy.js request. Verify the script is in <head> and your Client ID is correct.",
	},
	{
		title: "Ad blockers",
		description:
			"Browser extensions like uBlock Origin may block analytics scripts. Test with extensions disabled.",
	},
	{
		title: "Content Security Policy",
		description:
			"If your site has strict CSP headers, whitelist the tracking domain. Check the browser console for CSP errors.",
	},
];

function VueLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="currentColor"
			viewBox="0 0 256 221"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M204.8 0H256L128 220.8L0 0h97.92L128 51.2L157.44 0h47.36Z" opacity="0.5" />
			<path d="m0 0 128 220.8L256 0h-51.2L128 132.48 51.2 0H0Z" opacity="0.25" />
			<path d="M50.56 0 128 133.12 204.8 0h-47.36L128 51.2 97.92 0H50.56Z" />
		</svg>
	);
}

export function WebsiteTrackingSetupTab({ websiteId }: TrackingSetupTabProps) {
	const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [usePinnedVersion, setUsePinnedVersion] = useState(false);
	const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
	const [trackingOptions] = useAtom(trackingOptionsAtom);
	const [, toggleTrackingOptionAction] = useAtom(toggleTrackingOptionAtom);
	const [troubleshootingOpen, setTroubleshootingOpen] = useState(false);

	const { data: trackerVersionsData } = useQuery(
		orpc.tracker.listVersions.queryOptions({
			input: { filename: "databuddy.js" },
		}),
	);

	const availableVersions = trackerVersionsData ?? [];

	const activeVersionedScript = useMemo((): VersionedScript | undefined => {
		if (!usePinnedVersion || !selectedVersion) return undefined;
		const match = availableVersions.find((v) => v.version === selectedVersion);
		if (!match) return undefined;
		return {
			version: match.version,
			filename: `databuddy.v${match.version}.js`,
			sriHash: match.sriHash,
		};
	}, [usePinnedVersion, selectedVersion, availableVersions]);

	const trackingCode = generateScriptTag(websiteId, trackingOptions);
	const pinnedTrackingCode = activeVersionedScript
		? generateScriptTag(websiteId, trackingOptions, activeVersionedScript)
		: null;
	const npmCode = generateNpmCode(websiteId, trackingOptions);
	const vueCode = generateVueCode(websiteId, trackingOptions);

	const activeCode =
		usePinnedVersion && pinnedTrackingCode ? pinnedTrackingCode : trackingCode;

	const { data: trackingSetupData, refetch: refetchTrackingSetup } = useQuery({
		...orpc.websites.isTrackingSetup.queryOptions({ input: { websiteId } }),
		enabled: !!websiteId,
	});

	const isSetup = Boolean(trackingSetupData?.tracking_setup);

	const handleCopy = (code: string, blockId: string, message: string) => {
		navigator.clipboard.writeText(code);
		setCopiedBlockId(blockId);
		toast.success(message);
		setTimeout(() => setCopiedBlockId(null), COPY_SUCCESS_TIMEOUT);
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			const result = await refetchTrackingSetup();
			if (result.data?.tracking_setup) {
				toast.success("Tracking verified! Data is flowing.");
			} else {
				toast.info("No tracking detected yet. Check your installation.");
			}
		} catch {
			toast.error("Couldn't verify tracking. Try again shortly.");
		} finally {
			setIsRefreshing(false);
		}
	};

	return (
		<div className="space-y-6">
			<div
				className={cn(
					"flex items-center justify-between rounded-lg border p-3",
					isSetup
						? "border-success/30 bg-success/5"
						: "border-amber-500/30 bg-amber-500/5",
				)}
			>
				<div className="flex items-center gap-2.5">
					{isSetup ? (
						<PulseIcon className="size-4 text-success" weight="duotone" />
					) : (
						<WarningCircleIcon
							className="size-4 text-amber-500"
							weight="duotone"
						/>
					)}
					<span className="font-medium text-sm">
						{isSetup ? "Tracking Active" : "Awaiting Installation"}
					</span>
					<Badge variant={isSetup ? "success" : "warning"}>
						{isSetup ? "Live" : "Pending"}
					</Badge>
				</div>
				<Button
					disabled={isRefreshing}
					onClick={handleRefresh}
					size="sm"
					variant="ghost"
				>
					<ArrowClockwiseIcon
						className={cn("size-3.5", isRefreshing && "animate-spin")}
						weight="bold"
					/>
					{isRefreshing ? "Checking..." : "Check Status"}
				</Button>
			</div>

			<Card className="gap-0 py-0">
				<Card.Content className="p-5">
					<Tabs className="w-full" defaultValue="script">
						<div className="flex items-center justify-between gap-4">
							<Tabs.List>
								<Tabs.Tab value="script">
									<CodeIcon className="size-3.5" weight="duotone" />
									Script Tag
								</Tabs.Tab>
								<Tabs.Tab value="react">
									<PackageIcon className="size-3.5" weight="duotone" />
									React
								</Tabs.Tab>
								<Tabs.Tab value="vue">
									<VueLogo className="size-3.5" />
									Vue
								</Tabs.Tab>
							</Tabs.List>

							<button
								className="group flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 font-mono text-xs transition-colors hover:bg-accent-brighter"
								onClick={() =>
									handleCopy(websiteId, "client-id", "Client ID copied!")
								}
								type="button"
							>
								<span className="text-muted-foreground">ID:</span>
								<span className="max-w-32 truncate">{websiteId}</span>
								{copiedBlockId === "client-id" ? (
									<CheckIcon
										className="size-3 text-success"
										weight="bold"
									/>
								) : (
									<ClipboardIcon
										className="size-3 opacity-50 transition-opacity group-hover:opacity-100"
										weight="duotone"
									/>
								)}
							</button>
						</div>

						<Tabs.Panel className="mt-4 space-y-3" value="script">
							<p className="text-muted-foreground text-sm text-pretty">
								Add this to the{" "}
								<code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">
									{"<head>"}
								</code>{" "}
								of your website:
							</p>

							<CodeBlock
								code={activeCode}
								copied={copiedBlockId === "script-tag"}
								onCopy={() =>
									handleCopy(
										activeCode,
										"script-tag",
										"Script tag copied!",
									)
								}
							/>

							{availableVersions.length > 0 && (
								<div className="space-y-2.5">
									<label
										className={cn(
											"flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
											"hover:border-primary/40 hover:bg-accent/50",
											usePinnedVersion && "border-primary/30 bg-primary/5",
										)}
										htmlFor="switch-pinned-version"
									>
										<Switch
											checked={usePinnedVersion}
											className="shrink-0"
											id="switch-pinned-version"
											onCheckedChange={() => {
												setUsePinnedVersion((prev) => !prev);
												if (
													!selectedVersion &&
													availableVersions.length > 0
												) {
													setSelectedVersion(
														availableVersions[0].version,
													);
												}
											}}
										/>
										<ShieldCheckIcon
											className="size-4 shrink-0 text-muted-foreground"
											weight="duotone"
										/>
										<div className="min-w-0">
											<span className="font-medium text-sm">
												Pin version with SRI
											</span>
											<p className="text-muted-foreground text-xs">
												Lock to a specific version with subresource integrity
											</p>
										</div>
									</label>

									{usePinnedVersion && (
										<div className="flex flex-wrap items-center gap-2 pl-1">
											<span className="text-muted-foreground text-xs">
												Version:
											</span>
											{availableVersions.map((v) => (
												<button
													className={cn(
														"rounded-md border px-2.5 py-1 font-mono text-xs transition-colors",
														selectedVersion === v.version
															? "border-primary bg-primary/10 text-primary"
															: "border-accent bg-accent hover:bg-accent-brighter",
													)}
													key={v.version}
													onClick={() => setSelectedVersion(v.version)}
													type="button"
												>
													v{v.version}
												</button>
											))}
										</div>
									)}
								</div>
							)}

							<div className="flex items-start gap-2 rounded-lg bg-accent/50 p-3">
								<LightningIcon
									className="mt-0.5 size-3.5 shrink-0 text-amber-500"
									weight="duotone"
								/>
								<p className="text-muted-foreground text-xs leading-relaxed">
									{usePinnedVersion
										? "Pinned and verified with SRI. The browser will reject the script if contents change. Update the version manually for new features."
										: "Loads asynchronously without blocking page rendering. Data appears within minutes."}
								</p>
							</div>
						</Tabs.Panel>

						<Tabs.Panel className="mt-4 space-y-4" value="react">
							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Install the SDK:
								</p>
								<Tabs className="w-full" defaultValue="bun">
									<Tabs.List>
										{Object.keys(INSTALL_COMMANDS).map((manager) => (
											<Tabs.Tab
												className="text-xs"
												key={manager}
												value={manager}
											>
												{manager}
											</Tabs.Tab>
										))}
									</Tabs.List>
									{Object.entries(INSTALL_COMMANDS).map(
										([manager, command]) => (
											<Tabs.Panel
												className="mt-3"
												key={manager}
												value={manager}
											>
												<CodeBlock
													code={command}
													copied={
														copiedBlockId === `react-${manager}-install`
													}
													onCopy={() =>
														handleCopy(
															command,
															`react-${manager}-install`,
															"Command copied!",
														)
													}
												/>
											</Tabs.Panel>
										),
									)}
								</Tabs>
							</div>

							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Add the component to your layout:
								</p>
								<CodeBlock
									code={npmCode}
									copied={copiedBlockId === "react-code"}
									onCopy={() =>
										handleCopy(
											npmCode,
											"react-code",
											"Code copied!",
										)
									}
								/>
							</div>
						</Tabs.Panel>

						<Tabs.Panel className="mt-4 space-y-4" value="vue">
							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Install the SDK:
								</p>
								<Tabs className="w-full" defaultValue="bun">
									<Tabs.List>
										{Object.keys(INSTALL_COMMANDS).map((manager) => (
											<Tabs.Tab
												className="text-xs"
												key={manager}
												value={manager}
											>
												{manager}
											</Tabs.Tab>
										))}
									</Tabs.List>
									{Object.entries(INSTALL_COMMANDS).map(
										([manager, command]) => (
											<Tabs.Panel
												className="mt-3"
												key={manager}
												value={manager}
											>
												<CodeBlock
													code={command}
													copied={
														copiedBlockId === `vue-${manager}-install`
													}
													onCopy={() =>
														handleCopy(
															command,
															`vue-${manager}-install`,
															"Command copied!",
														)
													}
												/>
											</Tabs.Panel>
										),
									)}
								</Tabs>
							</div>

							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Add the component to your root layout:
								</p>
								<CodeBlock
									code={vueCode}
									copied={copiedBlockId === "vue-code"}
									onCopy={() =>
										handleCopy(
											vueCode,
											"vue-code",
											"Code copied!",
										)
									}
								/>
							</div>
						</Tabs.Panel>
					</Tabs>
				</Card.Content>
			</Card>

			<Card className="gap-0 py-0">
				<Card.Content className="p-5">
					<div className="mb-4 flex items-center justify-between">
						<h3 className="font-semibold text-sm">Tracking Options</h3>
						<p className="text-muted-foreground text-xs tabular-nums">
							{
								[...BASIC_TRACKING_OPTIONS, ...ADVANCED_TRACKING_OPTIONS].filter(
									(opt) => {
										const value = trackingOptions[opt.key] as boolean;
										return opt.inverted ? !value : value;
									},
								).length
							}
							/{BASIC_TRACKING_OPTIONS.length + ADVANCED_TRACKING_OPTIONS.length}{" "}
							enabled
						</p>
					</div>

					<div className="space-y-4">
						<div>
							<p className="mb-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
								Core
							</p>
							<div className="grid gap-2 sm:grid-cols-2">
								{BASIC_TRACKING_OPTIONS.map((option) => (
									<OptionToggle
										enabled={trackingOptions[option.key] as boolean}
										key={option.key}
										onToggle={() =>
											toggleTrackingOptionAction(option.key)
										}
										option={option}
									/>
								))}
							</div>
						</div>

						<div>
							<p className="mb-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
								Advanced
							</p>
							<div className="grid gap-2 sm:grid-cols-2">
								{ADVANCED_TRACKING_OPTIONS.map((option) => (
									<OptionToggle
										enabled={trackingOptions[option.key] as boolean}
										key={option.key}
										onToggle={() =>
											toggleTrackingOptionAction(option.key)
										}
										option={option}
									/>
								))}
							</div>
						</div>
					</div>
				</Card.Content>
			</Card>

			<Card className="gap-0 py-0">
				<Card.Content className="p-0">
					<button
						className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-accent/50"
						onClick={() => setTroubleshootingOpen((prev) => !prev)}
						type="button"
					>
						<div className="flex items-center gap-2.5">
							<WarningCircleIcon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
							<span className="font-medium text-sm">Troubleshooting</span>
						</div>
						<CaretDownIcon
							className={cn(
								"size-4 text-muted-foreground transition-transform",
								troubleshootingOpen && "rotate-180",
							)}
							weight="bold"
						/>
					</button>

					{troubleshootingOpen && (
						<div className="border-t px-4 pb-4 pt-3">
							<div className="space-y-3">
								{TROUBLESHOOTING_ITEMS.map((item) => (
									<div className="flex items-start gap-2.5" key={item.title}>
										<WarningCircleIcon
											className="mt-0.5 size-3.5 shrink-0 text-amber-500"
											weight="duotone"
										/>
										<div className="min-w-0">
											<p className="font-medium text-sm">{item.title}</p>
											<p className="text-muted-foreground text-xs leading-relaxed text-pretty">
												{item.description}
											</p>
										</div>
									</div>
								))}
							</div>

							<div className="mt-4 flex items-center gap-2 rounded-lg bg-accent/50 p-3">
								<BookOpenIcon
									className="size-4 shrink-0 text-muted-foreground"
									weight="duotone"
								/>
								<p className="text-muted-foreground text-xs">
									Still stuck?{" "}
									<a
										className="text-primary underline-offset-4 hover:underline"
										href="https://www.databuddy.cc/docs/troubleshooting"
										rel="noopener noreferrer"
										target="_blank"
									>
										View full troubleshooting docs
									</a>
								</p>
							</div>
						</div>
					)}
				</Card.Content>
			</Card>
		</div>
	);
}
