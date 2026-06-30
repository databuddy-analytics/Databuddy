"use client";

import {
	Badge,
	Card,
	Field,
	SettingCard,
	SettingCardGroup,
	Skeleton,
	Text,
} from "@databuddy/ui";
import { Select, Switch, TagsInput } from "@databuddy/ui/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";

type EmailAlertMode = "off" | "critical_only" | "warnings_and_critical";
type TrackingReason =
	| "origin_not_authorized"
	| "origin_missing"
	| "ip_not_authorized";

interface EmailSettings {
	anomalies: {
		customEventEmails: boolean;
		errorEmails: boolean;
		trafficEmails: boolean;
	};
	billing: { usageWarnings: boolean };
	trackingHealth: {
		cooldownMinutes: number;
		ignoredOrigins: string[];
		ignoredReasons: TrackingReason[];
		mode: EmailAlertMode;
	};
	uptime: {
		downEmails: boolean;
		recoveryEmails: boolean;
	};
}

type SettingsSection = Record<string, unknown>;

const TRACKING_MODES: Array<{
	description: string;
	label: string;
	value: EmailAlertMode;
}> = [
	{
		value: "critical_only",
		label: "Critical only",
		description: "Only email when tracking appears to drop to zero.",
	},
	{
		value: "warnings_and_critical",
		label: "Warnings + critical",
		description: "Email for critical drops and blocked-traffic spikes.",
	},
	{
		value: "off",
		label: "Off",
		description: "Do not send tracking-health emails.",
	},
];

function withSection<K extends keyof EmailSettings>(
	settings: EmailSettings,
	section: K,
	patch: Partial<EmailSettings[K]>
): EmailSettings {
	return {
		...settings,
		[section]: {
			...(settings[section] as SettingsSection),
			...patch,
		},
	};
}

function toggleMutedReason<T extends string>(
	values: T[],
	value: T,
	emailsEnabled: boolean
): T[] {
	if (emailsEnabled) {
		return values.filter((item) => item !== value);
	}
	return values.includes(value) ? values : [...values, value];
}

function modeDescription(mode: EmailAlertMode): string {
	return TRACKING_MODES.find((item) => item.value === mode)?.description ?? "";
}

function ToggleSetting({
	checked,
	description,
	disabled,
	onChange,
	title,
}: {
	checked: boolean;
	description: string;
	disabled?: boolean;
	onChange: (checked: boolean) => void;
	title: string;
}) {
	return (
		<SettingCard description={description} title={title}>
			<Switch
				checked={checked}
				disabled={disabled}
				onCheckedChange={(value) => onChange(Boolean(value))}
			/>
		</SettingCard>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<Text className="px-1 pb-2" tone="muted" variant="caption">
			{children}
		</Text>
	);
}

