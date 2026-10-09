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
import type {
	EmailNotificationSettingsOutput,
	EmailNotificationSettingsPatch,
} from "@databuddy/rpc";
import { Select, Switch, TagsInput } from "@databuddy/ui/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showErrorToast } from "@/lib/user-facing-error";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";

type TrackingHealthSettings = EmailNotificationSettingsOutput["trackingHealth"];

const TRACKING_MODES: Array<{
	description: string;
	label: string;
	value: TrackingHealthSettings["mode"];
}> = [
	{
		value: "critical_only",
		label: "Critical only",
		description: "Only email when tracking appears to drop to zero.",
	},
	{
		value: "warnings_and_critical",
		label: "Warnings and critical",
		description: "Email for critical drops and blocked-traffic spikes.",
	},
	{
		value: "off",
		label: "Off",
		description: "Do not send tracking-health emails.",
	},
];

const BLOCK_REASON_EMAILS: Array<{
	description: string;
	reason: TrackingHealthSettings["ignoredReasons"][number];
	title: string;
}> = [
	{
		reason: "origin_not_authorized",
		title: "Domain mismatch emails",
		description: "Origin does not match the website domain or allowed origins.",
	},
	{
		reason: "origin_missing",
		title: "Missing origin emails",
		description:
			"We received browser tracking requests without a website origin, so we could not verify the source domain.",
	},
	{
		reason: "ip_not_authorized",
		title: "IP allowlist emails",
		description: "Request failed the website IP allowlist.",
	},
];

function ToggleSetting({
	checked,
	description,
	disabled,
	onChange,
	title,
}: {
	checked: boolean;
	description: string;
	disabled: boolean;
	onChange: (checked: boolean) => void;
	title: string;
}) {
	return (
		<SettingCard description={description} title={title}>
			<Switch
				checked={checked}
				disabled={disabled}
				onCheckedChange={onChange}
			/>
		</SettingCard>
	);
}

function SettingSection({
	children,
	title,
}: {
	children: React.ReactNode;
	title: string;
}) {
	return (
		<div>
			<Text className="px-1 pb-2" tone="muted" variant="caption">
				{title}
			</Text>
			<SettingCardGroup>{children}</SettingCardGroup>
		</div>
	);
}

export function EmailPreferencesCard() {
	const queryClient = useQueryClient();
	const { activeOrganization, activeOrganizationId, isSwitchingOrganization } =
		useOrganizationsContext();
	const settingsQueryOptions =
		orpc.organizations.getEmailNotificationSettings.queryOptions({
			input: { organizationId: activeOrganizationId ?? undefined },
		});
	const { data: settings } = useQuery({
		...settingsQueryOptions,
		enabled: !!activeOrganizationId,
	});
	const updateMutation = useMutation({
		...orpc.organizations.updateEmailNotificationSettings.mutationOptions(),
		meta: { suppressGlobalErrorToast: true },
	});
	const isSaving = updateMutation.isPending;

	const save = async (patch: EmailNotificationSettingsPatch) => {
		if (!activeOrganizationId) {
			return;
		}
		try {
			const updated = await updateMutation.mutateAsync({
				organizationId: activeOrganizationId,
				settings: patch,
			});
			queryClient.setQueryData(settingsQueryOptions.queryKey, updated);
		} catch (error) {
			showErrorToast(error, "Failed to update email preferences");
		}
	};

	return (
		<Card>
			<Card.Header>
				<div className="flex items-start justify-between gap-4">
					<div>
						<Card.Title>Email preferences</Card.Title>
						<Card.Description>
							Global defaults for{" "}
							{activeOrganization?.name ?? "this organization"}. Security emails
							are always sent.
						</Card.Description>
					</div>
					<Badge variant="muted">Global</Badge>
				</div>
			</Card.Header>
			<Card.Content className="space-y-5">
				{isSwitchingOrganization || !settings ? (
					<div className="space-y-3">
						<Skeleton className="h-16 w-full rounded-xl" />
						<Skeleton className="h-40 w-full rounded-xl" />
						<Skeleton className="h-32 w-full rounded-xl" />
					</div>
				) : (
					<>
						<SettingSection title="System">
							<SettingCard
								description="Sign-in codes, verification, password reset, delete-account confirmation, and invitations."
								title="Required account emails"
							>
								<Badge variant="success">Always on</Badge>
							</SettingCard>
						</SettingSection>

						<SettingSection title="Tracking health">
							<SettingCard
								description={
									TRACKING_MODES.find(
										(mode) => mode.value === settings.trackingHealth.mode
									)?.description
								}
								title="Tracking health emails"
							>
								<Select
									disabled={isSaving}
									onValueChange={(value) =>
										save({
											trackingHealth: {
												mode: TRACKING_MODES.find(
													(mode) => mode.value === value
												)?.value,
											},
										})
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
											disabled={isSaving}
											onChange={(ignoredOrigins) =>
												save({ trackingHealth: { ignoredOrigins } })
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

							{BLOCK_REASON_EMAILS.map(({ description, reason, title }) => (
								<ToggleSetting
									checked={
										!settings.trackingHealth.ignoredReasons.includes(reason)
									}
									description={description}
									disabled={isSaving}
									key={reason}
									onChange={(isEnabled) =>
										save({
											trackingHealth: {
												ignoredReasons: isEnabled
													? settings.trackingHealth.ignoredReasons.filter(
															(ignored) => ignored !== reason
														)
													: [...settings.trackingHealth.ignoredReasons, reason],
											},
										})
									}
									title={title}
								/>
							))}
						</SettingSection>

						<SettingSection title="Other emails">
							<ToggleSetting
								checked={settings.aiAgents.weeklyDigest}
								description="Every Monday: which AI products read your sites, what they read, and who they sent to you."
								disabled={isSaving}
								onChange={(weeklyDigest) =>
									save({ aiAgents: { weeklyDigest } })
								}
								title="Weekly AI digest"
							/>
							<ToggleSetting
								checked={settings.billing.usageWarnings}
								description="Email when usage crosses your configured billing threshold."
								disabled={isSaving}
								onChange={(usageWarnings) =>
									save({ billing: { usageWarnings } })
								}
								title="Billing usage warnings"
							/>
							<ToggleSetting
								checked={settings.uptime.downEmails}
								description="Email when a monitor transitions down."
								disabled={isSaving}
								onChange={(downEmails) => save({ uptime: { downEmails } })}
								title="Monitor down emails"
							/>
							<ToggleSetting
								checked={settings.uptime.recoveryEmails}
								description="Email when a down monitor recovers."
								disabled={isSaving}
								onChange={(recoveryEmails) =>
									save({ uptime: { recoveryEmails } })
								}
								title="Monitor recovery emails"
							/>
						</SettingSection>
					</>
				)}
			</Card.Content>
		</Card>
	);
}
