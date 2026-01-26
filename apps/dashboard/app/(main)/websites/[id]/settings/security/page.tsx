"use client";

import { LockIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	updateWebsiteCache,
	useWebsite,
	type Website,
} from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { NoticeBanner } from "../../../_components/notice-banner";

const ipv4Regex =
	/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
const cidrRegex =
	/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
const domainRegex =
	/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

function validateOrigin(value: string): { success: boolean; error?: string } {
	const trimmed = value.trim();

	if (trimmed === "*") {
		return { success: true };
	}

	if (trimmed === "localhost") {
		return { success: true };
	}

	if (trimmed.startsWith("*.")) {
		const domain = trimmed.slice(2);
		if (domainRegex.test(domain)) {
			return { success: true };
		}
		return {
			success: false,
			error: "Invalid wildcard domain format (e.g., *.cal.com)",
		};
	}

	if (domainRegex.test(trimmed)) {
		return { success: true };
	}

	return {
		success: false,
		error: "Must be a valid domain (e.g., cal.com, *.cal.com) or *",
	};
}

function validateIp(value: string): { success: boolean; error?: string } {
	const trimmed = value.trim();

	if (
		ipv4Regex.test(trimmed) ||
		ipv6Regex.test(trimmed) ||
		cidrRegex.test(trimmed)
	) {
		return { success: true };
	}
	return {
		success: false,
		error:
			"Must be a valid IPv4, IPv6, or CIDR notation (e.g., 192.168.1.0/24)",
	};
}

function TagList({
	values,
	onRemove,
	label,
}: {
	values: string[];
	onRemove: (value: string) => void;
	label: string;
}) {
	if (values.length === 0) {
		return (
			<div className="rounded border border-dashed p-4 text-center">
				<p className="text-muted-foreground text-sm">
					No {label.toLowerCase()} configured
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-wrap gap-2">
			{values.map((value) => (
				<Badge
					className="cursor-pointer gap-1 px-2 py-0.5 text-xs hover:bg-destructive hover:text-destructive-foreground"
					key={value}
					onClick={() => onRemove(value)}
					variant="secondary"
				>
					{value}
					<XIcon className="size-2.5" />
				</Badge>
			))}
		</div>
	);
}

function TagInput({
	values,
	onAdd,
	onRemove,
	placeholder,
	validate,
	label,
}: {
	values: string[];
	onAdd: (value: string) => void;
	onRemove: (value: string) => void;
	placeholder: string;
	validate?: (value: string) => { success: boolean; error?: string };
	label: string;
}) {
	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | null>(null);

	const handleAdd = () => {
		const trimmed = draft.trim();
		if (!trimmed) {
			return;
		}

		if (values.includes(trimmed)) {
			setError("This value already exists");
			return;
		}

		if (validate) {
			const result = validate(trimmed);
			if (!result.success) {
				setError(result.error ?? "Invalid value");
				return;
			}
		}

		onAdd(trimmed);
		setDraft("");
		setError(null);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleAdd();
		}
	};

	return (
		<div className="space-y-2">
			<TagList label={label} onRemove={onRemove} values={values} />
			<div className="flex gap-2">
				<Input
					aria-invalid={error ? "true" : "false"}
					className="h-8 text-sm"
					onChange={(e) => {
						setDraft(e.target.value);
						if (error) {
							setError(null);
						}
					}}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					value={draft}
				/>
				<Button
					className="h-8 w-8 p-0"
					disabled={!draft.trim()}
					onClick={handleAdd}
					size="sm"
					type="button"
					variant="outline"
				>
					<PlusIcon className="size-4" />
				</Button>
			</div>
			{error && <p className="text-destructive text-xs">{error}</p>}
		</div>
	);
}

