"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ApiKeyListItem } from "./api-key-types";
import { formatMaskedApiKey } from "./api-key-types";
import {
	CheckCircleIcon,
	ClockIcon,
	CodeIcon,
	GlobeIcon,
	KeyIcon,
	LockSimpleIcon,
	PlugIcon,
	RobotIcon,
	ShieldCheckIcon,
	TriangleWarningIcon,
} from "@databuddy/ui/icons";
import {
	Accordion,
	Checkbox,
	CopyButton,
	SegmentedControl,
	Sheet,
} from "@databuddy/ui/client";
import { Badge, Button, Field, Input, Text, dayjs } from "@databuddy/ui";
import { orpc } from "@/lib/orpc";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";
import {
	createMcpConfig,
	MCP_ENV_VAR,
	MCP_ENV_VAR_REFERENCES,
	MCP_SERVER_URL,
	type McpClient,
} from "./mcp-config";
import {
	getMcpScopeGrant,
	getMcpScopeSummary,
	getMcpScopes,
	MCP_ACTION_OPTIONS,
	type McpAction,
} from "./mcp-capabilities";

type McpExpiry = "90d" | "never";

const CLIENT_OPTIONS: Array<{
	description: string;
	keyHint?: string;
	label: string;
	value: McpClient;
}> = [
	{
		value: "cursor",
		label: "Cursor",
		description: "Add it to .cursor/mcp.json or Cursor settings.",
	},
	{
		value: "claude",
		label: "Claude",
		description:
			"Claude signs in with your Databuddy account. A key is only needed for automation.",
		keyHint:
			"Add it to Claude Code's .mcp.json. Claude on the web, desktop, and mobile connects by signing in instead, with no key.",
	},
	{
		value: "windsurf",
		label: "Windsurf",
		description: "Paste it into Windsurf's MCP configuration.",
	},
	{
		value: "other",
		label: "Other",
		description: "Use any client that supports remote HTTP MCP servers.",
	},
];

const CLIENT_LABELS: Record<McpClient, string> = {
	cursor: "Cursor",
	claude: "Claude",
	windsurf: "Windsurf",
	other: "Other client",
};

const CLAUDE_CODE_COMMAND = `claude mcp add --transport http databuddy ${MCP_SERVER_URL}`;

function ClaudeSignIn() {
	return (
		<div className="space-y-3 rounded border border-success/30 bg-success/5 p-3">
			<div className="flex items-start gap-2">
				<ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
				<div className="min-w-0">
					<Text variant="label">
						Connect Claude with your Databuddy account
					</Text>
					<Text className="mt-0.5" tone="muted" variant="caption">
						Choose the organization, websites, and permissions when you sign in.
						Disconnect it from Account settings at any time.
					</Text>
				</div>
			</div>
			<div className="space-y-1">
				<Text tone="muted" variant="caption">
					Claude: Customize → Connectors → Add custom connector
				</Text>
				<div className="flex items-center gap-2 rounded border border-border/60 bg-card px-3 py-2">
					<code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
						{MCP_SERVER_URL}
					</code>
					<CopyButton aria-label="Copy MCP server URL" value={MCP_SERVER_URL} />
				</div>
			</div>
			<div className="space-y-1">
				<Text tone="muted" variant="caption">
					Claude Code: run this, then sign in from /mcp
				</Text>
				<div className="flex items-center gap-2 rounded border border-border/60 bg-card px-3 py-2">
					<code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
						{CLAUDE_CODE_COMMAND}
					</code>
					<CopyButton
						aria-label="Copy Claude Code command"
						value={CLAUDE_CODE_COMMAND}
					/>
				</div>
			</div>
			<Text tone="muted" variant="caption">
				Signed-in connections use the access you approve during sign-in.
				Disconnect and reconnect to change it. The settings below configure an
				API key for scripts or CI.
			</Text>
		</div>
	);
}

function defaultConnectionName(client: McpClient) {
	return `${CLIENT_LABELS[client]} MCP`;
}

function scopeSummary(key: ApiKeyListItem) {
	const websiteCount = Object.keys(key.resources ?? {}).filter((key) =>
		key.startsWith("website:")
	).length;
	const grantedScopes = [
		...(key.scopes ?? []),
		...Object.values(key.resources ?? {}).flat(),
	];
	const capabilitySummary = getMcpScopeSummary(grantedScopes);

	if (websiteCount > 0) {
		return `${websiteCount} website${websiteCount === 1 ? "" : "s"} · ${capabilitySummary}`;
	}

	return capabilitySummary;
}

