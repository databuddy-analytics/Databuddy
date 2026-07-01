"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { NoticeBanner } from "@/app/(main)/websites/_components/notice-banner";
import {
	updateWebsiteCache,
	useWebsite,
	type Website,
} from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { Button, Card, Input } from "@databuddy/ui";
import { Switch } from "@databuddy/ui/client";
import { LockIcon, PlusIcon, XMarkIcon as XIcon } from "@databuddy/ui/icons";
import {
	areSecuritySettingsEqual,
	createSecuritySettingsPayload,
	normalizeSecurityTag,
	readSecuritySettings,
} from "./security-settings";

const ipv4Regex =
	/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
const cidrRegex =
	/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
const domainRegex =
	/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

function validateOrigin(value: string): { success: boolean; error?: string } {
	const trimmed = value.trim();
	if (trimmed === "*" || trimmed === "localhost") {
		return { success: true };
	}
	if (trimmed.startsWith("*.")) {
		const domain = trimmed.slice(2);
		if (domain.startsWith("www.")) {
			return {
				success: false,
				error: "Use the apex domain instead of a www-prefixed domain",
			};
		}
		if (domainRegex.test(domain)) {
			return { success: true };
		}
		return {
			success: false,
			error: "Invalid wildcard domain format (e.g., *.cal.com)",
		};
	}
	if (trimmed.startsWith("www.")) {
		return {
			success: false,
			error: "Use the apex domain instead of a www-prefixed domain",
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

function validateIgnoredTrackingOrigin(value: string): {
	success: boolean;
	error?: string;
} {
	const trimmed = value.trim();
	if (trimmed === "*") {
		return {
			success: false,
			error: "Use the warning toggle to hide every tracking warning",
		};
	}
	if (trimmed.startsWith("*.")) {
		if (domainRegex.test(trimmed.slice(2))) {
			return { success: true };
		}
		return {
			success: false,
			error: "Invalid wildcard domain format (e.g., *.preview.example.com)",
		};
	}
	if (domainRegex.test(trimmed)) {
		return { success: true };
	}
	return {
		success: false,
		error: "Must be a valid domain (e.g., staging.example.com)",
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
				<Button
					aria-label={`Remove ${value}`}
					className="h-6 gap-1 rounded-full px-2 text-xs hover:bg-destructive hover:text-destructive-foreground"
					key={value}
					onClick={() => onRemove(value)}
					size="sm"
					type="button"
					variant="secondary"
				>
					{value}
					<XIcon aria-hidden="true" className="size-2.5" />
				</Button>
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
		const value = normalizeSecurityTag(draft);
		if (!value) {
			return;
		}

		if (values.some((item) => normalizeSecurityTag(item) === value)) {
			setError("This value already exists");
			return;
		}

		if (validate) {
			const result = validate(value);
			if (!result.success) {
				setError(result.error ?? "Invalid value");
				return;
			}
		}

		onAdd(value);
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
		<div className="space-y-3">
			<TagList label={label} onRemove={onRemove} values={values} />
			<div className="flex gap-2">
				<Input
					aria-invalid={error ? "true" : "false"}
					aria-label={`New ${label}`}
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
					aria-label={`Add ${label}`}
					className="size-8 p-0"
					disabled={!draft.trim()}
					onClick={handleAdd}
					type="button"
					variant="secondary"
				>
					<PlusIcon aria-hidden="true" className="size-4" />
				</Button>
			</div>
			{error && (
				<p className="text-destructive text-xs" role="alert">
					{error}
				</p>
			)}
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
	const [ignoredTrackingOrigins, setIgnoredTrackingOrigins] = useState<
		string[]
	>([]);
	const [trackingIssueWarningsDisabled, setTrackingIssueWarningsDisabled] =
		useState(false);
	const [settingsHydrated, setSettingsHydrated] = useState(false);
	const savedSettings = useMemo(
		() => readSecuritySettings(websiteData?.settings),
		[websiteData?.settings]
	);
	const draftSettings = useMemo(
		() => ({
			allowedIps,
			allowedOrigins,
			ignoredTrackingOrigins,
			trackingIssueWarningsDisabled,
		}),
		[
			allowedIps,
			allowedOrigins,
			ignoredTrackingOrigins,
			trackingIssueWarningsDisabled,
		]
	);
	const hasChanges =
		settingsHydrated && !areSecuritySettingsEqual(savedSettings, draftSettings);

	const updateMutation = useMutation({
		...orpc.websites.updateSettings.mutationOptions(),
		onSuccess: (updatedWebsite: Website) => {
			updateWebsiteCache(queryClient, updatedWebsite);
		},
	});

	const initializeSettings = useCallback(() => {
		setAllowedOrigins(savedSettings.allowedOrigins);
		setAllowedIps(savedSettings.allowedIps);
		setIgnoredTrackingOrigins(savedSettings.ignoredTrackingOrigins);
		setTrackingIssueWarningsDisabled(
			savedSettings.trackingIssueWarningsDisabled
		);
		setSettingsHydrated(true);
	}, [savedSettings]);

	useEffect(() => {
		if (websiteData) {
			initializeSettings();
		}
	}, [websiteData, initializeSettings]);

	const handleSave = useCallback(() => {
		if (!(websiteData && settingsHydrated)) {
			return;
		}

		if (!hasChanges) {
			toast.info("No changes to save");
			return;
		}

		toast.promise(
			updateMutation.mutateAsync({
				id: websiteId,
				settings: createSecuritySettingsPayload(draftSettings),
			}),
			{
				loading: "Updating security settings...",
				success: "Security settings updated",
				error: "Failed to update security settings",
			}
		);
	}, [
		websiteData,
		settingsHydrated,
		websiteId,
		draftSettings,
		hasChanges,
		updateMutation,
	]);

	const handleOriginAdd = useCallback((value: string) => {
		setAllowedOrigins((prev) => [...prev, value]);
	}, []);

	const handleOriginRemove = useCallback((value: string) => {
		setAllowedOrigins((prev) => prev.filter((v) => v !== value));
	}, []);

	const handleIpAdd = useCallback((value: string) => {
		setAllowedIps((prev) => [...prev, value]);
	}, []);

	const handleIpRemove = useCallback((value: string) => {
		setAllowedIps((prev) => prev.filter((v) => v !== value));
	}, []);

	const handleIgnoredOriginAdd = useCallback((value: string) => {
		setIgnoredTrackingOrigins((prev) => [...prev, value]);
	}, []);

	const handleIgnoredOriginRemove = useCallback((value: string) => {
		setIgnoredTrackingOrigins((prev) => prev.filter((v) => v !== value));
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
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-2xl space-y-6 p-5">
					<Card>
						<Card.Header>
							<Card.Title>Allowed Origins</Card.Title>
							<Card.Description>
								By default, only your registered domain can send analytics. Add
								additional origins for third-party integrations like{" "}
								<code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">
									cal.com
								</code>{" "}
								or wildcards like{" "}
								<code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">
									*.cal.com
								</code>
								. Use{" "}
								<code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">
									*
								</code>{" "}
								to allow all origins.
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<TagInput
								label="origins"
								onAdd={handleOriginAdd}
								onRemove={handleOriginRemove}
								placeholder="cal.com, *.cal.com, or *"
								validate={validateOrigin}
								values={allowedOrigins}
							/>
						</Card.Content>
					</Card>

					<Card>
						<Card.Header>
							<Card.Title>Allowed IP Addresses</Card.Title>
							<Card.Description>
								Restrict tracking to specific IP addresses or CIDR ranges (e.g.,{" "}
								<code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">
									192.168.1.0/24
								</code>
								)
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<TagInput
								label="IP addresses"
								onAdd={handleIpAdd}
								onRemove={handleIpRemove}
								placeholder="192.168.1.1 or 192.168.1.0/24"
								validate={validateIp}
								values={allowedIps}
							/>
						</Card.Content>
					</Card>

					<Card>
						<Card.Header className="flex-row items-start justify-between gap-4">
							<div className="space-y-1.5">
								<Card.Title>Tracking Warnings</Card.Title>
								<Card.Description>
									Hide dashboard warnings for known noisy origins without
									allowing those origins to send analytics.
								</Card.Description>
							</div>
							<Switch
								aria-label="Show tracking warnings"
								checked={!trackingIssueWarningsDisabled}
								disabled={!settingsHydrated}
								onCheckedChange={(checked) =>
									setTrackingIssueWarningsDisabled(!checked)
								}
							/>
						</Card.Header>
						<Card.Content>
							<TagInput
								label="ignored tracking origins"
								onAdd={handleIgnoredOriginAdd}
								onRemove={handleIgnoredOriginRemove}
								placeholder="staging.example.com or *.preview.example.com"
								validate={validateIgnoredTrackingOrigin}
								values={ignoredTrackingOrigins}
							/>
						</Card.Content>
					</Card>

					<NoticeBanner
						description="By default, only your registered domain can send analytics. Add origins here for third-party integrations like Cal.com or embedded widgets."
						icon={<LockIcon />}
					/>
				</div>
			</div>

			{hasChanges && (
				<div className="angled-rectangle-gradient sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t bg-secondary px-5 py-4">
					<p className="text-muted-foreground text-sm">
						You have unsaved changes
					</p>
					<div className="flex items-center gap-2">
						<Button onClick={initializeSettings} size="sm" variant="ghost">
							Discard
						</Button>
						<Button
							keyboard={{
								display: "⌘S",
								trigger: (e) => (e.metaKey || e.ctrlKey) && e.key === "s",
								callback: handleSave,
							}}
							loading={updateMutation.isPending}
							onClick={handleSave}
							size="sm"
						>
							Save Changes
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