export default function SecurityPage() {
	const params = useParams();
	const websiteId = params.id as string;
	const { data: websiteData } = useWebsite(websiteId);
	const queryClient = useQueryClient();

	const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
	const [allowedIps, setAllowedIps] = useState<string[]>([]);
	const [hasChanges, setHasChanges] = useState(false);

	const updateMutation = useMutation({
		...orpc.websites.updateSettings.mutationOptions(),
		onSuccess: (updatedWebsite: Website) => {
			updateWebsiteCache(queryClient, updatedWebsite);
			setHasChanges(false);
		},
	});

	const initializeSettings = useCallback(() => {
		const website = websiteData as Website & { settings?: unknown };
		if (website?.settings) {
			const settings = website.settings as {
				allowedOrigins?: string[];
				allowedIps?: string[];
			};
			setAllowedOrigins(settings.allowedOrigins ?? []);
			setAllowedIps(settings.allowedIps ?? []);
		} else {
			setAllowedOrigins([]);
			setAllowedIps([]);
		}
		setHasChanges(false);
	}, [websiteData]);

	useEffect(() => {
		if (websiteData) {
			initializeSettings();
		}
	}, [websiteData, initializeSettings]);

	const handleSave = useCallback(() => {
		if (!websiteData) {
			return;
		}

		const website = websiteData as Website & { settings?: unknown };
		const currentSettings =
			(website?.settings as {
				allowedOrigins?: string[];
				allowedIps?: string[];
			}) ?? {};

		const newSettings = {
			allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : undefined,
			allowedIps: allowedIps.length > 0 ? allowedIps : undefined,
		};

		const originsChanged =
			JSON.stringify(currentSettings.allowedOrigins ?? []) !==
			JSON.stringify(allowedOrigins);
		const ipsChanged =
			JSON.stringify(currentSettings.allowedIps ?? []) !==
			JSON.stringify(allowedIps);

		if (originsChanged || ipsChanged) {
			toast.promise(
				updateMutation.mutateAsync({
					id: websiteId,
					settings: newSettings,
				}),
				{
					loading: "Updating security settings...",
					success: "Security settings updated successfully",
					error: "Failed to update security settings",
				}
			);
		} else {
			toast.info("No changes to save");
		}
	}, [websiteData, websiteId, allowedOrigins, allowedIps, updateMutation]);

	const handleOriginAdd = useCallback((value: string) => {
		setAllowedOrigins((prev) => [...prev, value]);
		setHasChanges(true);
	}, []);

	const handleOriginRemove = useCallback((value: string) => {
		setAllowedOrigins((prev) => prev.filter((v) => v !== value));
		setHasChanges(true);
	}, []);

	const handleIpAdd = useCallback((value: string) => {
		setAllowedIps((prev) => [...prev, value]);
		setHasChanges(true);
	}, []);

	const handleIpRemove = useCallback((value: string) => {
		setAllowedIps((prev) => prev.filter((v) => v !== value));
		setHasChanges(true);
	}, []);

	if (!websiteData) {
		return (
			<div className="flex h-64 items-center justify-center">
				<div className="size-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<PageHeader
				description="Control which origins and IP addresses can access your website's analytics"
				icon={<LockIcon />}
				title="Security & Access"
			/>
			<div className="flex min-h-0 flex-1 flex-col">
				{/* Allowed Origins */}
				<section className="border-b px-4 py-5 sm:px-6">
					<div className="space-y-3">
						<div>
							<Label className="font-medium text-sm">Allowed Origins</Label>
							<p className="mt-1 text-muted-foreground text-xs">
								By default, only your registered domain can send analytics. Add
								additional origins for third-party integrations like
								<code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
									cal.com
								</code>
								or wildcards like
								<code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
									*.cal.com
								</code>
								. Use
								<code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
									*
								</code>
								to allow all origins.
							</p>
						</div>
						<TagInput
							label="origins"
							onAdd={handleOriginAdd}
							onRemove={handleOriginRemove}
							placeholder="cal.com, *.cal.com, or *"
							validate={validateOrigin}
							values={allowedOrigins}
						/>
					</div>
				</section>

				{/* Allowed IPs */}
				<section className="border-b px-4 py-5 sm:px-6">
					<div className="space-y-3">
						<div>
							<Label className="font-medium text-sm">
								Allowed IP Addresses
							</Label>
							<p className="mt-1 text-muted-foreground text-xs">
								Restrict analytics data collection to specific IP addresses or
								CIDR ranges (e.g.,
								<code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
									192.168.1.0/24
								</code>
								)
							</p>
						</div>
						<TagInput
							label="IP addresses"
							onAdd={handleIpAdd}
							onRemove={handleIpRemove}
							placeholder="192.168.1.1 or 192.168.1.0/24"
							validate={validateIp}
							values={allowedIps}
						/>
					</div>
				</section>

				{/* Info Banner */}
				<section className="px-4 py-5 sm:px-6">
					<NoticeBanner
						description="By default, only your registered domain can send analytics. Add origins here for third-party integrations like Cal.com or embedded widgets."
						icon={<LockIcon />}
					/>
				</section>

				{/* Save Button */}
				{hasChanges && (
					<div className="border-t bg-background px-4 py-4 sm:px-6">
						<div className="flex items-center justify-end gap-3">
							<Button
								onClick={initializeSettings}
								size="sm"
								variant="secondary"
							>
								Cancel
							</Button>
							<Button
								disabled={updateMutation.isPending}
								onClick={handleSave}
								size="sm"
							>
								{updateMutation.isPending ? "Saving…" : "Save Changes"}
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
