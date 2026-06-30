"use client";

import {
	CheckIcon,
	CopyIcon,
	FloppyDiskIcon,
	IdBadgeIcon,
} from "@databuddy/ui/icons";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/layout/top-bar";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { type Organization, useOrganizations } from "@/hooks/use-organizations";
import { ApiKeysSection } from "./api-keys-section";
import { DestructiveActionsSection } from "./destructive-actions-section";
import { OrganizationAvatarEditor } from "./organization-avatar-editor";
import { WorkspaceWebsitesSection } from "./workspace-websites-section";
import { Button, Card, Field, Input } from "@databuddy/ui";

export function GeneralSettings({
	organization,
}: {
	organization: Organization;
}) {
	const [name, setName] = useState(organization.name);
	const [slug, setSlug] = useState(organization.slug);
	const [isSaving, setIsSaving] = useState(false);

	const { updateOrganization } = useOrganizations();
	const { isCopied: copiedOrgId, copyToClipboard: copyOrgId } =
		useCopyToClipboard({
			onCopy: () => toast.success("Copied to clipboard"),
		});

	useEffect(() => {
		setName(organization.name);
		setSlug(organization.slug);
	}, [organization.name, organization.slug]);

	const cleanSlug = (value: string) =>
		value
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");

	const handleSlugChange = (value: string) => {
		setSlug(cleanSlug(value));
	};

	const hasChanges = name !== organization.name || slug !== organization.slug;

	const handleSave = () => {
		if (!name.trim()) {
			toast.error("Name is required");
			return;
		}
		if (!slug.trim()) {
			toast.error("Slug is required");
			return;
		}

		setIsSaving(true);
		updateOrganization(
			{
				organizationId: organization.id,
				data: { name: name.trim(), slug: slug.trim() },
			},
			{
				onSuccess: () => {
					setIsSaving(false);
				},
				onError: () => {
					setIsSaving(false);
				},
			}
		);
	};

	return (
		<div className="flex h-full flex-col">
			<TopBar.Breadcrumbs
				items={[
					{ label: "Settings", href: "/organizations/settings" },
					{ label: "General" },
				]}
			/>
			{hasChanges && (
				<TopBar.Actions>
					<Button
						keyboard={{
							display: "⌘S",
							trigger: (e) => (e.metaKey || e.ctrlKey) && e.key === "s",
							callback: handleSave,
						}}
						loading={isSaving}
						onClick={handleSave}
						size="sm"
					>
						<FloppyDiskIcon className="size-4 shrink-0" />
						Save Changes
					</Button>
				</TopBar.Actions>
			)}

			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-2xl space-y-5 p-5">
					<Card>
						<Card.Header>
							<Card.Title>Avatar</Card.Title>
							<Card.Description>
								Customize your organization avatar
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<OrganizationAvatarEditor organization={organization} />
						</Card.Content>
					</Card>

					<Card id="details">
						<Card.Header>
							<Card.Title>Details</Card.Title>
							<Card.Description>
								Name, slug, and organization identifier
							</Card.Description>
						</Card.Header>
						<Card.Content className="space-y-5">
							<div className="flex items-center gap-3 rounded bg-secondary px-4 py-3">
								<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent">
									<IdBadgeIcon className="size-4 text-muted-foreground" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="font-semibold text-foreground text-xs">
										Organization ID
									</p>
									<p className="truncate font-mono text-muted-foreground text-xs">
										{organization.id}
									</p>
								</div>
								<Button
									onClick={() => copyOrgId(organization.id)}
									size="sm"
									variant={copiedOrgId ? "primary" : "ghost"}
								>
									{copiedOrgId ? (
										<CheckIcon className="size-4 shrink-0" />
									) : (
										<CopyIcon className="size-4 shrink-0" />
									)}
									{copiedOrgId ? "Copied" : "Copy"}
								</Button>
							</div>

							<div className="grid gap-5 sm:grid-cols-2">
								<Field>
									<Field.Label>Name</Field.Label>
									<Input
										onChange={(e) => setName(e.target.value)}
										placeholder="e.g., Acme Corporation"
										value={name}
									/>
									<Field.Description>
										Display name for your organization
									</Field.Description>
								</Field>

								<Field>
									<Field.Label>Slug</Field.Label>
									<Input
										onChange={(e) => handleSlugChange(e.target.value)}
										placeholder="e.g., acme-corp"
										value={slug}
									/>
									<Field.Description>
										Used in URLs:{" "}
										<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground text-xs">
											/{slug}
										</code>
									</Field.Description>
								</Field>
							</div>
						</Card.Content>
					</Card>

					<WorkspaceWebsitesSection organization={organization} />

					<ApiKeysSection organization={organization} />

					<DestructiveActionsSection organization={organization} />
				</div>
			</div>
		</div>
	);
}
