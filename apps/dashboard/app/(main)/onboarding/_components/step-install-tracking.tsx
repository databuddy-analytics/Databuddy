"use client";

import { track } from "@databuddy/sdk";
import {
	ArrowClockwiseIcon,
	CheckIcon,
	ClipboardIcon,
	CodeIcon,
	PackageIcon,
	PulseIcon,
	SparkleIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	COPY_SUCCESS_TIMEOUT,
	INSTALL_COMMANDS,
} from "../../websites/[id]/_components/shared/tracking-constants";
import {
	generateNpmCode,
	generateScriptTag,
} from "../../websites/[id]/_components/utils/code-generators";

// TODO: Replace with published skill URL once available
const SKILL_URL = "https://github.com/databuddy-cc/skill";

function generateAgentPrompt(websiteId: string): string {
	return `Add Databuddy analytics to this repository. Client ID: ${websiteId}

## References
- Docs: https://www.databuddy.cc/docs/getting-started
- LLMs.txt: https://www.databuddy.cc/llms.txt
- Full docs: https://www.databuddy.cc/docs
- Skill (install for full context): ${SKILL_URL}

## Installation

Choose the right method for this project's framework:

**React / Next.js** — \`bun add @databuddy/sdk\` (or npm/yarn/pnpm)
\`\`\`tsx
import { Databuddy } from "@databuddy/sdk/react";
// Mount at the app root (layout.tsx or _app.tsx)
<Databuddy clientId={process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID!} />
\`\`\`

**Vue** — \`bun add @databuddy/sdk\`
\`\`\`vue
<script setup>
import { Databuddy } from "@databuddy/sdk/vue";
</script>
<template>
  <Databuddy :client-id="import.meta.env.VITE_DATABUDDY_CLIENT_ID" />
</template>
\`\`\`

**Vanilla JS / HTML** — CDN script in \`<head>\`:
\`\`\`html
<script src="https://cdn.databuddy.cc/databuddy.js" data-client-id="${websiteId}" crossorigin="anonymous" async></script>
\`\`\`

Store the Client ID in an env var — never hardcode it.
- Next.js: NEXT_PUBLIC_DATABUDDY_CLIENT_ID
- Vue/Vite: VITE_DATABUDDY_CLIENT_ID

## Configuration Options

All options work as React/Vue props or \`data-*\` attributes on the script tag.
| Option | Type | Default | What it does |
|--------|------|---------|-------------|
| trackWebVitals | bool | false | Core Web Vitals (LCP, CLS, INP, TTFB) |
| trackPerformance | bool | true | Page load timing |
| trackErrors | bool | false | JavaScript errors and exceptions |
| trackHashChanges | bool | false | URL hash changes (SPA routing) |
| trackAttributes | bool | false | Auto-track elements with data-track attribute |
| trackOutgoingLinks | bool | false | Clicks to external sites |
| trackInteractions | bool | false | Button clicks and form submissions |
| trackSessions | bool | true | Session tracking (automatic) |
| trackScreenViews | bool | true | Page view tracking (automatic) |
| disabled | bool | false | Master kill switch |
| samplingRate | 0-1 | 1.0 | Fraction of events to capture |
| enableBatching | bool | true | Batch events before sending |
| batchSize | num | 10 | Events per batch |
| batchTimeout | num | 2000 | Max ms before flushing batch |
| enableRetries | bool | true | Retry failed requests |
| maxRetries | num | 3 | Max retry attempts |

Enable what makes sense for this project. A good starting point:
\`\`\`tsx
<Databuddy clientId={...} trackWebVitals trackErrors />
\`\`\`

## Custom Events

\`\`\`tsx
import { track } from "@databuddy/sdk";
track("signup_completed", { method: "google", plan: "pro" });
\`\`\`

Use snake_case event names. Track decisions and milestones (signup_completed, purchase_completed, feature_used), not every click. Keep properties low-cardinality. Never track PII.

## Verification — How to Confirm It Works

1. Open DevTools → Network tab, reload the page
2. Look for a request to cdn.databuddy.cc/databuddy.js (script loading)
3. Look for requests to basket.databuddy.cc (events being sent)
4. Both should return 200. If events show the correct Client ID in the payload, tracking is working.

## Common Issues & Fixes

**Domain mismatch**: Events are rejected if sent from a domain that doesn't match the website configured in Databuddy. The domain in settings must match the domain the script runs on.

**Content Security Policy (CSP)**: If the site has strict CSP headers, add these directives:
- script-src: https://cdn.databuddy.cc
- connect-src: https://basket.databuddy.cc

**Ad blockers**: uBlock Origin, Privacy Badger, and similar extensions may block analytics scripts. Test with extensions disabled. For production, consider a custom tracking domain (proxy through your own domain).

**Localhost is ignored by default**: The SDK does not send events from localhost in production builds. During development, events only fire if the dev server is running.

**Script not loading**: Verify the script tag is in <head> (not <body>), the src URL is correct, and no CSP or network error appears in the console.

**Events not appearing in dashboard**: Data typically appears within 30 seconds. Check the Network tab for failed requests to basket.databuddy.cc. Verify the Client ID matches. Check for console errors.

**If another analytics tool is present**: Both can run in parallel. No conflicts. Optionally disable the other tool's page view tracking if Databuddy handles it.

## Report Back — Required

After installation (success or failure), send a POST to report what happened. This helps us improve the setup experience.

\`\`\`bash
curl -X POST https://api.databuddy.cc/public/v1/agent-telemetry \\
  -H "Content-Type: application/json" \\
  -d '{
    "websiteId": "${websiteId}",
    "agent": "claude",
    "status": "success",
    "framework": "nextjs",
    "installMethod": "sdk",
    "stepsCompleted": ["install", "mount", "env-var", "verify"],
    "issues": [],
    "metadata": {}
  }'
\`\`\`

Fields:
- **websiteId**: "${websiteId}"
- **agent**: Which tool ran this (claude, cursor, copilot, windsurf, other)
- **status**: "success" | "partial" | "failed"
- **framework**: What framework was detected (nextjs, react, vue, vanilla, etc.)
- **installMethod**: "sdk" or "script-tag"
- **stepsCompleted**: Array of steps that succeeded: "install", "mount", "env-var", "verify"
- **issues**: Array of problems encountered, e.g. [{"type": "csp", "detail": "blocked cdn.databuddy.cc", "resolved": true}]
  - Common issue types: csp, adblocker, domain-mismatch, script-blocked, build-error, type-error, env-var-missing
- **errorMessage**: Final error message if status is "failed"
- **metadata**: Any extra context (package manager used, versions, etc.)

Always send this report, even on failure. It's a single fire-and-forget POST.`;
}

