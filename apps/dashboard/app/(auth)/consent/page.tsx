"use client";

import { authClient } from "@databuddy/auth/client";
import { Button, Card, Skeleton, Spinner, Text } from "@databuddy/ui";
import { CheckCircleIcon, PlugIcon } from "@databuddy/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { SCOPE_OPTIONS } from "@/components/organizations/api-key-types";

interface PublicClient {
	icon?: string | null;
	name?: string | null;
	uri?: string | null;
}

const IDENTITY_LABEL = "Your name and email address";

const SCOPE_LABELS = new Map<string, string>([
	...SCOPE_OPTIONS.map(({ value, label }) => [value, label] as const),
	["openid", IDENTITY_LABEL],
	["profile", IDENTITY_LABEL],
	["email", IDENTITY_LABEL],
	["offline_access", "Stay connected until you disconnect it"],
]);

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
	const [pendingDecision, setPendingDecision] = useState<
		"accept" | "deny" | null
	>(null);

	const oauthQuery = searchParams.toString();
	const clientId = searchParams.get("client_id");
	const clientHost = urlHost(clientId);
	const host = urlHost(searchParams.get("redirect_uri"));
	const permissions = [
		...new Set(
			(searchParams.get("scope") ?? "")
				.split(" ")
				.filter(Boolean)
				.map((scope) => SCOPE_LABELS.get(scope) ?? scope)
		),
	];

	const { data: client, isPending } = useQuery<PublicClient | null>({
		enabled: Boolean(clientId),
		queryKey: ["oauth-public-client", clientId],
		queryFn: async () => {
			const result = await authClient.$fetch<PublicClient>(
				`/oauth2/public-client?client_id=${encodeURIComponent(clientId as string)}`
			);
			return result.data ?? null;
		},
	});

	const decide = async (accept: boolean) => {
		setPendingDecision(accept ? "accept" : "deny");
		const result = await authClient.$fetch<{ url?: string }>(
			"/oauth2/consent",
			{ method: "POST", body: { accept, oauth_query: oauthQuery } }
		);
		const redirectUri = result.data?.url;
		if (!redirectUri) {
			setPendingDecision(null);
			toast.error("Could not complete authorization. Try connecting again.");
			return;
		}
		window.location.href = redirectUri;
	};

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
		<Card className="flex flex-col gap-6 p-6">
			<div className="flex items-center gap-3">
				<PlugIcon className="size-5 text-muted-foreground" />
				{isPending ? (
					<Skeleton className="h-8 w-48" />
				) : (
					<Text as="h1" className="text-balance font-medium text-2xl">
						{client?.name ?? clientHost ?? clientId}
						{client?.name && clientHost ? ` (${clientHost})` : ""} wants to
						connect
					</Text>
				)}
			</div>

			<Text tone="muted">
				It will be able to read and act on your Databuddy data using your
				permissions. Disconnect it at any time from Connected apps in your
				account settings.
			</Text>

			{host && (
				<Text tone="muted">
					You will be sent back to <span className="font-medium">{host}</span>.
					Only continue if you recognise it.
				</Text>
			)}

			{permissions.length > 0 && (
				<ul className="grid gap-2 sm:grid-cols-2">
					{permissions.map((permission) => (
						<li className="flex items-center gap-2" key={permission}>
							<CheckCircleIcon className="size-4 shrink-0 text-muted-foreground" />
							<Text>{permission}</Text>
						</li>
					))}
				</ul>
			)}

			<div className="flex gap-3">
				<Button
					disabled={pendingDecision !== null}
					onClick={() => decide(true)}
				>
					{pendingDecision === "accept" ? <Spinner /> : null}
					Allow access
				</Button>
				<Button
					disabled={pendingDecision !== null}
					onClick={() => decide(false)}
					variant="outline"
				>
					{pendingDecision === "deny" ? <Spinner /> : null}
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
