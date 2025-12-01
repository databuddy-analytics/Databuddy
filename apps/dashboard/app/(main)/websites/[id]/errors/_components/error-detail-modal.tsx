"use client";

import { BugIcon, CopyIcon, GlobeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { CountryFlag } from "@/components/icon";
import { BrowserIcon, OSIcon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import type { RecentError } from "./types";
import {
	formatDateTimeSeconds,
	getErrorCategory,
	getSeverityColor,
} from "./utils";

interface InfoProps {
	label: string;
	value: string;
}

const InfoRow: React.FC<InfoProps> = ({ label, value }) => (
	<div className="space-y-2">
		<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
			{label}
		</span>
		<div className="flex items-center justify-between gap-2 rounded border bg-muted/20 p-3">
			<span className="break-all font-mono text-sm">{value}</span>
		</div>
	</div>
);

interface IconProps {
	label: string;
	value?: string;
	icon?: React.ReactNode;
}

const IconRow: React.FC<IconProps> = ({ label, value, icon }) => (
	<div className="space-y-2">
		<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
			{label}
		</span>
		<div className="flex items-center gap-2 rounded border bg-muted/20 p-3">
			{value ? (
				<>
					{icon}
					<span className="text-sm">{value}</span>
				</>
			) : (
				<span className="text-muted-foreground text-sm">—</span>
			)}
		</div>
	</div>
);

interface ErrorDetailModalProps {
	error: RecentError;
	isOpen: boolean;
	onClose: () => void;
}

export const ErrorDetailModal = ({
	error,
	isOpen,
	onClose,
}: ErrorDetailModalProps) => {
	const [copiedSection, setCopiedSection] = useState<string | null>(null);

	if (!error) {
		return null;
	}

	const copyToClipboard = async (text: string, section: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedSection(section);
			toast.success(`${section} copied to clipboard`);
			setTimeout(() => setCopiedSection(null), 2000);
		} catch (err) {
			toast.error("Failed to copy to clipboard", {
				description: err instanceof Error ? err.message : "Unknown error",
			});
		}
	};

	const { type, severity } = getErrorCategory(error.message);

	return (
		<Sheet onOpenChange={onClose} open={isOpen}>
			<SheetContent className="w-full max-w-2xl p-4 sm:max-w-3xl">
				<SheetHeader className="pb-4">
					<SheetTitle className="flex items-center gap-2">
						<BugIcon className="h-5 w-5 text-destructive" weight="duotone" />
						Error Details
					</SheetTitle>
				</SheetHeader>

				<ScrollArea className="h-[calc(100vh-120px)]">
					<div className="space-y-6 pr-4">
						{/* Error Overview */}
						<div className="space-y-4">
							<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex items-center gap-2">
									<Badge className={getSeverityColor(severity)}>{type}</Badge>
									<span className="text-muted-foreground text-sm">
										{formatDateTimeSeconds(error.timestamp)}
									</span>
								</div>
							</div>

							<div className="rounded border bg-muted/20 p-4">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<h3 className="mb-2 font-semibold text-base">
											Error Message
										</h3>
										<p className="break-words text-sm leading-relaxed">
											{error.message}
										</p>
									</div>
									<Button
										className="shrink-0"
										onClick={() =>
											copyToClipboard(error.message, "Error message")
										}
										size="sm"
										variant="ghost"
									>
										<CopyIcon
											className={`h-4 w-4 ${
												copiedSection === "Error message"
													? "text-green-600"
													: ""
											}`}
										/>
									</Button>
								</div>
							</div>
						</div>

						{/* Stack Trace */}
						{error.stack && (
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<h3 className="font-semibold text-base">Stack Trace</h3>
									<Button
										onClick={() =>
											copyToClipboard(error.stack || "", "Stack trace")
										}
										size="sm"
										variant="ghost"
									>
										<CopyIcon
											className={`h-4 w-4 ${
												copiedSection === "Stack trace" ? "text-green-600" : ""
											}`}
										/>
									</Button>
								</div>
								<div className="rounded border bg-muted/20 p-4">
									<pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
										{error.stack}
									</pre>
								</div>
							</div>
						)}

						<Separator />

						{/* Context Information */}
						<div className="space-y-4">
							<h3 className="font-semibold text-base">Context Information</h3>
							<div className="grid grid-cols-1 gap-4">
								<InfoRow label="Page URL" value={error.path} />
								<InfoRow
									label="Session ID"
									value={error.session_id || "Unknown"}
								/>
								<InfoRow label="User ID" value={error.anonymous_id} />
								<div className="space-y-2">
									<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										Timestamp
									</span>
									<div className="rounded border bg-muted/20 p-3">
										<span className="font-mono text-sm">
											{formatDateTimeSeconds(error.timestamp)}
										</span>
									</div>
								</div>
							</div>
						</div>

						<Separator />

						{/* Environment Information */}
						<div className="space-y-4">
							<h3 className="font-semibold text-base">
								Environment Information
							</h3>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<IconRow
									icon={
										error.browser_name ? (
											<BrowserIcon name={error.browser_name} size="sm" />
										) : undefined
									}
									label="Browser"
									value={error.browser_name}
								/>
								<IconRow
									icon={
										error.os_name ? (
											<OSIcon name={error.os_name} size="sm" />
										) : undefined
									}
									label="Operating System"
									value={error.os_name}
								/>
								<IconRow label="Device Type" value={error.device_type} />
								<div className="space-y-2">
									<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										Location
									</span>
									<div className="flex items-center gap-2 rounded border bg-muted/20 p-3">
										{error.country_code || error.country ? (
											<>
												<CountryFlag
													country={error.country_code || error.country || ""}
													size={16}
												/>
												<span className="text-sm">
													{error.country_name || error.country}
												</span>
											</>
										) : (
											<>
												<GlobeIcon className="h-4 w-4 text-muted-foreground" />
												<span className="text-muted-foreground text-sm">
													Unknown
												</span>
											</>
										)}
									</div>
								</div>
							</div>
						</div>

						{/* Actions */}
						<div className="flex justify-end gap-2 pt-4">
							<Button
								onClick={() => {
									const fullErrorInfo = `
Error Message: ${error.message}

Stack Trace:
${error.stack || "No stack trace available"}

Context:
- Page URL: ${error.path}
- Session ID: ${error.session_id}
- User ID: ${error.anonymous_id}
- Timestamp: ${formatDateTimeSeconds(error.timestamp)}
- Browser: ${error.browser_name}
- OS: ${error.os_name}
- Device: ${error.device_type || "—"}
- Location: ${error.country}
									`.trim();
									copyToClipboard(fullErrorInfo, "Full error details");
								}}
								variant="outline"
							>
								<CopyIcon className="mr-2 h-4 w-4" />
								Copy All Details
							</Button>
						</div>
					</div>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
};
