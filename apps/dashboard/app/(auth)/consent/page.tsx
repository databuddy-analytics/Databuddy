"use client";

import { authClient } from "@databuddy/auth/client";
import { Button, Card, Skeleton, Spinner, Text } from "@databuddy/ui";
import { CheckCircleIcon, PlugIcon } from "@databuddy/ui/icons";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

interface PublicClient {
	icon?: string | null;
	name?: string | null;
	uri?: string | null;
}

function ConsentPage() {
	const [client, setClient] = useState<PublicClient | null>(null);
	const [isLoadingClient, setIsLoadingClient] = useState(true);
	const [pendingDecision, setPendingDecision] = useState<
		"accept" | "deny" | null
	>(null);

	const oauthQuery =
		typeof window === "undefined" ? "" : window.location.search.slice(1);
	const params = new URLSearchParams(oauthQuery);
	const clientId = params.get("client_id");
	const scopes = (params.get("scope") ?? "").split(" ").filter(Boolean);

	useEffect(() => {
		if (!clientId) {
			setIsLoadingClient(false);
			return;
		}
		authClient
			.$fetch<PublicClient>(
				`/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`
			)
			.then((result) => setClient(result.data ?? null))
			.catch(() => setClient(null))
			.finally(() => setIsLoadingClient(false));
	}, [clientId]);

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
			<Card className="p-6">
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

	const clientName = client?.name ?? clientId;

	return (
		<Card className="flex flex-col gap-6 p-6">
			<div className="flex items-center gap-3">
				<PlugIcon className="size-5 text-muted-foreground" />
				{isLoadingClient ? (
					<Skeleton className="h-6 w-40" />
				) : (
					<Text as="h1" className="text-balance font-medium text-2xl">
						{clientName} wants to connect
					</Text>
				)}
			</div>

			<Text tone="muted">
				It will be able to read and act on your Databuddy data using your
				permissions. You can revoke access at any time from your account
				settings.
			</Text>

			{scopes.length > 0 && (
				<ul className="flex flex-col gap-2">
					{scopes.map((scope) => (
						<li className="flex items-center gap-2" key={scope}>
							<CheckCircleIcon className="size-4 text-muted-foreground" />
							<Text>{scope}</Text>
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
