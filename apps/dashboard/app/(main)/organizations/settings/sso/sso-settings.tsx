"use client";

import {
	ArrowClockwiseIcon,
	FingerprintIcon,
	LockKeyIcon,
	PlusIcon,
	ShieldCheckIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { RightSidebar } from "@/components/right-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { Organization } from "@/hooks/use-organizations";
import { SSOProviderSheet } from "./sso-provider-sheet";
import { useSSO } from "./use-sso";

type SSOSettingsProps = {
	organization: Organization;
};

type SSOProviderDisplay = {
	id: string;
	providerId: string;
	name: string;
	type: "oidc" | "saml";
	domain: string;
	issuer: string;
};

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="h-10 w-10 rounded" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-48" />
			</div>
			<Skeleton className="h-6 w-16 rounded-full" />
		</div>
	);
}

function SSOSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="divide-y border-b lg:border-b-0">
				<SkeletonRow />
				<SkeletonRow />
			</div>
			<div className="space-y-4 bg-card p-5">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-20 w-full rounded" />
			</div>
		</div>
	);
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex h-full flex-col items-center justify-center p-8 text-center">
			<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
				<FingerprintIcon
					className="text-destructive"
					size={28}
					weight="duotone"
				/>
			</div>
			<h3 className="mb-1 font-semibold text-lg">Failed to load</h3>
			<p className="mb-6 max-w-sm text-muted-foreground text-sm">
				Something went wrong while loading SSO providers
			</p>
			<Button onClick={onRetry} variant="outline">
				<ArrowClockwiseIcon className="mr-2" size={16} />
				Try again
			</Button>
		</div>
	);
}

function SSOProviderRow({
	provider,
	onDelete,
	isDeleting,
}: {
	provider: SSOProviderDisplay;
	onDelete: () => void;
	isDeleting: boolean;
}) {
	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded bg-secondary">
				{provider.type === "saml" ? (
					<FingerprintIcon
						className="text-accent-foreground"
						size={20}
						weight="duotone"
					/>
				) : (
					<LockKeyIcon
						className="text-accent-foreground"
						size={20}
						weight="duotone"
					/>
				)}
			</div>
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium">{provider.name}</p>
					<Badge variant={provider.type === "saml" ? "secondary" : "outline"}>
						{provider.type.toUpperCase()}
					</Badge>
				</div>
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<span className="truncate">{provider.domain}</span>
				</div>
			</div>
			<Badge variant="green">Active</Badge>
			<Button
				disabled={isDeleting}
				onClick={onDelete}
				size="icon"
				variant="ghost"
			>
				<TrashIcon className="text-muted-foreground" size={16} />
			</Button>
		</div>
	);
}

export function SSOSettings({ organization }: SSOSettingsProps) {
	const [showProviderSheet, setShowProviderSheet] = useState(false);
	const [providerToDelete, setProviderToDelete] =
		useState<SSOProviderDisplay | null>(null);

	const {
		providers: rawProviders,
		isLoading,
		hasError,
		refetch,
		deleteProvider,
		isDeleting,
	} = useSSO(organization.id);

	// Transform providers for display
	const providers: SSOProviderDisplay[] = rawProviders.map(
		(p: {
			id: string;
			providerId: string;
			domain: string;
			issuer: string;
			samlConfig: unknown;
			oidcConfig: unknown;
		}) => ({
			id: p.id,
			providerId: p.providerId,
			name: p.providerId,
			type: p.samlConfig ? ("saml" as const) : ("oidc" as const),
			domain: p.domain,
			issuer: p.issuer,
			domainVerified: true, // Not tracking this anymore
		})
	);

	const isEmpty = providers.length === 0;

	if (isLoading) {
		return <SSOSkeleton />;
	}

	if (hasError) {
		return <ErrorState onRetry={refetch} />;
	}

	const handleAddProvider = () => {
		setShowProviderSheet(true);
	};

	return (
		<>
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				{/* Main Content */}
				<div className="flex flex-col border-b lg:border-b-0">
					{isEmpty ? (
						<EmptyState
							description="Configure SSO to let your team authenticate with enterprise identity providers"
							icon={<FingerprintIcon weight="duotone" />}
							title="No SSO providers configured"
						/>
					) : (
						<div className="flex-1 divide-y overflow-y-auto">
							{providers.map((provider) => (
								<SSOProviderRow
									isDeleting={isDeleting}
									key={provider.id}
									onDelete={() => setProviderToDelete(provider)}
									provider={provider}
								/>
							))}
						</div>
					)}
				</div>

				{/* Sidebar */}
				<RightSidebar className="gap-4 p-5">
					<Button className="w-full" onClick={handleAddProvider}>
						<PlusIcon size={16} />
						Add SSO Provider
					</Button>

					<RightSidebar.InfoCard
						badge={{ label: "Enterprise", variant: "secondary" }}
						description="OIDC, OAuth2, SAML 2.0"
						icon={ShieldCheckIcon}
						title="Supported Protocols"
					/>

					<RightSidebar.Section border title="How SSO Works">
						<div className="space-y-3">
							<div className="flex items-start gap-3">
								<div className="flex size-6 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground text-xs">
									1
								</div>
								<p className="text-muted-foreground text-sm">
									Configure your identity provider (Okta, Azure AD, etc.)
								</p>
							</div>
							<div className="flex items-start gap-3">
								<div className="flex size-6 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground text-xs">
									2
								</div>
								<p className="text-muted-foreground text-sm">
									Verify your domain ownership via DNS
								</p>
							</div>
							<div className="flex items-start gap-3">
								<div className="flex size-6 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground text-xs">
									3
								</div>
								<p className="text-muted-foreground text-sm">
									Users sign in with their corporate credentials
								</p>
							</div>
						</div>
					</RightSidebar.Section>

					<RightSidebar.DocsLink
						href="https://www.databuddy.cc/docs/sso"
						label="SSO Documentation"
					/>

					<RightSidebar.Tip
						description="Domain verification ensures only authorized identity providers can authenticate users for your organization."
						title="Domain verification"
					/>
				</RightSidebar>
			</div>

			<SSOProviderSheet
				onOpenChange={setShowProviderSheet}
				open={showProviderSheet}
				organizationId={organization.id}
			/>

			<DeleteDialog
				description={`This will permanently delete the SSO provider "${providerToDelete?.name}" and disable SSO authentication for the domain "${providerToDelete?.domain}".`}
				isDeleting={isDeleting}
				isOpen={!!providerToDelete}
				onClose={() => setProviderToDelete(null)}
				onConfirm={() => {
					if (providerToDelete) {
						deleteProvider(providerToDelete.providerId);
					}
				}}
				title="Delete SSO Provider"
			/>
		</>
	);
}
