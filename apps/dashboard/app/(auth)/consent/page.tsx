"use client";

import { authClient } from "@databuddy/auth/client";
import {
	Button,
	Card,
	Field,
	FieldTriggerButton,
	Skeleton,
	Text,
} from "@databuddy/ui";
import { Checkbox, DropdownMenu, SegmentedControl } from "@databuddy/ui/client";
import {
	CaretUpDownIcon,
	CheckCircleIcon,
	PlugIcon,
} from "@databuddy/ui/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { SCOPE_OPTIONS } from "@/components/organizations/api-key-types";
import { orpc } from "@/lib/orpc";

const IDENTITY_SCOPE_LABELS = new Map([
	["openid", "Your name and email address"],
	["profile", "Your name and email address"],
	["email", "Your name and email address"],
	["offline_access", "Stay connected until you disconnect it"],
]);
const SCOPE_SEPARATOR = /\s+/;

function urlHost(value: string | null): string | null {
	if (!value) {
		return null;
	}
	try {
		return new URL(value).host;
	} catch {
		return null;
	}
}

function ConsentPage() {
	const searchParams = useSearchParams();
	const oauthQuery = searchParams.toString();
	const clientId = searchParams.get("client_id");
	const clientHost = urlHost(clientId);
	const host = urlHost(searchParams.get("redirect_uri"));
	const requestedScopes =
		searchParams.get("scope")?.split(SCOPE_SEPARATOR).filter(Boolean) ?? [];
	const requestedActions = SCOPE_OPTIONS.filter(({ value }) =>
		requestedScopes.includes(value)
	);
	const identityScopes = requestedScopes.filter((scope) =>
		IDENTITY_SCOPE_LABELS.has(scope)
	);
	const identityPermissions = [
		...new Set(identityScopes.map((scope) => IDENTITY_SCOPE_LABELS.get(scope))),
	];
	const [selectedScopes, setSelectedScopes] = useState<string[]>(() =>
		requestedActions
			.filter(({ value }) => value.startsWith("read:"))
			.map(({ value }) => value)
	);
	const [organizationId, setOrganizationId] = useState<string | null>(null);
	const [websiteIds, setWebsiteIds] = useState<string[] | null>(null);
	const approvedActions = requestedActions
		.filter(({ value }) => selectedScopes.includes(value))
		.map(({ value }) => value);

	const { data: client, isPending: isClientPending } = useQuery({
		enabled: Boolean(clientId),
		queryKey: ["oauth-public-client", clientId],
		queryFn: () =>
			clientId
				? authClient.oauth2.publicClient(
						{ query: { client_id: clientId } },
						{ throw: true }
					)
				: null,
	});
	const organizationsQuery = useQuery({
		enabled: Boolean(clientId),
		queryKey: ["oauth-organizations"],
		queryFn: () =>
			authClient.organization.list({ fetchOptions: { throw: true } }),
	});
	const organizations = organizationsQuery.data ?? [];
	const organization =
		organizations.find(({ id }) => id === organizationId) ??
		(organizations.length === 1 ? organizations[0] : undefined);
	const websitesQuery = useQuery({
		...orpc.websites.list.queryOptions({
			input: { organizationId: organization?.id },
		}),
		enabled: Boolean(organization),
	});
	const websites = websitesQuery.data ?? [];
	const validWebsiteSelection =
		websiteIds === null ||
		(websiteIds.length > 0 &&
			websiteIds.every((id) => websites.some((website) => website.id === id)));
	const canAllow =
		Boolean(organization) &&
		organizationsQuery.isSuccess &&
		websitesQuery.isSuccess &&
		validWebsiteSelection &&
		approvedActions.length > 0;

	const decision = useMutation({
		meta: { suppressGlobalErrorToast: true },
		mutationFn: (accept: boolean) =>
			authClient.oauth2.consent(
				{
					accept,
					oauth_query: oauthQuery,
					...(accept && {
						scope: [...identityScopes, ...approvedActions].join(" "),
					}),
				},
				{
					throw: true,
					body: accept
						? { organizationId: organization?.id, websiteIds }
						: undefined,
				}
			),
		onError: () =>
			toast.error("Could not complete authorization. Try connecting again."),
	});
	const busy = decision.isPending || decision.isSuccess;

	if (!clientId) {
		return (
			<Card className="flex flex-col gap-2 p-6">
				<Text as="h1" className="text-balance font-medium text-2xl">
					Nothing to authorize
				</Text>
				<Text tone="muted">
					This page opens when an application asks to connect to your Databuddy
					account.
				</Text>
			</Card>
		);
	}

	return (
		<Card aria-busy={busy} className="flex flex-col gap-6 p-6">
			<div className="flex items-center gap-3">
				<PlugIcon className="size-5 shrink-0 text-muted-foreground" />
				{isClientPending ? (
					<Skeleton className="h-8 w-48" />
				) : (
					<Text as="h1" className="text-balance font-medium text-2xl">
						{client?.client_name ?? clientHost ?? clientId}
						{client?.client_name && clientHost ? ` (${clientHost})` : ""} wants
						to connect
					</Text>
				)}
			</div>

			<Text tone="muted">
				Choose the organization, websites, and permissions this connection can
				use. Your organization role still applies. Disconnect it at any time
				from Connected apps in your account settings.
			</Text>

			{host && (
				<Text tone="muted">
					You will be sent back to <span className="font-medium">{host}</span>.
					Only continue if you recognise it.
				</Text>
			)}

			<Field error={organizationsQuery.isError}>
				<Field.Label htmlFor="consent-organization">Organization</Field.Label>
				<DropdownMenu>
					<DropdownMenu.Trigger
						disabled={
							busy || !organizationsQuery.isSuccess || !organizations.length
						}
						render={
							<FieldTriggerButton
								aria-describedby="consent-organization-description"
								className="justify-between"
								id="consent-organization"
							>
								{organizationsQuery.isPending
									? "Loading organizations…"
									: (organization?.name ?? "Choose an organization")}
								<CaretUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
							</FieldTriggerButton>
						}
					/>
					<DropdownMenu.Content align="start">
						<DropdownMenu.RadioGroup
							onValueChange={(value) => {
								setOrganizationId(value);
								setWebsiteIds(null);
							}}
							value={organization?.id ?? ""}
						>
							{organizations.map((item) => (
								<DropdownMenu.RadioItem key={item.id} value={item.id}>
									{item.name}
								</DropdownMenu.RadioItem>
							))}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu>
				{organizationsQuery.isError ? (
					<Field.Error id="consent-organization-description">
						Could not load organizations. Try connecting again.
					</Field.Error>
				) : organizationsQuery.isSuccess && !organizations.length ? (
					<Field.Description id="consent-organization-description">
						You need an organization to connect this app.
					</Field.Description>
				) : (
					<Field.Description id="consent-organization-description">
						This connection can access only the selected organization.
					</Field.Description>
				)}
			</Field>

			{organization && (
				<div className="space-y-3">
					<Text variant="label">Website access</Text>
					<SegmentedControl
						aria-label="Website access"
						disabled={busy || !websitesQuery.isSuccess}
						onChange={(value) => setWebsiteIds(value === "all" ? null : [])}
						options={[
							{ label: "All websites", value: "all" },
							{ label: "Choose websites", value: "selected" },
						]}
						size="sm"
						value={websiteIds === null ? "all" : "selected"}
					/>
					{websitesQuery.isPending ? (
						<Text role="status" tone="muted">
							Loading websites…
						</Text>
					) : websitesQuery.isError ? (
						<Text role="alert" tone="destructive">
							Could not load websites. Try connecting again.
						</Text>
					) : websiteIds === null ? (
						<Text tone="muted" variant="caption">
							Includes current and future websites in this organization that
							your role can access.
						</Text>
					) : (
						<div className="max-h-48 space-y-3 overflow-auto rounded border border-border/60 p-3">
							{websites.map((website) => (
								<Checkbox
									checked={websiteIds.includes(website.id)}
									description={website.domain}
									disabled={busy}
									key={website.id}
									label={website.name || website.domain}
									onCheckedChange={(checked) =>
										setWebsiteIds((current) =>
											checked
												? [...(current ?? []), website.id]
												: (current ?? []).filter((id) => id !== website.id)
										)
									}
								/>
							))}
							{!websiteIds.length && (
								<Text tone="muted" variant="caption">
									Choose at least one website.
								</Text>
							)}
						</div>
					)}
				</div>
			)}

			<div className="space-y-3">
				<Text variant="label">Permissions</Text>
				{requestedActions.map(({ value, label }) => (
					<Checkbox
						checked={selectedScopes.includes(value)}
						description={
							value.endsWith(":links")
								? "Applies to every short link in this organization, including when you choose specific websites."
								: undefined
						}
						disabled={busy}
						key={value}
						label={label}
						onCheckedChange={(checked) =>
							setSelectedScopes((current) =>
								checked
									? [...current, value]
									: current.filter((scope) => scope !== value)
							)
						}
					/>
				))}
				{requestedActions.length ? (
					approvedActions.length ? null : (
						<Text tone="muted" variant="caption">
							Choose at least one permission.
						</Text>
					)
				) : (
					<Text role="alert" tone="destructive">
						This app did not request Databuddy permissions. Connect again with
						the permissions it needs.
					</Text>
				)}
				{identityPermissions.map((permission) => (
					<div className="flex items-center gap-2" key={permission}>
						<CheckCircleIcon className="size-4 shrink-0 text-muted-foreground" />
						<Text tone="muted" variant="caption">
							{permission}
						</Text>
					</div>
				))}
			</div>

			<div className="flex gap-3">
				<Button
					disabled={busy || !canAllow}
					loading={busy && decision.variables === true}
					onClick={() => decision.mutate(true)}
				>
					Allow access
				</Button>
				<Button
					disabled={busy}
					loading={busy && decision.variables === false}
					onClick={() => decision.mutate(false)}
					variant="secondary"
				>
					Deny
				</Button>
			</div>
		</Card>
	);
}

export default function Page() {
	return (
		<Suspense fallback={<Skeleton className="h-64 w-full" />}>
			<ConsentPage />
		</Suspense>
	);
}