function ClaudeLogo({ color }: { color: string }) {
	return (
		<svg aria-hidden="true" className="size-5" fill={color} viewBox="0 0 24 24">
			<path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
		</svg>
	);
}

function CursorLogo({ color }: { color: string }) {
	return (
		<svg aria-hidden="true" className="size-5" fill={color} viewBox="0 0 24 24">
			<path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
		</svg>
	);
}

function CopilotLogo({ color }: { color: string }) {
	return (
		<svg aria-hidden="true" className="size-5" fill={color} viewBox="0 0 24 24">
			<path d="M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z" />
		</svg>
	);
}

function WindsurfLogo({ color }: { color: string }) {
	return (
		<svg aria-hidden="true" className="size-5" fill={color} viewBox="0 0 24 24">
			<path d="M23.55 5.067c-1.2038-.002-2.1806.973-2.1806 2.1765v4.8676c0 .972-.8035 1.7594-1.7597 1.7594-.568 0-1.1352-.286-1.4718-.7659l-4.9713-7.1003c-.4125-.5896-1.0837-.941-1.8103-.941-1.1334 0-2.1533.9635-2.1533 2.153v4.8957c0 .972-.7969 1.7594-1.7596 1.7594-.57 0-1.1363-.286-1.4728-.7658L.4076 5.1598C.2822 4.9798 0 5.0688 0 5.2882v4.2452c0 .2147.0656.4228.1884.599l5.4748 7.8183c.3234.462.8006.8052 1.3509.9298 1.3771.313 2.6446-.747 2.6446-2.0977v-4.893c0-.972.7875-1.7593 1.7596-1.7593h.003a1.798 1.798 0 0 1 1.4718.7658l4.9723 7.0994c.4135.5905 1.05.941 1.8093.941 1.1587 0 2.1515-.9645 2.1515-2.153v-4.8948c0-.972.7875-1.7594 1.7596-1.7594h.194a.22.22 0 0 0 .2204-.2202v-4.622a.22.22 0 0 0-.2203-.2203Z" />
		</svg>
	);
}

const AI_TOOLS = [
	{
		id: "claude",
		name: "Claude Code",
		description: "Copy prompt for Claude",
		color: "#D97757",
		icon: ClaudeLogo,
	},
	{
		id: "cursor",
		name: "Cursor",
		description: "Copy prompt for Cursor",
		color: "#00A0F0",
		icon: CursorLogo,
	},
	{
		id: "copilot",
		name: "GitHub Copilot",
		description: "Copy prompt for Copilot",
		color: "#6E40C9",
		icon: CopilotLogo,
	},
	{
		id: "windsurf",
		name: "Windsurf",
		description: "Copy prompt for Windsurf",
		color: "#00C48C",
		icon: WindsurfLogo,
	},
];

