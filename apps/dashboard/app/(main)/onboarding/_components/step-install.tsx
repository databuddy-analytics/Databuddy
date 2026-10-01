"use client";

import { Button } from "@databuddy/ui";
import { CheckIcon, ClipboardIcon } from "@databuddy/ui/icons";
import { useMemo, useState } from "react";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import html from "shiki/langs/html.mjs";
import tsx from "shiki/langs/tsx.mjs";
import vesper from "shiki/themes/vesper.mjs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { COPY_SUCCESS_TIMEOUT } from "../../websites/[id]/_components/constants/settings-constants";
import {
	generateAgentPrompt,
	generateScriptTag,
} from "../../websites/[id]/_components/utils/code-generators";
import { RECOMMENDED_DEFAULTS } from "../../websites/[id]/_components/utils/tracking-defaults";
import {
	OnboardingStepHeader,
	ResearchStatus,
	StatusRow,
} from "./onboarding-shell";
import type { OnboardingResearch } from "./use-onboarding-research";

async function copyTextToClipboard(value: string): Promise<boolean> {
	if (!(value && typeof window !== "undefined")) {
		return false;
	}

	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(value);
			return true;
		}
	} catch {
		// Firefox can reject clipboard writes outside a granted permission flow.
	}

	const textarea = document.createElement("textarea");
	textarea.value = value;
	textarea.setAttribute("readonly", "true");
	textarea.style.left = "-9999px";
	textarea.style.position = "fixed";
	textarea.style.top = "0";

	const selection = document.getSelection();
	const selectedRange =
		selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

	document.body.appendChild(textarea);
	textarea.focus();
	textarea.select();

	try {
		return document.execCommand("copy");
	} catch {
		return false;
	} finally {
		textarea.remove();
		if (selection && selectedRange) {
			selection.removeAllRanges();
			selection.addRange(selectedRange);
		}
	}
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
			<div className="relative overflow-hidden rounded border border-border">
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
					className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100"
					onClick={onCopy}
					size="icon"
					variant="ghost"
				>
					{copied ? (
						<CheckIcon className="size-3.5 text-success" />
					) : (
						<ClipboardIcon className="size-3.5 text-white/70" />
					)}
				</Button>
			</div>
		</div>
	);
}

export type TrackingCopyMethod = "ai" | "script";

export interface TrackingStatus {
	issue: { fix: string; message: string } | null;
	state: "awaiting" | "error" | "verified";
}

interface StepInstallProps {
	domain: string;
	onCopy?: (method: TrackingCopyMethod) => void;
	research: OnboardingResearch;
	tracking: TrackingStatus;
	websiteId: string;
}

export function StepInstall({
	domain,
	onCopy,
	research,
	tracking,
	websiteId,
}: StepInstallProps) {
	const [copied, setCopied] = useState<TrackingCopyMethod | null>(null);
	const [showScript, setShowScript] = useState(false);
	const scriptTag = generateScriptTag(websiteId, RECOMMENDED_DEFAULTS);
	const verified = tracking.state === "verified";

	const copy = async (method: TrackingCopyMethod) => {
		const text = method === "ai" ? generateAgentPrompt(websiteId) : scriptTag;
		if (!(await copyTextToClipboard(text))) {
			toast.error("Copy failed - select and copy manually.");
			return;
		}
		setCopied(method);
		setTimeout(() => setCopied(null), COPY_SUCCESS_TIMEOUT);
		onCopy?.(method);
	};

	return (
		<div>
			<OnboardingStepHeader
				description={
					verified
						? "Events are flowing. Continue whenever you're ready."
						: "Paste one prompt into your coding agent and it installs the SDK for you. This page updates the moment the first page view lands."
				}
				title={verified ? "Tracking verified" : `Install tracking on ${domain}`}
			/>

			<div className="space-y-7">
				<div className="space-y-4">
					<ResearchStatus
						domain={research.domain}
						pagesRead={research.pagesRead}
						phase={research.phase}
					/>

					<StatusRow
						color={
							verified
								? "success"
								: tracking.state === "error"
									? "destructive"
									: "warning"
						}
						detail={
							tracking.issue
								? `${tracking.issue.message} ${tracking.issue.fix}`
								: verified
									? "Page views and sessions are being recorded."
									: tracking.state === "error"
										? "Checking again shortly."
										: "Open the site once after installing. Checks run every few seconds."
						}
						title={
							verified
								? "Tracking verified"
								: tracking.state === "error"
									? "Couldn't check for events"
									: `Waiting for the first page view from ${domain}`
						}
					/>
				</div>
				{verified ? null : (
					<div className="space-y-3">
						<Button onClick={() => copy("ai")} size="lg">
							{copied === "ai" ? (
								<CheckIcon className="size-4" />
							) : (
								<ClipboardIcon className="size-4" />
							)}
							{copied === "ai" ? "Copied" : "Copy prompt for your coding agent"}
						</Button>
						<p className="text-muted-foreground text-xs">
							Works with Claude Code, Cursor, Copilot, and any agent that takes
							a prompt. It carries your Client ID and how to verify the install.
						</p>
						<Button
							className="h-auto px-0 text-xs underline underline-offset-2"
							onClick={() => setShowScript((value) => !value)}
							size="sm"
							variant="ghost"
						>
							{showScript
								? "Hide the script tag"
								: "Prefer to paste a script tag?"}
						</Button>
						{showScript ? (
							<CodeBlock
								code={scriptTag}
								copied={copied === "script"}
								onCopy={() => copy("script")}
							/>
						) : null}
					</div>
				)}
			</div>
		</div>
	);
}