export function EmailPreferencesCard() {
	const queryClient = useQueryClient();
	const { activeOrganizationId } = useOrganizationsContext();
	const settingsQuery =
		orpc.organizations.getEmailNotificationSettings.queryOptions({
			input: { organizationId: activeOrganizationId ?? undefined },
		});

	const { data: settings, isLoading } = useQuery({
		...settingsQuery,
		enabled: !!activeOrganizationId,
	});
	const updateMutation = useMutation({
		...orpc.organizations.updateEmailNotificationSettings.mutationOptions(),
	});

	const disabled = updateMutation.isPending || !activeOrganizationId;

	const save = async (next: EmailSettings) => {
		if (!activeOrganizationId) {
			return;
		}
		try {
			const updated = await updateMutation.mutateAsync({
				organizationId: activeOrganizationId,
				settings: next,
			});
			queryClient.setQueryData(settingsQuery.queryKey, updated);
		} catch {
			toast.error("Failed to update email preferences");
		}
	};

	return (
		<Card>
			<Card.Header>
				<div className="flex items-start justify-between gap-4">
					<div>
						<Card.Title>Email preferences</Card.Title>
						<Card.Description>
							Global defaults for this organization. Security emails are always
							sent.
						</Card.Description>
					</div>
					<Badge variant="muted">Global</Badge>
				</div>
			</Card.Header>
			<Card.Content className="space-y-5">
				{isLoading || !settings ? (
					<div className="space-y-3">
						<Skeleton className="h-16 w-full rounded-xl" />
						<Skeleton className="h-40 w-full rounded-xl" />
						<Skeleton className="h-32 w-full rounded-xl" />
					</div>
				) : (
					<>
						<div>
							<SectionTitle>System</SectionTitle>
							<SettingCardGroup>
								<SettingCard
									description="Login codes, verification, password reset, delete-account confirmation, and invitations."
									title="Required account emails"
								>
									<Badge variant="success">Always on</Badge>
								</SettingCard>
							</SettingCardGroup>
						</div>

						<div>
							<SectionTitle>Tracking health</SectionTitle>
							<SettingCardGroup>
								<SettingCard
									description={modeDescription(settings.trackingHealth.mode)}
									title="Tracking health emails"
								>
									<Select
										disabled={disabled}
										onValueChange={(value) =>
											save(
												withSection(settings, "trackingHealth", {
													mode: String(value) as EmailAlertMode,
												})
											)
										}
										value={settings.trackingHealth.mode}
									>
										<Select.Trigger className="w-44" />
										<Select.Content>
											{TRACKING_MODES.map((mode) => (
												<Select.Item key={mode.value} value={mode.value}>
													{mode.label}
												</Select.Item>
											))}
										</Select.Content>
									</Select>
								</SettingCard>

								<SettingCard
									description="These origins stay blocked; they just stop triggering emails."
									expandable={
										<Field>
											<Field.Label>Muted origins</Field.Label>
											<TagsInput
												disabled={disabled}
												onChange={(ignoredOrigins) =>
													save(
														withSection(settings, "trackingHealth", {
															ignoredOrigins,
														})
													)
												}
												placeholder="example.com or *.example.com"
												values={settings.trackingHealth.ignoredOrigins}
											/>
											<Field.Description>
												Use this for OSS installs, preview domains, or hardcoded
												public client IDs.
											</Field.Description>
										</Field>
									}
									title="Muted origins"
								>
									<Badge variant="muted">
										{settings.trackingHealth.ignoredOrigins.length}
									</Badge>
								</SettingCard>

								<ToggleSetting
									checked={
										!settings.trackingHealth.ignoredReasons.includes(
											"origin_not_authorized"
										)
									}
									description="Origin does not match the website domain or allowed origins."
									disabled={disabled}
									onChange={(checked) =>
										save(
											withSection(settings, "trackingHealth", {
												ignoredReasons: toggleMutedReason(
													settings.trackingHealth.ignoredReasons,
													"origin_not_authorized",
													checked
												),
											})
										)
									}
									title="Domain mismatch emails"
								/>
								<ToggleSetting
									checked={
										!settings.trackingHealth.ignoredReasons.includes(
											"origin_missing"
										)
									}
									description="Browser ingest was called without an Origin header."
									disabled={disabled}
									onChange={(checked) =>
										save(
											withSection(settings, "trackingHealth", {
												ignoredReasons: toggleMutedReason(
													settings.trackingHealth.ignoredReasons,
													"origin_missing",
													checked
												),
											})
										)
									}
									title="Missing origin emails"
								/>
								<ToggleSetting
									checked={
										!settings.trackingHealth.ignoredReasons.includes(
											"ip_not_authorized"
										)
									}
									description="Request failed the website IP allowlist."
									disabled={disabled}
									onChange={(checked) =>
										save(
											withSection(settings, "trackingHealth", {
												ignoredReasons: toggleMutedReason(
													settings.trackingHealth.ignoredReasons,
													"ip_not_authorized",
													checked
												),
											})
										)
									}
									title="IP allowlist emails"
								/>
							</SettingCardGroup>
						</div>

						<div>
							<SectionTitle>Other emails</SectionTitle>
							<SettingCardGroup>
								<ToggleSetting
									checked={settings.billing.usageWarnings}
									description="Email when usage crosses your configured billing threshold."
									disabled={disabled}
									onChange={(usageWarnings) =>
										save(withSection(settings, "billing", { usageWarnings }))
									}
									title="Billing usage warnings"
								/>
								<ToggleSetting
									checked={settings.uptime.downEmails}
									description="Email when a monitor transitions down."
									disabled={disabled}
									onChange={(downEmails) =>
										save(withSection(settings, "uptime", { downEmails }))
									}
									title="Monitor down emails"
								/>
								<ToggleSetting
									checked={settings.uptime.recoveryEmails}
									description="Email when a down monitor recovers."
									disabled={disabled}
									onChange={(recoveryEmails) =>
										save(withSection(settings, "uptime", { recoveryEmails }))
									}
									title="Monitor recovery emails"
								/>
								<ToggleSetting
									checked={settings.anomalies.errorEmails}
									description="Email for error-rate spikes."
									disabled={disabled}
									onChange={(errorEmails) =>
										save(withSection(settings, "anomalies", { errorEmails }))
									}
									title="Error anomaly emails"
								/>
								<ToggleSetting
									checked={settings.anomalies.trafficEmails}
									description="Email for pageview spikes or drops."
									disabled={disabled}
									onChange={(trafficEmails) =>
										save(withSection(settings, "anomalies", { trafficEmails }))
									}
									title="Traffic anomaly emails"
								/>
								<ToggleSetting
									checked={settings.anomalies.customEventEmails}
									description="Email for custom event spikes or drops."
									disabled={disabled}
									onChange={(customEventEmails) =>
										save(
											withSection(settings, "anomalies", { customEventEmails })
										)
									}
									title="Custom event anomaly emails"
								/>
							</SettingCardGroup>
						</div>
					</>
				)}
			</Card.Content>
		</Card>
	);
}
