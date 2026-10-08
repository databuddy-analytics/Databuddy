"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
import {
	CodeBlock,
	CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { ConnectApp } from "@/components/websites/connect-app";
import { useAgentInstall } from "@/hooks/use-agent-install";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useSiteResearch } from "@/hooks/use-site-research";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	toggleTrackingOptionAtom,
	trackingOptionsAtom,
} from "@/stores/jotai/filterAtoms";
import {
	ADVANCED_TRACKING_OPTIONS,
	BASIC_TRACKING_OPTIONS,
} from "../constants/settings-constants";
import {
	generateNextJsCode,
	generateNodeCode,
	generateNpmCode,
	generateScriptTag,
	generateTanStackCode,
	generateVueCode,
	type VersionedScript,
} from "../utils/code-generators";
import type { TrackingOptionConfig } from "../utils/types";
import {
	BookOpenIcon,
	CaretDownIcon,
	CheckIcon,
	ClipboardIcon,
	CodeIcon,
	LightningIcon,
	PackageIcon,
	ShieldCheckIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { Badge, Card } from "@databuddy/ui";
import { Switch, Tabs } from "@databuddy/ui/client";

interface TrackingSetupTabProps {
	websiteId: string;
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

function PackageInstallTabs() {
	return (
		<Tabs className="w-full" defaultValue="bun">
			<Tabs.List className="max-w-full overflow-x-auto">
				{Object.keys(INSTALL_COMMANDS).map((manager) => (
					<Tabs.Tab className="text-xs" key={manager} value={manager}>
						{manager}
					</Tabs.Tab>
				))}
			</Tabs.List>
			{Object.entries(INSTALL_COMMANDS).map(([manager, command]) => (
				<Tabs.Panel className="mt-3" key={manager} value={manager}>
					<CodeBlock code={command} language="bash">
						<CodeBlockCopyButton />
					</CodeBlock>
				</Tabs.Panel>
			))}
		</Tabs>
	);
}

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
			aria-hidden="true"
			className={className}
			fill="currentColor"
			viewBox="0 0 256 221"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M204.8 0H256L128 220.8L0 0h97.92L128 51.2L157.44 0h47.36Z"
				opacity="0.5"
			/>
			<path
				d="m0 0 128 220.8L256 0h-51.2L128 132.48 51.2 0H0Z"
				opacity="0.25"
			/>
			<path d="M50.56 0 128 133.12 204.8 0h-47.36L128 51.2 97.92 0H50.56Z" />
		</svg>
	);
}