const DEFAULT_TRACKING_OPTIONS = {
	disabled: false,
	trackHashChanges: false,
	trackAttributes: false,
	trackOutgoingLinks: false,
	trackInteractions: false,
	trackPerformance: false,
	trackWebVitals: false,
	trackErrors: false,
	trackSessions: true,
	trackScreenViews: false,
	enableBatching: true,
	enableRetries: true,
	batchSize: 10,
	batchTimeout: 5000,
	maxRetries: 3,
	initialRetryDelay: 1000,
	samplingRate: 1,
};

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
		[code]
	);

	return (
		<div className="group relative">
			<div className="relative overflow-hidden rounded border border-white/10 bg-[#101010]">
				<div
					className={cn(
						"overflow-x-auto font-mono text-[13px] leading-relaxed",
						"[&>pre]:m-0 [&>pre]:overflow-visible [&>pre]:p-4 [&>pre]:leading-relaxed",
						"[&>pre>code]:block [&>pre>code]:w-full",
						"[&_.line]:min-h-5"
					)}
					dangerouslySetInnerHTML={{ __html: highlighted }}
				/>
				<Button
					className="absolute top-2 right-2 size-7 bg-white/10 opacity-0 backdrop-blur-sm hover:bg-white/20 group-hover:opacity-100"
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

interface StepInstallTrackingProps {
	onComplete: () => void;
	websiteId: string;
}

export function StepInstallTracking({
	websiteId,
	onComplete,
}: StepInstallTrackingProps) {
	const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const trackingCode = generateScriptTag(websiteId, DEFAULT_TRACKING_OPTIONS);
	const npmCode = generateNpmCode(websiteId, DEFAULT_TRACKING_OPTIONS);

	const { data: trackingSetupData, refetch: refetchTrackingSetup } = useQuery({
		...orpc.websites.isTrackingSetup.queryOptions({ input: { websiteId } }),
		enabled: !!websiteId,
	});

	const isSetup = trackingSetupData?.tracking_setup ?? false;

	const handleCopy = (code: string, blockId: string, message: string) => {
		try {
			navigator.clipboard.writeText(code);
			setCopiedBlockId(blockId);
			toast.success(message);
			setTimeout(() => setCopiedBlockId(null), COPY_SUCCESS_TIMEOUT);
			try {
				track("onboarding_tracking_copied", {
					block: blockId,
					method: AI_TOOLS.some((t) => t.id === blockId)
						? "ai"
						: blockId.includes("install")
							? "sdk"
							: "script",
				});
			} catch {}
		} catch {
			toast.error("Failed to copy to clipboard");
		}
	};

	const handleCheckStatus = async () => {
		setIsRefreshing(true);
		try {
			track("onboarding_tracking_check_status");
		} catch {}
		try {
			const result = await refetchTrackingSetup();
			if (result.data?.tracking_setup) {
				toast.success("Tracking verified! Data is flowing.");
				try {
					track("onboarding_tracking_verified");
				} catch {}
				onComplete();
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
			<div className="flex items-center gap-3">
				<div className="flex size-10 items-center justify-center rounded bg-primary/10">
					<CodeIcon className="size-5 text-primary" weight="duotone" />
				</div>
				<div>
					<h2 className="text-balance font-semibold text-lg">
						Install tracking
					</h2>
					<p className="text-pretty text-muted-foreground text-sm">
						Add a small script to your website to start collecting data.
					</p>
				</div>
			</div>

			<Card
				className={cn(
					"gap-0 overflow-hidden py-0",
					isSetup
						? "border-success/30 bg-success/5"
						: "border-amber-500/30 bg-amber-500/5"
				)}
			>
				<CardContent className="flex items-center justify-between p-3">
					<div className="flex items-center gap-3">
						{isSetup ? (
							<PulseIcon className="size-5 text-success" weight="duotone" />
						) : (
							<WarningCircleIcon
								className="size-5 text-amber-500"
								weight="duotone"
							/>
						)}
						<div className="flex items-center gap-2">
							<span className="font-medium text-sm">
								{isSetup ? "Tracking Active" : "Awaiting Installation"}
							</span>
							<Badge variant={isSetup ? "green" : "amber"}>
								{isSetup ? "Live" : "Pending"}
							</Badge>
						</div>
					</div>
					<Button
						disabled={isRefreshing}
						onClick={handleCheckStatus}
						size="sm"
						variant="outline"
					>
						<ArrowClockwiseIcon
							className={cn("size-3.5", isRefreshing && "animate-spin")}
							weight="bold"
						/>
						{isRefreshing ? "Checking..." : "Check Status"}
					</Button>
				</CardContent>
			</Card>

			<Tabs className="w-full" defaultValue="ai" variant="underline">
				<TabsList>
					<TabsTrigger value="ai">
						<SparkleIcon className="size-3.5" weight="duotone" />
						Install with AI
					</TabsTrigger>
					<TabsTrigger value="npm">
						<PackageIcon className="size-3.5" weight="duotone" />
						SDK Package
					</TabsTrigger>
					<TabsTrigger value="script">
						<CodeIcon className="size-3.5" weight="duotone" />
						Script Tag
					</TabsTrigger>
				</TabsList>

				<TabsContent className="mt-4 space-y-4" value="ai">
					<p className="text-pretty text-muted-foreground text-sm">
						Let your AI assistant install Databuddy for you. Copy the setup
						prompt into your tool of choice.
					</p>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{AI_TOOLS.map((tool) => (
							<button
								className={cn(
									"group flex items-center gap-3 rounded border p-3 text-left",
									"hover:border-[var(--tool-color)]",
									copiedBlockId === tool.id &&
										"border-[var(--tool-color)] bg-[var(--tool-color)]/5"
								)}
								key={tool.id}
								onClick={() =>
									handleCopy(
										generateAgentPrompt(websiteId),
										tool.id,
										`Copied! Paste into ${tool.name}`
									)
								}
								style={{ "--tool-color": tool.color } as React.CSSProperties}
								type="button"
							>
								<div
									className="flex size-10 shrink-0 items-center justify-center rounded"
									style={{ backgroundColor: `${tool.color}15` }}
								>
									<tool.icon color={tool.color} />
								</div>
								<div className="min-w-0 flex-1">
									<p className="font-medium text-sm">{tool.name}</p>
									<p className="text-muted-foreground text-xs">
										{copiedBlockId === tool.id
											? "Copied to clipboard!"
											: tool.description}
									</p>
								</div>
								<div className="shrink-0">
									{copiedBlockId === tool.id ? (
										<CheckIcon
											className="size-4"
											style={{ color: tool.color }}
											weight="bold"
										/>
									) : (
										<ClipboardIcon
											className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100"
											weight="duotone"
										/>
									)}
								</div>
							</button>
						))}
					</div>

					<p className="text-center text-muted-foreground text-xs">
						Works with any AI assistant that accepts text prompts
					</p>
				</TabsContent>

				<TabsContent className="mt-4 space-y-4" value="npm">
					<Tabs className="w-full" defaultValue="bun" variant="underline">
						<TabsList>
							{Object.keys(INSTALL_COMMANDS).map((manager) => (
								<TabsTrigger className="text-xs" key={manager} value={manager}>
									{manager}
								</TabsTrigger>
							))}
						</TabsList>
						{Object.entries(INSTALL_COMMANDS).map(([manager, command]) => (
							<TabsContent className="mt-3" key={manager} value={manager}>
								<CodeBlock
									code={command}
									copied={copiedBlockId === `${manager}-install`}
									onCopy={() =>
										handleCopy(command, `${manager}-install`, "Copied!")
									}
								/>
							</TabsContent>
						))}
					</Tabs>

					<div className="space-y-2">
						<p className="text-muted-foreground text-sm">
							Then add the component to your layout:
						</p>
						<CodeBlock
							code={npmCode}
							copied={copiedBlockId === "npm-code"}
							onCopy={() => handleCopy(npmCode, "npm-code", "Code copied!")}
						/>
					</div>
				</TabsContent>

				<TabsContent className="mt-4 space-y-3" value="script">
					<p className="text-muted-foreground text-sm">
						Add this to the{" "}
						<code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">
							{"<head>"}
						</code>{" "}
						of your website:
					</p>
					<CodeBlock
						code={trackingCode}
						copied={copiedBlockId === "script-tag"}
						onCopy={() =>
							handleCopy(trackingCode, "script-tag", "Script tag copied!")
						}
					/>
				</TabsContent>
			</Tabs>

			<div className="flex items-center gap-2">
				<span className="text-muted-foreground text-xs">Website ID:</span>
				<button
					className="group flex items-center gap-1.5 rounded bg-accent px-2 py-1 font-mono text-xs hover:bg-accent-brighter"
					onClick={() =>
						handleCopy(websiteId, "website-id", "Website ID copied!")
					}
					type="button"
				>
					<span className="truncate">{websiteId}</span>
					{copiedBlockId === "website-id" ? (
						<CheckIcon className="size-3 text-success" weight="bold" />
					) : (
						<ClipboardIcon
							className="size-3 opacity-50 group-hover:opacity-100"
							weight="duotone"
						/>
					)}
				</button>
			</div>
		</div>
	);
}
