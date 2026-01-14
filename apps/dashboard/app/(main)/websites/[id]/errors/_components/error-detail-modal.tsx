"use client";

import {
	ArrowSquareOutIcon,
	CheckIcon,
	ClockIcon,
	CodeIcon,
	CopyIcon,
	GlobeIcon,
	HashIcon,
	LinkIcon,
	StackIcon,
	UserIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { BrowserIcon, CountryFlag, OSIcon } from "@/components/icon";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { getDeviceIcon, getErrorTypeIcon } from "./error-icons";
import type { RecentError } from "./types";
import {
	formatDateTimeSeconds,
	getErrorCategory,
	getSeverityColor,
} from "./utils";

dayjs.extend(relativeTime);

interface ErrorDetailModalProps {
	error: RecentError;
	isOpen: boolean;
	onClose: () => void;
}

type CopiedSection =
	| "message"
	| "stack"
	| "url"
	| "session"
	| "user"
	| "all"
	| null;

const CopyButton = ({
	text,
	section,
	copiedSection,
	onCopy,
	ariaLabel,
}: {
	text: string;
	section: CopiedSection;
	copiedSection: CopiedSection;
	onCopy: (text: string, section: CopiedSection) => void;
	ariaLabel?: string;
}) => {
	const isCopied = copiedSection === section;

	return (
		<Button
			aria-label={ariaLabel || `Copy ${section}`}
			className="size-7 shrink-0"
			onClick={() => onCopy(text, section)}
			size="icon"
			variant="ghost"
		>
			{isCopied ? (
				<CheckIcon className="size-3.5 text-green-500" weight="bold" />
			) : (
				<CopyIcon className="size-3.5 text-muted-foreground" />
			)}
		</Button>
	);
};

const SeverityIndicator = ({
	severity,
}: {
	severity: "high" | "medium" | "low";
}) => {
	const config = {
		high: { color: "bg-primary" },
		medium: { color: "bg-chart-2" },
		low: { color: "bg-chart-3" },
	};

	return (
		<div className="flex items-center gap-2">
			<span className={`size-2.5 rounded-full ${config[severity].color}`} />
			<span className="text-muted-foreground text-xs capitalize">
				{severity} severity
			</span>
		</div>
	);
};

export const ErrorDetailModal = ({
	error,
	isOpen,
	onClose,
}: ErrorDetailModalProps) => {
	const [copiedSection, setCopiedSection] = useState<CopiedSection>(null);

	if (!error) {
		return null;
	}

	const copyToClipboard = async (text: string, section: CopiedSection) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedSection(section);
			toast.success("Copied to clipboard");
			setTimeout(() => setCopiedSection(null), 2000);
		} catch (err) {
			toast.error("Failed to copy", {
				description: err instanceof Error ? err.message : "Unknown error",
			});
		}
	};

	const { type, severity } = getErrorCategory(error.message);
	const relativeTimeStr = dayjs(error.timestamp).fromNow();
	const locationLabel = error.country_name || error.country || "Unknown";
	const locationCode = error.country_code || error.country || "";

	const fullErrorInfo = `Error: ${error.message}
${error.stack ? `\nStack Trace:\n${error.stack}` : ""}

Context:
• URL: ${error.path}
• Session: ${error.session_id || "Unknown"}
• User: ${error.anonymous_id}
• Time: ${formatDateTimeSeconds(error.timestamp)}
• Browser: ${error.browser_name || "Unknown"}
• OS: ${error.os_name || "Unknown"}
• Device: ${error.device_type || "Unknown"}
• Location: ${locationLabel}`;

	interface QuickAction {
		key: string;
		node: ReactNode;
		description: string;
	}

	const quickActions: QuickAction[] = [];

	if (error.path) {
		quickActions.push({
			key: "copy-url",
			description: "Copy full page URL",
			node: (
				<Button
					onClick={() => copyToClipboard(error.path, "url")}
					size="sm"
					variant="outline"
				>
					<LinkIcon className="size-3.5" weight="duotone" />
					Copy URL
				</Button>
			),
		});
	}

	const isAbsoluteUrl =
		typeof error.path === "string" &&
		(error.path.startsWith("http://") || error.path.startsWith("https://"));

	if (isAbsoluteUrl) {
		quickActions.push({
			key: "open-page",
			description: "Open this page in a new tab",
			node: (
				<Button asChild size="sm" variant="ghost">
					<a href={error.path} rel="noopener noreferrer" target="_blank">
						<ArrowSquareOutIcon className="size-3.5" weight="duotone" />
						Open Page
					</a>
				</Button>
			),
		});
	}

	if (error.session_id) {
		quickActions.push({
			key: "copy-session",
			description: "Copy the session identifier",
			node: (
				<Button
					onClick={() => copyToClipboard(error.session_id ?? "", "session")}
					size="sm"
					variant="ghost"
				>
					<HashIcon className="size-3.5" weight="duotone" />
					Copy Session
				</Button>
			),
		});
	}

	if (error.stack) {
		quickActions.push({
			key: "copy-stack",
			description: "Copy the stack trace",
			node: (
				<Button
					onClick={() => copyToClipboard(error.stack ?? "", "stack")}
					size="sm"
					variant="ghost"
				>
					<StackIcon className="size-3.5" weight="duotone" />
					Copy Stack
				</Button>
			),
		});
	}

	const contextRows = [
		{
			key: "url",
			label: "Page URL",
			value: error.path || "—",
			icon: (
				<LinkIcon
					className="size-4 shrink-0 text-muted-foreground"
					weight="duotone"
				/>
			),
			copySection: error.path ? "url" : null,
			copyValue: error.path,
		},
		{
			key: "session",
			label: "Session ID",
			value: error.session_id || "—",
			icon: (
				<HashIcon
					className="size-4 shrink-0 text-muted-foreground"
					weight="duotone"
				/>
			),
			copySection: error.session_id ? "session" : null,
			copyValue: error.session_id,
		},
		{
			key: "user",
			label: "User ID",
			value: error.anonymous_id || "—",
			icon: (
				<UserIcon
					className="size-4 shrink-0 text-muted-foreground"
					weight="duotone"
				/>
			),
			copySection: error.anonymous_id ? "user" : null,
			copyValue: error.anonymous_id,
		},
	];

	const metadataRows = [
		{
			key: "event",
			label: "Event ID",
			value: error.event_id,
			icon: (
				<StackIcon
					className="size-4 shrink-0 text-muted-foreground"
					weight="duotone"
				/>
			),
		},
		{
			key: "client",
			label: "Client ID",
			value: error.client_id,
			icon: (
				<UserIcon
					className="size-4 shrink-0 text-muted-foreground"
					weight="duotone"
				/>
			),
		},
		{
			key: "ip",
			label: "IP Address",
			value: error.ip,
			icon: <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />,
		},
		{
			key: "agent",
			label: "User Agent",
			value: error.user_agent,
			icon: (
				<CodeIcon
					className="size-4 shrink-0 text-muted-foreground"
					weight="duotone"
				/>
			),
		},
	].filter((row) => Boolean(row.value));

	return (
		<Sheet onOpenChange={onClose} open={isOpen}>
			<SheetContent className="sm:max-w-xl" side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div className="flex size-11 items-center justify-center rounded bg-accent">
							{getErrorTypeIcon(type)}
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<SheetTitle className="text-foreground text-lg">
									{type}
								</SheetTitle>
								<Badge className={getSeverityColor(severity)}>{severity}</Badge>
							</div>
							<SheetDescription className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs sm:text-sm">
								<ClockIcon className="size-3.5" weight="duotone" />
								<span>{relativeTimeStr}</span>
								<span className="text-muted-foreground/50">•</span>
								<span className="font-mono">
									{formatDateTimeSeconds(error.timestamp)}
								</span>
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<SheetBody className="space-y-6">
					{quickActions.length > 0 && (
						<section className="space-y-3">
							<span className="font-medium text-muted-foreground text-xs uppercase">
								Quick actions
							</span>
							<div className="flex flex-wrap gap-2">
								{quickActions.map((action) => (
									<Tooltip key={action.key}>
										<TooltipTrigger asChild>{action.node}</TooltipTrigger>
										<TooltipContent className="text-xs">
											{action.description}
										</TooltipContent>
									</Tooltip>
								))}
							</div>
						</section>
					)}

					<section className="space-y-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<CodeIcon className="size-4 text-primary" weight="duotone" />
								<span className="font-medium text-foreground text-sm">
									Error Message
								</span>
							</div>
							<CopyButton
								ariaLabel="Copy error message"
								copiedSection={copiedSection}
								onCopy={copyToClipboard}
								section="message"
								text={error.message}
							/>
						</div>
						<div className="rounded border bg-accent/30 p-4">
							<p className="wrap-break-word text-foreground text-sm leading-relaxed">
								{error.message}
							</p>
						</div>
					</section>

					{error.stack && (
						<section>
							<Accordion collapsible defaultValue="stack" type="single">
								<AccordionItem value="stack">
									<AccordionTrigger>
										<div className="flex items-center gap-2">
											<StackIcon
												className="size-4 text-chart-2"
												weight="duotone"
											/>
											<span className="font-medium text-foreground text-sm">
												Stack Trace
											</span>
										</div>
									</AccordionTrigger>
									<AccordionContent>
										<div className="relative rounded border bg-accent/30 p-4">
											<pre className="wrap-break-word max-h-56 overflow-auto whitespace-pre-wrap font-mono text-foreground text-xs leading-relaxed">
												{error.stack}
											</pre>
											<div className="absolute top-4 right-4">
												<CopyButton
													ariaLabel="Copy stack trace"
													copiedSection={copiedSection}
													onCopy={copyToClipboard}
													section="stack"
													text={error.stack}
												/>
											</div>
										</div>
									</AccordionContent>
								</AccordionItem>
							</Accordion>
						</section>
					)}

					{(error.filename || error.lineno) && (
						<section className="space-y-3">
							<div className="flex items-center gap-2">
								<CodeIcon className="size-4 text-chart-3" weight="duotone" />
								<span className="font-medium text-foreground text-sm">
									Source Location
								</span>
							</div>
							<div className="rounded border bg-accent/30 p-3">
								<div className="flex items-center gap-1 font-mono text-sm">
									<span className="text-foreground">
										{error.filename || "Unknown file"}
									</span>
									{error.lineno && (
										<>
											<span className="text-muted-foreground/50">:</span>
											<span className="text-primary">{error.lineno}</span>
										</>
									)}
									{error.colno && (
										<>
											<span className="text-muted-foreground/50">:</span>
											<span className="text-chart-2">{error.colno}</span>
										</>
									)}
								</div>
							</div>
						</section>
					)}

					<section className="space-y-3">
						<span className="font-medium text-foreground text-sm">Context</span>
						<div className="rounded border bg-accent/30">
							{contextRows.map((row, index) => (
								<div
									className={`flex items-center justify-between gap-3 px-3 py-2.5 ${index > 0 ? "border-t" : ""}`}
									key={row.key}
								>
									<div className="flex min-w-0 items-center gap-3">
										{row.icon}
										<div className="min-w-0">
											<span className="text-muted-foreground text-xs">
												{row.label}
											</span>
											<p
												className="truncate font-mono text-foreground text-sm"
												title={row.value}
											>
												{row.value}
											</p>
										</div>
									</div>
									{row.copySection && row.copyValue && (
										<CopyButton
											ariaLabel={`Copy ${row.label}`}
											copiedSection={copiedSection}
											onCopy={copyToClipboard}
											section={row.copySection as CopiedSection}
											text={row.copyValue}
										/>
									)}
								</div>
							))}
						</div>
					</section>

					<section className="space-y-3">
						<span className="font-medium text-foreground text-sm">
							Environment
						</span>
						<div className="grid grid-cols-2 gap-3">
							<div className="flex flex-col gap-1.5 rounded border bg-accent/30 p-3">
								<span className="text-muted-foreground text-xs">Browser</span>
								<div className="flex items-center gap-2">
									{error.browser_name ? (
										<>
											<BrowserIcon name={error.browser_name} size="sm" />
											<span className="text-foreground text-sm">
												{error.browser_name}
											</span>
										</>
									) : (
										<span className="text-muted-foreground text-sm">—</span>
									)}
								</div>
							</div>
							<div className="flex flex-col gap-1.5 rounded border bg-accent/30 p-3">
								<span className="text-muted-foreground text-xs">
									Operating System
								</span>
								<div className="flex items-center gap-2">
									{error.os_name ? (
										<>
											<OSIcon name={error.os_name} size="sm" />
											<span className="text-foreground text-sm">
												{error.os_name}
											</span>
										</>
									) : (
										<span className="text-muted-foreground text-sm">—</span>
									)}
								</div>
							</div>
							<div className="flex flex-col gap-1.5 rounded border bg-accent/30 p-3">
								<span className="text-muted-foreground text-xs">Device</span>
								<div className="flex items-center gap-2">
									{error.device_type ? (
										<>
											{getDeviceIcon(error.device_type)}
											<span className="text-foreground text-sm capitalize">
												{error.device_type}
											</span>
										</>
									) : (
										<span className="text-muted-foreground text-sm">—</span>
									)}
								</div>
							</div>
							<div className="flex flex-col gap-1.5 rounded border bg-accent/30 p-3">
								<span className="text-muted-foreground text-xs">Location</span>
								<div className="flex items-center gap-2">
									{locationLabel !== "Unknown" ? (
										<>
											<CountryFlag country={locationCode} size={16} />
											<span className="text-foreground text-sm">
												{locationLabel}
											</span>
										</>
									) : (
										<>
											<GlobeIcon className="size-4 text-muted-foreground" />
											<span className="text-muted-foreground text-sm">
												Unknown
											</span>
										</>
									)}
								</div>
							</div>
						</div>
						<div className="flex items-center justify-between rounded border bg-accent/30 p-3">
							<span className="text-muted-foreground text-xs">
								Severity Level
							</span>
							<SeverityIndicator severity={severity} />
						</div>
					</section>

					{metadataRows.length > 0 && (
						<section className="space-y-3">
							<span className="font-medium text-foreground text-sm">
								Metadata
							</span>
							<div className="rounded border bg-accent/30">
								{metadataRows.map((row, index) => (
									<div
										className={`flex items-start gap-3 px-3 py-2.5 ${index > 0 ? "border-t" : ""}`}
										key={row.key}
									>
										{row.icon}
										<div className="flex-1">
											<span className="text-muted-foreground text-xs">
												{row.label}
											</span>
											<p className="wrap-break-word font-mono text-foreground text-sm">
												{row.value}
											</p>
										</div>
									</div>
								))}
							</div>
						</section>
					)}
				</SheetBody>

				<SheetFooter>
					<Button onClick={onClose} variant="ghost">
						Close
					</Button>
					<Button
						className="gap-2"
						onClick={() => copyToClipboard(fullErrorInfo, "all")}
						variant="outline"
					>
						{copiedSection === "all" ? (
							<CheckIcon className="size-4 text-green-500" weight="bold" />
						) : (
							<CopyIcon className="size-4" />
						)}
						Copy All
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
};