function keyStatus(key: ApiKeyListItem) {
	if (key.revokedAt) {
		return { label: "Revoked", variant: "destructive" as const };
	}
	if (key.expiresAt && dayjs(key.expiresAt).isBefore(dayjs())) {
		return { label: "Expired", variant: "warning" as const };
	}
	if (!key.enabled) {
		return { label: "Disabled", variant: "muted" as const };
	}
	return { label: "Active", variant: "success" as const };
}

export function McpConnectionDetails({
	keys,
	onManage,
}: {
	keys: ApiKeyListItem[];
	onManage: (key: ApiKeyListItem) => void;
}) {
	if (keys.length === 0) {
		return (
			<div className="rounded border border-border/60 bg-secondary/30 px-3 py-3">
				<Text tone="muted" variant="caption">
					No MCP keys yet. Claude and Claude Code sign in with your account and
					show up under{" "}
					<Link
						className="text-primary hover:underline"
						href="/settings/account"
					>
						Connected apps
					</Link>{" "}
					in your account settings. Cursor, Windsurf, and other clients use a
					dedicated key instead of a personal API key.
				</Text>
			</div>
		);
	}

	return (
		<div className="rounded border border-border/60 bg-secondary/30">
			{keys.map((key) => {
				const status = keyStatus(key);
				return (
					<div
						className="flex flex-col gap-3 border-border/60 border-b px-3 py-3 last:border-b-0 sm:flex-row sm:items-center"
						key={key.id}
					>
						<div className="flex min-w-0 flex-1 items-start gap-2">
							<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded bg-primary/10">
								<KeyIcon className="size-3.5 text-primary" />
							</div>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<Text className="truncate" variant="label">
										{key.name}
									</Text>
									<Badge size="sm" variant={status.variant}>
										{status.label}
									</Badge>
								</div>
								<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
									<Text
										as="span"
										className="font-mono"
										tone="muted"
										variant="caption"
									>
										{formatMaskedApiKey(key)}
									</Text>
									<Text as="span" tone="muted" variant="caption">
										{scopeSummary(key)}
									</Text>
								</div>
								<Text className="mt-0.5" tone="muted" variant="caption">
									{key.lastUsedAt
										? `Used ${dayjs(key.lastUsedAt).fromNow()}`
										: "Never used"}
									{key.expiresAt
										? ` · Expires ${dayjs(key.expiresAt).fromNow()}`
										: " · No expiry"}
								</Text>
							</div>
						</div>
						<Button onClick={() => onManage(key)} size="sm" variant="ghost">
							Manage
						</Button>
					</div>
				);
			})}
		</div>
	);
}

