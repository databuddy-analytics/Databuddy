"use client";

import { BookOpenIcon, BuildingsIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Organization, useOrganizations } from "@/hooks/use-organizations";
import { OrganizationLogoUploader } from "./organization-logo-uploader";

interface GeneralSettingsProps {
	organization: Organization;
}

export function GeneralSettings({ organization }: GeneralSettingsProps) {
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
			<div className="flex flex-col border-b lg:border-b-0 lg:border-r">
				<div className="flex-1 space-y-6 p-5">
					{/* Logo Section */}
					<OrganizationLogoUploader organization={organization} />

					{/* Name & Slug */}
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								onChange={(e) => setName(e.target.value)}
								placeholder="Organization name…"
								value={name}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="slug">Slug</Label>
							<Input
								id="slug"
								onChange={(e) => handleSlugChange(e.target.value)}
								placeholder="organization-slug…"
								value={slug}
							/>
							<p className="text-muted-foreground text-xs">
								Used in URLs: /{slug}
							</p>
						</div>
					</div>
				</div>

				{/* Save Footer */}
				{hasChanges && (
					<div className="flex items-center justify-between border-t bg-muted/30 px-5 py-3">
						<p className="text-muted-foreground text-sm">You have unsaved changes</p>
						<Button disabled={isSaving} onClick={handleSave} size="sm">
							{isSaving ? (
								<>
									<div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
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
			<aside className="flex flex-col gap-4 bg-muted/30 p-5">
				{/* Org Info Card */}
				<div className="flex items-center gap-3 rounded border bg-background p-4">
					<div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
						<BuildingsIcon className="text-primary" size={20} weight="duotone" />
					</div>
					<div className="min-w-0">
						<p className="truncate font-semibold">{organization.name}</p>
						<p className="truncate text-muted-foreground text-sm">
							/{organization.slug}
						</p>
					</div>
				</div>

				{/* Docs Link */}
				<Button asChild className="w-full justify-start" variant="outline">
					<a
						href="https://www.databuddy.cc/docs/getting-started"
						rel="noopener noreferrer"
						target="_blank"
					>
						<BookOpenIcon className="mr-2" size={16} />
						Documentation
					</a>
				</Button>

				{/* Tip */}
				<div className="mt-auto rounded border border-dashed bg-background/50 p-4">
					<p className="mb-2 font-medium text-sm">Quick tip</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						The slug is used in URLs and API requests. Keep it short and
						memorable.
					</p>
				</div>
			</aside>
		</div>
	);
}
