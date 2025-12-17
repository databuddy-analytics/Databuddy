"use client";

import { BuildingsIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { RightSidebar } from "@/components/right-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Organization, useOrganizations } from "@/hooks/use-organizations";
import { OrganizationLogoUploader } from "./organization-logo-uploader";

export function GeneralSettings({
	organization,
}: {
	organization: Organization;
}) {
	const [name, setName] = useState(organization.name);
	const [slug, setSlug] = useState(organization.slug);
	const [isSaving, setIsSaving] = useState(false);

	const { updateOrganizationAsync } = useOrganizations();

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

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error("Name is required");
			return;
		}
		if (!slug.trim()) {
			toast.error("Slug is required");
			return;
		}

		setIsSaving(true);
		try {
			await updateOrganizationAsync({
				organizationId: organization.id,
				data: { name: name.trim(), slug: slug.trim() },
			});
			toast.success("Settings updated");
		} catch {
			toast.error("Failed to update settings");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			{/* Main Content */}
			<div className="flex flex-col border-b lg:border-b-0">
				<div className="flex-1 overflow-y-auto">
					{/* Logo Section */}
					<section className="border-b px-5 py-6">
						<div className="mb-4">
							<h3 className="font-semibold text-sm">Organization Logo</h3>
							<p className="text-muted-foreground text-xs">
								Upload a logo to represent your organization
							</p>
						</div>
						<OrganizationLogoUploader organization={organization} />
					</section>

					{/* Organization Details */}
					<section className="border-b px-5 py-6">
						<div className="mb-4">
							<h3 className="font-semibold text-sm">Organization Details</h3>
							<p className="text-muted-foreground text-xs">
								Manage your organization's basic information and identifier
							</p>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="name">Organization Name</Label>
								<Input
									id="name"
									onChange={(e) => setName(e.target.value)}
									placeholder="e.g., Acme Corporation"
									value={name}
								/>
								<p className="text-muted-foreground text-xs">
									The display name for your organization
								</p>
							</div>
							<div className="space-y-2">
								<Label htmlFor="slug">Organization Slug</Label>
								<Input
									id="slug"
									onChange={(e) => handleSlugChange(e.target.value)}
									placeholder="e.g., acme-corp"
									value={slug}
								/>
								<p className="text-muted-foreground text-xs">
									Used in URLs:{" "}
									<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground text-xs">
										/{slug}
									</code>
								</p>
							</div>
						</div>
					</section>
				</div>

				{/* Save Footer */}
				{hasChanges && (
					<div className="angled-rectangle-gradient flex shrink-0 items-center justify-between border-t bg-secondary px-5 py-4">
						<p className="text-muted-foreground text-sm">
							You have unsaved changes
						</p>
						<Button disabled={isSaving} onClick={handleSave} size="sm">
							{isSaving ? (
								<>
									<div className="mr-2 size-3 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
									Saving…
								</>
							) : (
								<>
									<FloppyDiskIcon className="mr-2" size={14} />
									Save Changes
								</>
							)}
						</Button>
					</div>
				)}
			</div>

			{/* Sidebar */}
			<RightSidebar className="gap-4 p-5">
				<RightSidebar.InfoCard
					description={`/${organization.slug}`}
					icon={BuildingsIcon}
					title={organization.name}
				/>
				<RightSidebar.DocsLink />
				<RightSidebar.Tip description="The slug is used in URLs and API requests. Keep it short and memorable." />
			</RightSidebar>
		</div>
	);
}
