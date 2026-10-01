"use client";

import { Button, StatusDot } from "@databuddy/ui";
import { CaretRightIcon, CheckIcon } from "@databuddy/ui/icons";
import { useMemo, useState } from "react";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import html from "shiki/langs/html.mjs";
import vesper from "shiki/themes/vesper.mjs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { COPY_SUCCESS_TIMEOUT } from "../../websites/[id]/_components/constants/settings-constants";
import {
	generateAgentPrompt,
	generateScriptTag,
} from "../../websites/[id]/_components/utils/code-generators";
import { RECOMMENDED_DEFAULTS } from "../../websites/[id]/_components/utils/tracking-defaults";

const AGENTS = [
	{ id: "cursor", name: "Cursor", icon: "Cursor", invert: true },
	{ id: "claude", name: "Claude Code", icon: "Claude", invert: false },
	{ id: "codex", name: "Codex", icon: "ChatGPT", invert: true },
	{ id: "copilot", name: "Copilot", icon: "Copilot", invert: false },
] as const;

const highlighter = createHighlighterCoreSync({
	themes: [vesper],
	langs: [html],
	engine: createJavaScriptRegexEngine(),
});

async function copyText(value: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		return false;
	}
}

export type TrackingCopyMethod = "ai" | "script";

export interface TrackingStatus {
	issue: { fix: string; message: string } | null;
	state: "awaiting" | "error" | "verified";
}

interface ConnectAppProps {
	domain: string;
	onCopy?: (method: TrackingCopyMethod, agent?: string) => void;
	onSkip: () => void;
	tracking: TrackingStatus;
	websiteId: string;
}

export function ConnectApp({
	domain,
	onCopy,
	onSkip,
	tracking,
	websiteId,
}: ConnectAppProps) {
	const [copied, setCopied] = useState<string | null>(null);
	const [showScript, setShowScript] = useState(false);
	const scriptTag = generateScriptTag(websiteId, RECOMMENDED_DEFAULTS);
	const highlighted = useMemo(
		() => highlighter.codeToHtml(scriptTag, { lang: "html", theme: "vesper" }),
		[scriptTag]
	);

	const copy = async (id: string, method: TrackingCopyMethod) => {
		const text = method === "ai" ? generateAgentPrompt(websiteId) : scriptTag;
		if (!(await copyText(text))) {
			toast.error("Copy failed. Select the text and copy it manually.");
			return;
		}
		setCopied(id);
		setTimeout(() => setCopied(null), COPY_SUCCESS_TIMEOUT);
		onCopy?.(method, method === "ai" ? id : undefined);
	};

	return (
		<div className="space-y-5">
			<div className="space-y-2.5">
				<p className="font-medium text-muted-foreground text-xs">
					Send to your coding agent
				</p>
				<div className="flex flex-wrap gap-2">
					{AGENTS.map((agent) => (
						<Button
							className="border border-border bg-background hover:bg-accent"
							key={agent.id}
							onClick={() => copy(agent.id, "ai")}
							size="sm"
							variant="ghost"
						>
							{copied === agent.id ? (
								<CheckIcon className="size-4 text-success" />
							) : (
								<img
									alt=""
									className={cn("size-4", agent.invert && "dark:invert")}
									height={16}
									src={`/ai/${agent.icon}.svg`}
									width={16}
								/>
							)}
							{agent.name}
						</Button>
					))}
				</div>
			</div>

			<div>
				<Button
					className="-ml-2.5"
					onClick={() => setShowScript((value) => !value)}
					size="sm"
					variant="ghost"
				>
					<CaretRightIcon
						className={cn(
							"size-3 transition-transform duration-150",
							showScript && "rotate-90"
						)}
					/>
					Or install it yourself
				</Button>
				<div
					className={cn(
						"grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
						showScript ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
					)}
				>
					<div className="min-h-0 overflow-hidden">
						<div className="group relative mt-3 overflow-hidden rounded border border-border">
							<div
								className={cn(
									"overflow-x-auto font-mono text-[13px] leading-relaxed",
									"[&>pre]:m-0 [&>pre]:overflow-visible [&>pre]:p-4 [&>pre]:leading-relaxed",
									"[&>pre>code]:block [&>pre>code]:w-full"
								)}
								dangerouslySetInnerHTML={{ __html: highlighted }}
							/>
							<Button
								className="absolute top-2 right-2"
								onClick={() => copy("script", "script")}
								size="sm"
								variant="secondary"
							>
								{copied === "script" ? "Copied" : "Copy"}
							</Button>
						</div>
					</div>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 border-border border-t pt-4">
				<div className="flex items-start gap-2">
					<StatusDot
						className="mt-1"
						color={tracking.state === "error" ? "destructive" : "warning"}
						pulse={tracking.state !== "error"}
						size="sm"
					/>
					<p
						className={cn(
							"text-pretty text-xs",
							tracking.state === "error"
								? "text-destructive"
								: "text-muted-foreground"
						)}
					>
						{tracking.issue
							? `${tracking.issue.message} ${tracking.issue.fix}`
							: tracking.state === "error"
								? "Couldn't check for events. Checking again shortly."
								: `Waiting for the first page view from ${domain}. Open the site once after installing.`}
					</p>
				</div>
				<Button onClick={onSkip} size="sm" variant="ghost">
					Skip for now
				</Button>
			</div>
		</div>
	);
}