export function McpSetupSheet({
	organizationId,
	open,
	onOpenChangeAction,
}: {
	organizationId: string;
	open: boolean;
	onOpenChangeAction: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [client, setClient] = useState<McpClient>("cursor");
	const [name, setName] = useState(() => defaultConnectionName("cursor"));
	const [selectedActions, setSelectedActions] = useState<McpAction[]>([]);
	const [selectedWebsiteIds, setSelectedWebsiteIds] = useState<string[]>([]);
	const [allowOrganizationWideLinks, setAllowOrganizationWideLinks] =
		useState(false);
	const [expiry, setExpiry] = useState<McpExpiry>("90d");
	const [newSecret, setNewSecret] = useState<string | null>(null);
	const [useEnvironmentVariable, setUseEnvironmentVariable] = useState(false);

	const websitesQuery = useQuery({
		...orpc.websites.list.queryOptions({
			input: { organizationId },
		}),
		enabled: open && !newSecret,
	});

	const createMutation = useMutation({
		...orpc.apikeys.create.mutationOptions(),
		onSuccess: (result) => {
			setNewSecret(result.secret);
			queryClient.invalidateQueries({ queryKey: orpc.apikeys.list.key() });
			toast.success("MCP connection created");
		},
		onError: (error: Error) => {
			toast.error(
				getUserFacingErrorMessage(error, "Could not create the MCP connection.")
			);
		},
	});

	useEffect(() => {
		if (!open) {
			return;
		}
		setClient("cursor");
		setName(defaultConnectionName("cursor"));
		setSelectedActions([]);
		setSelectedWebsiteIds([]);
		setAllowOrganizationWideLinks(false);
		setExpiry("90d");
		setNewSecret(null);
		setUseEnvironmentVariable(false);
	}, [open]);

	const selectedScopes = getMcpScopes(selectedActions);
	const needsOrganizationWideLinkAcknowledgment =
		selectedActions.includes("links") && selectedWebsiteIds.length > 0;

	const handleClientChange = (nextClient: McpClient) => {
		const previousDefault = defaultConnectionName(client);
		if (name === previousDefault) {
			setName(defaultConnectionName(nextClient));
		}
		setClient(nextClient);
	};

	const toggleWebsite = (websiteId: string) => {
		setSelectedWebsiteIds((current) =>
			current.includes(websiteId)
				? current.filter((id) => id !== websiteId)
				: [...current, websiteId]
		);
	};

	const toggleAction = (action: McpAction) => {
		setSelectedActions((current) =>
			current.includes(action)
				? current.filter((value) => value !== action)
				: [...current, action]
		);
		if (action === "links") {
			setAllowOrganizationWideLinks(false);
		}
	};

	const handleCreate = () => {
		const trimmedName = name.trim();
		if (!trimmedName) {
			toast.error("Give this connection a name first.");
			return;
		}
		if (
			needsOrganizationWideLinkAcknowledgment &&
			!allowOrganizationWideLinks
		) {
			toast.error("Confirm organization-wide Short links access first.");
			return;
		}

		const grant = getMcpScopeGrant(selectedActions, selectedWebsiteIds);

		createMutation.mutate({
			name: trimmedName,
			description: `Databuddy MCP connection for ${CLIENT_LABELS[client]}`,
			organizationId,
			type: "automation",
			scopes: grant.scopes,
			resources: grant.resources,
			tags: ["MCP", CLIENT_LABELS[client]],
			expiresAt:
				expiry === "90d" ? dayjs().add(90, "day").toISOString() : undefined,
			ratelimit: { enabled: true },
		});
	};

	const handleClose = () => {
		if (createMutation.isPending) {
			return;
		}
		onOpenChangeAction(false);
	};

	return (
		<Sheet onOpenChange={handleClose} open={open}>
			<Sheet.Content className="sm:max-w-xl" side="right">
				<Sheet.Header>
					<div className="flex items-start gap-3">
						<div className="flex size-8 items-center justify-center rounded bg-primary/10">
							<RobotIcon className="text-primary" size={16} />
						</div>
						<div className="min-w-0 flex-1">
							<Sheet.Title>
								{newSecret ? "MCP is ready" : "Connect Databuddy MCP"}
							</Sheet.Title>
							<Sheet.Description>
								{newSecret
									? "Copy the config into your AI client, then ask it to list your websites."
									: "Give your AI tools a scoped connection to your Databuddy analytics."}
							</Sheet.Description>
						</div>
					</div>
				</Sheet.Header>

				<Sheet.Body className="space-y-5">
					{newSecret ? (
						<ConnectionCreated
							client={client}
							onEnvironmentVariableChange={setUseEnvironmentVariable}
							secret={newSecret}
							useEnvironmentVariable={useEnvironmentVariable}
						/>
					) : (
						<>
							<Field>
								<Field.Label>Connection name</Field.Label>
								<Input
									onChange={(event) => setName(event.target.value)}
									value={name}
								/>
								<Field.Description>
									Use one connection per client or environment so each key can
									be rotated independently.
								</Field.Description>
							</Field>

							<div className="space-y-2">
								<Text variant="label">AI client</Text>
								<SegmentedControl
									className="w-full overflow-x-auto"
									name="mcp-client"
									onChange={handleClientChange}
									options={CLIENT_OPTIONS}
									size="sm"
									value={client}
								/>
								<Text tone="muted" variant="caption">
									{
										CLIENT_OPTIONS.find((option) => option.value === client)
											?.description
									}
								</Text>
							</div>

							{client === "claude" && <ClaudeSignIn />}

							<div className="rounded border border-border/60">
								<div className="flex items-start gap-3 px-3 py-3">
									<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded bg-success/10">
										<ShieldCheckIcon className="size-4 text-success" />
									</div>
									<div className="min-w-0 flex-1">
										<Text variant="label">Analytics access</Text>
										<Text className="mt-0.5" tone="muted" variant="caption">
											Read access is always included. Add only the workspace
											actions you want this connection to perform.
										</Text>
										<div className="mt-2 flex flex-wrap gap-1">
											{selectedScopes.map((scope) => (
												<Badge key={scope} size="sm" variant="muted">
													{scope}
												</Badge>
											))}
										</div>
									</div>
									<Badge
										size="sm"
										variant={selectedActions.length > 0 ? "warning" : "success"}
									>
										{selectedActions.length > 0
											? `${selectedActions.length} action${selectedActions.length === 1 ? "" : "s"}`
											: "Read-only"}
									</Badge>
								</div>
								<div className="border-border/60 border-t px-3 py-3">
									<div className="space-y-2.5">
										<div>
											<Text variant="label">Optional actions</Text>
											<Text className="mt-0.5" tone="muted" variant="caption">
												Goal, funnel, annotation, flag, and link changes show a
												preview first and apply only once confirmed.
												Investigation replies post right away.
											</Text>
										</div>
										<div className="space-y-2">
											{MCP_ACTION_OPTIONS.map((option) => (
												<div
													className="rounded border border-border/60 px-3 py-2.5"
													key={option.value}
												>
													<Checkbox
														checked={selectedActions.includes(option.value)}
														description={option.description}
														label={option.label}
														onCheckedChange={() => toggleAction(option.value)}
													/>
												</div>
											))}
										</div>
									</div>
								</div>
							</div>

							<Accordion defaultOpen={false}>
								<Accordion.Trigger>
									<GlobeIcon className="size-4 text-muted-foreground" />
									<Text variant="label">Website access</Text>
									<Badge className="ml-auto" size="sm" variant="muted">
										{selectedWebsiteIds.length === 0
											? "All websites"
											: `${selectedWebsiteIds.length} selected`}
									</Badge>
								</Accordion.Trigger>
								<Accordion.Content>
									<div className="space-y-3">
										<Text tone="muted" variant="caption">
											Leave all websites unselected for organization-wide
											access, or choose specific websites for a least-privilege
											connection.
										</Text>
										{needsOrganizationWideLinkAcknowledgment ? (
											<div className="rounded border border-warning/30 bg-warning/5 px-3 py-2.5">
												<Checkbox
													checked={allowOrganizationWideLinks}
													description="Short links belong to the organization, so this connection can manage every short link here, not only links associated with the selected websites."
													label="Allow organization-wide Short links access"
													onCheckedChange={(checked) =>
														setAllowOrganizationWideLinks(checked === true)
													}
												/>
											</div>
										) : null}
										{websitesQuery.isLoading ? (
											<div className="flex items-center gap-2 rounded border border-border/60 border-dashed px-3 py-3">
												<ClockIcon className="size-4 animate-pulse text-muted-foreground" />
												<Text tone="muted" variant="caption">
													Loading websites…
												</Text>
											</div>
										) : websitesQuery.data && websitesQuery.data.length > 0 ? (
											<div className="divide-y divide-border/60 overflow-hidden rounded border border-border/60">
												{websitesQuery.data.map((website) => (
													<div className="px-3 py-2.5" key={website.id}>
														<Checkbox
															checked={selectedWebsiteIds.includes(website.id)}
															description={website.domain}
															label={website.name || website.domain}
															onCheckedChange={() => toggleWebsite(website.id)}
														/>
													</div>
												))}
											</div>
										) : (
											<div className="flex items-center gap-2 rounded border border-border/60 border-dashed px-3 py-3">
												<LockSimpleIcon className="size-4 text-muted-foreground" />
												<Text tone="muted" variant="caption">
													No websites in this organization yet.
												</Text>
											</div>
										)}
									</div>
								</Accordion.Content>
							</Accordion>

							<div className="space-y-2">
								<Text variant="label">Key expiry</Text>
								<SegmentedControl
									name="mcp-expiry"
									onChange={setExpiry}
									options={[
										{ label: "90 days", value: "90d" },
										{ label: "Never", value: "never" },
									]}
									size="sm"
									value={expiry}
								/>
								<Text tone="muted" variant="caption">
									Keys are shown once and can be rotated or revoked from API
									Keys.
								</Text>
							</div>

							<div className="flex items-start gap-2 rounded border border-warning/30 bg-warning/5 px-3 py-2.5">
								<TriangleWarningIcon className="mt-0.5 size-4 shrink-0 text-warning" />
								<Text tone="muted" variant="caption">
									The generated key authenticates an external AI client. Keep it
									out of Git, screenshots, and shared prompts.
								</Text>
							</div>
						</>
					)}
				</Sheet.Body>

				<Sheet.Footer>
					{newSecret ? (
						<Button onClick={handleClose} variant="primary">
							Done
						</Button>
					) : (
						<>
							<Button onClick={handleClose} variant="ghost">
								Cancel
							</Button>
							<Button
								disabled={
									createMutation.isPending ||
									(needsOrganizationWideLinkAcknowledgment &&
										!allowOrganizationWideLinks)
								}
								loading={createMutation.isPending}
								onClick={handleCreate}
							>
								<PlugIcon className="size-4" />
								Create connection
							</Button>
						</>
					)}
				</Sheet.Footer>
			</Sheet.Content>
		</Sheet>
	);
}

function ConnectionCreated({
	client,
	onEnvironmentVariableChange,
	secret,
	useEnvironmentVariable,
}: {
	client: McpClient;
	onEnvironmentVariableChange: (value: boolean) => void;
	secret: string;
	useEnvironmentVariable: boolean;
}) {
	const config = createMcpConfig(secret, client, useEnvironmentVariable);
	const clientOption = CLIENT_OPTIONS.find((option) => option.value === client);
	const clientDescription = clientOption?.keyHint ?? clientOption?.description;
	const envVarReference = MCP_ENV_VAR_REFERENCES[client];

	return (
		<div className="space-y-5">
			<div className="rounded border border-success/30 bg-success/5 p-3">
				<div className="flex items-start gap-2">
					<CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-success" />
					<div className="min-w-0">
						<Text className="text-success" variant="label">
							Connection created
						</Text>
						<Text className="mt-0.5" tone="muted" variant="caption">
							{clientDescription}
						</Text>
					</div>
				</div>
			</div>

			<div className="space-y-2">
				<div className="flex items-center justify-between gap-3">
					<div>
						<Text variant="label">Secret key</Text>
						<Text tone="muted" variant="caption">
							Copy this now. It will not be shown again.
						</Text>
					</div>
					<CopyButton label="Copy key" value={secret} variant="secondary" />
				</div>
				<div className="flex items-start gap-2 rounded border border-warning/30 bg-warning/5 p-3">
					<KeyIcon className="mt-0.5 size-4 shrink-0 text-warning" />
					<code className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground leading-relaxed">
						{secret}
					</code>
				</div>
			</div>

			<div className="space-y-2">
				<div className="flex items-center justify-between gap-3">
					<div>
						<Text variant="label">Configuration</Text>
						<Text tone="muted" variant="caption">
							Copy this into your client’s MCP settings.
						</Text>
					</div>
					<CopyButton label="Copy config" value={config} variant="secondary" />
				</div>
				<div className="relative overflow-hidden rounded border border-border/60 bg-secondary/50">
					<pre className="max-h-56 overflow-auto p-3 pr-12 font-mono text-[11px] text-foreground leading-relaxed">
						<code>{config}</code>
					</pre>
					<CopyButton
						aria-label="Copy MCP configuration"
						className="absolute top-2 right-2 bg-card/80"
						value={config}
						variant="ghost"
					/>
				</div>
			</div>

			{envVarReference ? (
				<div className="flex items-center justify-between gap-3 rounded border border-border/60 px-3 py-2.5">
					<Checkbox
						checked={useEnvironmentVariable}
						description={`Keep the key out of the config. Set ${MCP_ENV_VAR} in your environment before launching ${CLIENT_LABELS[client]}.`}
						label="Use an environment variable"
						onCheckedChange={(checked) =>
							onEnvironmentVariableChange(checked === true)
						}
					/>
					<Badge size="sm" variant="muted">
						{envVarReference}
					</Badge>
				</div>
			) : null}

			<div className="space-y-2">
				<Text variant="label">Test it</Text>
				<div className="flex items-center gap-2 rounded border border-border/60 bg-secondary/30 px-3 py-2.5">
					<CodeIcon className="size-4 shrink-0 text-muted-foreground" />
					<Text className="flex-1" variant="label">
						List my Databuddy websites.
					</Text>
					<CopyButton
						aria-label="Copy test prompt"
						value="List my Databuddy websites."
					/>
				</div>
				<Text tone="muted" variant="caption">
					If the client returns a 401, rotate the key. If a tool you expect is
					missing, check the key's access in Organization Settings → API Keys.
				</Text>
			</div>

			<div className="rounded border border-border/60 px-3 py-2.5">
				<div className="flex items-center gap-2">
					<GlobeIcon className="size-4 text-muted-foreground" />
					<Text variant="label">Server endpoint</Text>
				</div>
				<div className="mt-1 flex items-center gap-2">
					<Text
						className="min-w-0 flex-1 truncate font-mono"
						tone="muted"
						variant="caption"
					>
						{MCP_SERVER_URL}
					</Text>
					<CopyButton
						aria-label="Copy MCP server endpoint"
						value={MCP_SERVER_URL}
					/>
				</div>
			</div>
		</div>
	);
}
