"use client";

import { BugIcon } from "@phosphor-icons/react/dist/ssr";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { CopyIcon } from "@phosphor-icons/react/dist/ssr";
import { StackIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { toast } from "sonner";
import { BrowserIcon, CountryFlag, OSIcon } from "@/components/icon";
import { Accordion } from "@/components/ds/accordion";
import { Badge } from "@/components/ds/badge";
import { Button } from "@/components/ds/button";
import { Sheet } from "@/components/ds/sheet";
import { cn } from "@/lib/utils";
import { formatDateTime, fromNow } from "@/lib/time";
import { getDeviceIcon } from "./error-icons";
import type { RecentError } from "./types";
import { getErrorCategory, getSeverityColor } from "./utils";

interface ErrorDetailModalProps {
	error: RecentError;
	isOpen: boolean;
	onClose: () => void;
}

type CopiedField =
	| "message"
	| "stack"
	| "url"
	| "session"
	| "user"
	| "all"
	| null;

function CopyButton({
	text,
	field,
	copiedField,
	onCopy,
	ariaLabel,
}: {
	ariaLabel?: string;
	copiedField: CopiedField;
	field: CopiedField;
	onCopy: (text: string, field: CopiedField) => void;
	text: string;
}) {
	return (
		<button
			aria-label={ariaLabel || `Copy ${field}`}
			className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground"
			onClick={() => onCopy(text, field)}
			type="button"
		>
			{copiedField === field ? (
				<CheckIcon className="size-3 text-green-500" weight="bold" />
			) : (
				<CopyIcon className="size-3" />
			)}
		</button>
	);
}

interface DetailRowProps {
	copiedField: CopiedField;
	copyField?: CopiedField;
	icon?: React.ReactNode;
	label: string;
	onCopy: (text: string, field: CopiedField) => void;
	value: string;
}

function DetailRow({
	label,
	value,
	icon,
	copyField,
	copiedField,
	onCopy,
}: DetailRowProps) {
	return (
		<div className="flex items-center justify-between gap-3 px-3 py-2">
			<span className="shrink-0 text-muted-foreground text-xs">{label}</span>
			<div className="flex min-w-0 items-center gap-1.5">
				{icon}
				<span
					className="truncate font-mono text-foreground text-xs"
					title={value}
				>
					{value}
				</span>
				{copyField && (
					<CopyButton
						ariaLabel={`Copy ${label}`}
						copiedField={copiedField}
						field={copyField}
						onCopy={onCopy}
						text={value}
					/>
				)}
			</div>
		</div>
	);
}

export const ErrorDetailModal = ({
	error,
	isOpen,
	onClose,
}: ErrorDetailModalProps) => {
	const [copiedField, setCopiedField] = useState<CopiedField>(null);

	if (!error) {
		return null;
	}

	const copyToClipboard = async (text: string, field: CopiedField) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedField(field);
			toast.success("Copied to clipboard");
			setTimeout(() => setCopiedField(null), 2000);
		} catch (err) {
			toast.error("Failed to copy", {
				description: err instanceof Error ? err.message : "Unknown error",
			});
		}
	};

	const { type, severity } = getErrorCategory(error.message);
	const locationLabel = error.country_name || error.country || "";
	const locationCode = error.country_code || error.country || "";

	const fullErrorInfo = [
		`Error: ${error.message}`,
		error.stack ? `\nStack Trace:\n${error.stack}` : "",
		"\nContext:",
		`  URL: ${error.path}`,
		`  Session: ${error.session_id || "Unknown"}`,
		`  User: ${error.anonymous_id}`,
		`  Time: ${formatDateTime(error.timestamp)}`,
		`  Browser: ${error.browser_name || "Unknown"}`,
		`  OS: ${error.os_name || "Unknown"}`,
		`  Device: ${error.device_type || "Unknown"}`,
		`  Location: ${locationLabel || "Unknown"}`,
	].join("\n");

	const detailRows: Array<{
		key: string;
		label: string;
		value: string;
		copyField?: CopiedField;
		icon?: React.ReactNode;
	}> = [
		error.path
			? {
					key: "url",
					label: "Page",
					value: error.path,
					copyField: "url" as CopiedField,
				}
			: null,
		error.browser_name
			? {
					key: "browser",
					label: "Browser",
					value: error.browser_version
						? `${error.browser_name} ${error.browser_version}`
						: error.browser_name,
					icon: <BrowserIcon name={error.browser_name} size="sm" />,
				}
			: null,
		error.os_name
			? {
					key: "os",
					label: "OS",
					value: error.os_version
						? `${error.os_name} ${error.os_version}`
						: error.os_name,
					icon: <OSIcon name={error.os_name} size="sm" />,
				}
			: null,
		error.device_type
			? {
					key: "device",
					label: "Device",
					value: error.device_type,
					icon: getDeviceIcon(error.device_type),
				}
			: null,
		locationLabel
			? {
					key: "location",
					label: "Location",
					value: locationLabel,
					icon: <CountryFlag country={locationCode} size={16} />,
				}
			: null,
		error.session_id
			? {
					key: "session",
					label: "Session",
					value: error.session_id,
					copyField: "session" as CopiedField,
				}
			: null,
		error.anonymous_id
			? {
					key: "user",
					label: "User",
					value: error.anonymous_id,
					copyField: "user" as CopiedField,
				}
			: null,
	].filter((row): row is NonNullable<typeof row> => row !== null);

	const technicalRows = [
		error.event_id
			? { key: "event", label: "Event ID", value: error.event_id }
			: null,
		error.client_id
			? { key: "client", label: "Client ID", value: error.client_id }
			: null,
		error.ip ? { key: "ip", label: "IP Address", value: error.ip } : null,
		error.user_agent
			? { key: "agent", label: "User Agent", value: error.user_agent }
			: null,
	].filter((row): row is NonNullable<typeof row> => row !== null);

	return (
		<Sheet onOpenChange={onClose} open={isOpen}>
			<Sheet.Content className="sm:max-w-xl" side="right">
				<Sheet.Header>
					<div className="flex items-start gap-4">
						<div className="flex size-11 items-center justify-center rounded border bg-background">
							<BugIcon
								className="size-[22px] text-accent-foreground"
								weight="fill"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<Sheet.Title className="text-lg">{type}</Sheet.Title>
								<Badge className={getSeverityColor(severity)} size="sm">
									{severity}
								</Badge>
							</div>
							<Sheet.Description className="text-xs">
								{fromNow(error.timestamp)} · {formatDateTime(error.timestamp)}
							</Sheet.Description>
						</div>
					</div>
				</Sheet.Header>

				<Sheet.Close />

				<Sheet.Body className="space-y-3">
					<div className="overflow-hidden rounded-md border">
						<div className="relative bg-accent/30 p-3">
							<p className="wrap-break-word pr-8 font-mono text-foreground text-sm leading-relaxed">
								{error.message}
							</p>
							<div className="absolute top-2.5 right-2.5">
								<CopyButton
									ariaLabel="Copy error message"
									copiedField={copiedField}
									field="message"
									onCopy={copyToClipboard}
									text={error.message}
								/>
							</div>
						</div>
						{(error.filename || error.lineno) && (
							<div className="flex items-center gap-1 border-t px-3 py-2 font-mono text-xs">
								<span className="truncate text-muted-foreground">
									{error.filename || "unknown"}
								</span>
								{error.lineno && (
									<>
										<span className="text-border">:</span>
										<span className="text-primary">{error.lineno}</span>
									</>
								)}
								{error.colno && (
									<>
										<span className="text-border">:</span>
										<span className="text-chart-2">{error.colno}</span>
									</>
								)}
							</div>
						)}
					</div>

					{error.stack && (
						<div className="overflow-hidden rounded-md border border-border/60">
							<Accordion>
								<Accordion.Trigger>
									<StackIcon
										className="size-4 shrink-0 text-muted-foreground"
										weight="duotone"
									/>
									<span className="font-medium text-foreground">
										Stack Trace
									</span>
								</Accordion.Trigger>
								<Accordion.Content>
									<div className="relative p-3">
										<pre className="wrap-break-word max-h-56 overflow-auto whitespace-pre-wrap font-mono text-foreground text-xs leading-relaxed">
											{error.stack}
										</pre>
										<div className="absolute top-3 right-3">
											<CopyButton
												ariaLabel="Copy stack trace"
												copiedField={copiedField}
												field="stack"
												onCopy={copyToClipboard}
												text={error.stack}
											/>
										</div>
									</div>
								</Accordion.Content>
							</Accordion>
						</div>
					)}

					{detailRows.length > 0 && (
						<div className="overflow-hidden rounded-md border">
							{detailRows.map((row, i) => (
								<div className={cn(i > 0 && "border-t")} key={row.key}>
									<DetailRow
										copiedField={copiedField}
										copyField={row.copyField}
										icon={row.icon}
										label={row.label}
										onCopy={copyToClipboard}
										value={row.value}
									/>
								</div>
							))}
						</div>
					)}

					{technicalRows.length > 0 && (
						<div className="overflow-hidden rounded-md border border-border/60">
							<Accordion>
								<Accordion.Trigger>
									<span className="font-medium text-foreground">
										Technical Details
									</span>
									<Badge className="ml-auto" size="sm" variant="muted">
										{technicalRows.length}
									</Badge>
								</Accordion.Trigger>
								<Accordion.Content>
									{technicalRows.map((row, i) => (
										<div
											className={cn(
												"flex items-start gap-3 px-3 py-2",
												i > 0 && "border-t"
											)}
											key={row.key}
										>
											<span className="shrink-0 text-muted-foreground text-xs">
												{row.label}
											</span>
											<p className="wrap-break-word min-w-0 flex-1 text-right font-mono text-foreground text-xs">
												{row.value}
											</p>
										</div>
									))}
								</Accordion.Content>
							</Accordion>
						</div>
					)}
				</Sheet.Body>

				<Sheet.Footer>
					<Button onClick={onClose} variant="secondary">
						Close
					</Button>
					<Button
						onClick={() => copyToClipboard(fullErrorInfo, "all")}
						variant="secondary"
					>
						{copiedField === "all" ? (
							<CheckIcon className="size-4 text-green-500" weight="bold" />
						) : (
							<CopyIcon className="size-4" />
						)}
						Copy All
					</Button>
				</Sheet.Footer>
			</Sheet.Content>
		</Sheet>
	);
};