export function WebsiteTrackingSetupTab({ websiteId }: TrackingSetupTabProps) {
	const { isCopied, copyToClipboard } = useCopyToClipboard();
	const [usePinnedVersion, setUsePinnedVersion] = useState(false);
	const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
	const [trackingOptions] = useAtom(trackingOptionsAtom);
	const [, toggleTrackingOptionAction] = useAtom(toggleTrackingOptionAtom);
	const [troubleshootingOpen, setTroubleshootingOpen] = useState(false);
	const { activeOrganization } = useOrganizationsContext();
	const { data: website } = useWebsite(websiteId);
	const install = useAgentInstall(websiteId);
	const site = website ? { id: website.id, domain: website.domain } : null;
	const research = useSiteResearch(activeOrganization?.id, site);

	const { data: trackerVersionsData } = useQuery(
		orpc.tracker.listVersions.queryOptions({
			input: { filename: "databuddy.js" },
		})
	);

	const availableVersions = trackerVersionsData ?? [];

	const activeVersionedScript = useMemo((): VersionedScript | undefined => {
		if (!(usePinnedVersion && selectedVersion)) {
			return;
		}
		const match = availableVersions.find((v) => v.version === selectedVersion);
		if (!match) {
			return;
		}
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
	const nextCode = generateNextJsCode(websiteId, trackingOptions);
	const tanStackCode = generateTanStackCode(websiteId, trackingOptions);
	const npmCode = generateNpmCode(websiteId, trackingOptions);
	const nodeCode = generateNodeCode(websiteId);
	const vueCode = generateVueCode(websiteId, trackingOptions);

	const activeCode =
		usePinnedVersion && pinnedTrackingCode ? pinnedTrackingCode : trackingCode;

	const issue = install.tracking.issue;
	const healthy = install.verified && install.recentEvents > 0 && !issue;

	return (
		<div className="space-y-6">
			<Card className="gap-0 py-0">
				<Card.Header className="flex-row items-center justify-between gap-3 border-border border-b bg-card px-5 py-4">
					<div className="min-w-0">
						<Card.Title>
							{issue
								? "Tracking issue detected"
								: healthy
									? "Tracking active"
									: install.verified
										? "Installed, no recent data"
										: `Install tracking on ${website?.domain ?? "your site"}`}
						</Card.Title>
						{issue || install.verified ? (
							<Card.Description className="mt-1">
								{issue?.message ?? install.statusMessage}
							</Card.Description>
						) : null}
					</div>
					<Badge variant={healthy ? "success" : "warning"}>
						{healthy
							? "Live"
							: issue
								? "Blocked"
								: install.verified
									? "No recent data"
									: "Waiting"}
					</Badge>
				</Card.Header>
				<Card.Content className="px-5 py-5">
					{website ? (
						<ConnectApp
							agentProgress={install.agentProgress}
							domain={website.domain}
							onCopy={install.markCopied}
							research={research.research}
							setupSession={install.setupSession}
							manualInstall={false}
							onStartResearch={research.start}
							tracking={install.tracking}
							websiteId={websiteId}
						/>
					) : null}
				</Card.Content>
				<Card.Content className="border-border border-t p-5">
					<div className="mb-4 flex items-center justify-between gap-3">
						<h3 className="font-semibold text-sm">Install it yourself</h3>
						{/* policy-ignore dashboard/no-raw-interactive-html: pre-existing compact copy chip; @databuddy/ui Button variants don't match this inline badge styling */}
						<button
							className="group flex min-w-0 items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 font-mono text-xs transition-colors hover:bg-accent-brighter"
							onClick={() => copyToClipboard(websiteId)}
							title={websiteId}
							type="button"
						>
							<span className="text-muted-foreground">ID:</span>
							<span className="min-w-0 truncate">{websiteId}</span>
							{isCopied ? (
								<CheckIcon className="size-3 text-success" />
							) : (
								<ClipboardIcon className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
							)}
						</button>
					</div>
					<Tabs className="w-full" defaultValue="script">
						<Tabs.List className="max-w-full overflow-x-auto">
							<Tabs.Tab value="script">
								<CodeIcon className="size-3.5" />
								Script tag
							</Tabs.Tab>
							<Tabs.Tab value="nextjs">
								<PackageIcon className="size-3.5" />
								Next.js
							</Tabs.Tab>
							<Tabs.Tab value="tanstack">
								<PackageIcon className="size-3.5" />
								TanStack
							</Tabs.Tab>
							<Tabs.Tab value="react">
								<PackageIcon className="size-3.5" />
								React
							</Tabs.Tab>
							<Tabs.Tab value="vue">
								<VueLogo className="size-3.5" />
								Vue
							</Tabs.Tab>
							<Tabs.Tab value="node">
								<PackageIcon className="size-3.5" />
								Node.js
							</Tabs.Tab>
						</Tabs.List>

						<Tabs.Panel className="mt-4 space-y-3" value="script">
							<p className="text-pretty text-muted-foreground text-sm">
								Add this to the{" "}
								<code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">
									{"<head>"}
								</code>{" "}
								of your website:
							</p>

							<CodeBlock code={activeCode} language="tsx">
								<CodeBlockCopyButton />
							</CodeBlock>

							{availableVersions.length > 0 && (
								<div className="space-y-2.5">
									<label
										className={cn(
											"flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
											"hover:border-primary/40 hover:bg-accent/50",
											usePinnedVersion && "border-primary/30 bg-primary/5"
										)}
										htmlFor="switch-pinned-version"
									>
										<Switch
											checked={usePinnedVersion}
											className="shrink-0"
											id="switch-pinned-version"
											onCheckedChange={() => {
												setUsePinnedVersion((prev) => !prev);
												if (!selectedVersion && availableVersions.length > 0) {
													setSelectedVersion(availableVersions[0].version);
												}
											}}
										/>
										<ShieldCheckIcon className="size-4 shrink-0 text-muted-foreground" />
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
															: "border-accent bg-accent hover:bg-accent-brighter"
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
								<LightningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
								<p className="text-muted-foreground text-xs leading-relaxed">
									{usePinnedVersion
										? "Pinned and verified with SRI. The browser will reject the script if contents change. Update the version manually for new features."
										: "Loads asynchronously without blocking page rendering. Data appears within minutes."}
								</p>
							</div>
						</Tabs.Panel>

						<Tabs.Panel className="mt-4 space-y-4" value="nextjs">
							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Install the SDK:
								</p>
								<PackageInstallTabs />
							</div>

							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Mount the component in your root layout (e.g.{" "}
									<code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">
										app/layout.tsx
									</code>
									):
								</p>
								<CodeBlock code={nextCode} language="tsx">
									<CodeBlockCopyButton />
								</CodeBlock>
							</div>

							<div className="rounded-lg border border-border/60 bg-accent/40 p-3 text-muted-foreground text-sm">
								You can also store your Client ID as{" "}
								<code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
									NEXT_PUBLIC_DATABUDDY_CLIENT_ID
								</code>{" "}
								in your{" "}
								<code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
									.env.local
								</code>{" "}
								file and omit the{" "}
								<code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
									clientId
								</code>{" "}
								prop.
							</div>
						</Tabs.Panel>

						<Tabs.Panel className="mt-4 space-y-4" value="tanstack">
							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Install the SDK:
								</p>
								<PackageInstallTabs />
							</div>

							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Mount the component in your root route (
									<code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">
										src/routes/__root.tsx
									</code>
									):
								</p>
								<CodeBlock code={tanStackCode} language="tsx">
									<CodeBlockCopyButton />
								</CodeBlock>
							</div>
						</Tabs.Panel>

						<Tabs.Panel className="mt-4 space-y-4" value="react">
							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Install the SDK:
								</p>
								<PackageInstallTabs />
							</div>

							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Add the component to your layout:
								</p>
								<CodeBlock code={npmCode} language="tsx">
									<CodeBlockCopyButton />
								</CodeBlock>
							</div>
						</Tabs.Panel>

						<Tabs.Panel className="mt-4 space-y-4" value="vue">
							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Install the SDK:
								</p>
								<PackageInstallTabs />
							</div>

							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Add the component to your root layout:
								</p>
								<CodeBlock code={vueCode} language="tsx">
									<CodeBlockCopyButton />
								</CodeBlock>
							</div>
						</Tabs.Panel>

						<Tabs.Panel className="mt-4 space-y-4" value="node">
							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Install the SDK in your backend:
								</p>
								<PackageInstallTabs />
							</div>

							<div className="rounded-lg border border-border/60 bg-accent/40 p-3 text-muted-foreground text-sm">
								Use a Databuddy API key for server-side events. Create one in{" "}
								<Link
									className="font-medium text-foreground underline underline-offset-4"
									href="/organizations/settings#api-keys"
								>
									Organization settings → API keys
								</Link>
								, then set it as{" "}
								<code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
									DATABUDDY_API_KEY
								</code>
								.
							</div>

							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Track server-side events:
								</p>
								<CodeBlock code={nodeCode} language="tsx">
									<CodeBlockCopyButton />
								</CodeBlock>
							</div>

							<a
								className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
								href="https://www.databuddy.cc/docs/sdk/node"
								rel="noreferrer"
								target="_blank"
							>
								<BookOpenIcon className="size-3.5" />
								Read the Node SDK docs
							</a>
						</Tabs.Panel>
					</Tabs>
				</Card.Content>
			</Card>

			<Card className="gap-0 py-0">
				<Card.Content className="p-5">
					<div className="mb-4 flex items-center justify-between">
						<h3 className="font-semibold text-sm">Tracking options</h3>
						<p className="text-muted-foreground text-xs tabular-nums">
							{
								[
									...BASIC_TRACKING_OPTIONS,
									...ADVANCED_TRACKING_OPTIONS,
								].filter((opt) => {
									const value = trackingOptions[opt.key] as boolean;
									return opt.inverted ? !value : value;
								}).length
							}
							/
							{BASIC_TRACKING_OPTIONS.length + ADVANCED_TRACKING_OPTIONS.length}{" "}
							enabled
						</p>
					</div>

					<div className="space-y-4">
						<div>
							<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
								Core
							</p>
							<div className="grid gap-2 sm:grid-cols-2">
								{BASIC_TRACKING_OPTIONS.map((option) => (
									<OptionToggle
										enabled={trackingOptions[option.key] as boolean}
										key={option.key}
										onToggle={() => toggleTrackingOptionAction(option.key)}
										option={option}
									/>
								))}
							</div>
						</div>

						<div>
							<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
								Advanced
							</p>
							<div className="grid gap-2 sm:grid-cols-2">
								{ADVANCED_TRACKING_OPTIONS.map((option) => (
									<OptionToggle
										enabled={trackingOptions[option.key] as boolean}
										key={option.key}
										onToggle={() => toggleTrackingOptionAction(option.key)}
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
							<WarningCircleIcon className="size-4 text-muted-foreground" />
							<span className="font-medium text-sm">Troubleshooting</span>
						</div>
						<CaretDownIcon
							className={cn(
								"size-4 text-muted-foreground transition-transform",
								troubleshootingOpen && "rotate-180"
							)}
						/>
					</button>

					{troubleshootingOpen && (
						<div className="border-t px-4 pt-3 pb-4">
							<div className="space-y-3">
								{TROUBLESHOOTING_ITEMS.map((item) => (
									<div className="flex items-start gap-2.5" key={item.title}>
										<WarningCircleIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
										<div className="min-w-0">
											<p className="font-medium text-sm">{item.title}</p>
											<p className="text-pretty text-muted-foreground text-xs leading-relaxed">
												{item.description}
											</p>
										</div>
									</div>
								))}
							</div>

							<div className="mt-4 flex items-center gap-2 rounded-lg bg-accent/50 p-3">
								<BookOpenIcon className="size-4 shrink-0 text-muted-foreground" />
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
