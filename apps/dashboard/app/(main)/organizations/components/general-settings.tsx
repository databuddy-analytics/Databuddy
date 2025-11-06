"use client";

import { FloppyDiskIcon } from "@phosphor-icons/react";
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

	const handleSave = async () => {
		if (!(name.trim() && slug.trim())) {
			toast.error("Name and slug are required");
			return;
		}

		setIsSaving(true);
		try {
			await updateOrganizationAsync({
				organizationId: organization.id,
				data: {
					name: name.trim(),
					slug: slug.trim(),
				},
			});

			toast.success("Organization updated successfully");

			// If slug changed, we might need to update the URL context
			// but since we're using active organization, this should be handled automatically
		} catch (_error) {
			toast.error("Failed to update organization");
		} finally {
			setIsSaving(false);
		}
	};

	const hasChanges = name !== organization.name || slug !== organization.slug;

	return (
		<div className="h-full p-4 sm:p-6">
			<div className="space-y-6 sm:space-y-8">
				{/* Content Sections */}
				<div className="space-y-6 sm:space-y-8">
					{/* Logo Upload Section */}
					<div className="rounded border bg-card p-4 sm:p-6">
						<div className="space-y-3 sm:space-y-4">
							<div>
								<h3 className="font-semibold text-base sm:text-lg">
									Organization Logo
								</h3>
								<p className="text-muted-foreground text-xs sm:text-sm">
									Upload a logo to represent your organization
								</p>
							</div>
							<OrganizationLogoUploader organization={organization} />
						</div>
					</div>

					{/* Name and Slug Section */}
					<div className="rounded border bg-card p-4 sm:p-6">
						<div className="space-y-4 sm:space-y-6">
							<div>
								<h3 className="font-semibold text-base sm:text-lg">
									Basic Information
								</h3>
								<p className="text-muted-foreground text-xs sm:text-sm">
									Configure your organization's name and URL identifier
								</p>
							</div>

							<div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
								<div className="space-y-2 sm:space-y-3">
									<Label
										className="font-medium text-xs sm:text-sm"
										htmlFor="name"
									>
										Organization Name
									</Label>
									<Input
										id="name"
										onChange={(e) => setName(e.target.value)}
										placeholder="Enter organization name"
										value={name}
									/>
								</div>
								<div className="space-y-2 sm:space-y-3">
									<Label
										className="font-medium text-xs sm:text-sm"
										htmlFor="slug"
									>
										Organization Slug
									</Label>
									<Input
										id="slug"
										onChange={(e) => handleSlugChange(e.target.value)}
										placeholder="organization-slug"
										value={slug}
									/>
									<p className="text-muted-foreground text-xs">
										This will be used in your organization URL
									</p>
								</div>
							</div>

							{/* Save Button */}
							{hasChanges && (
								<div className="flex justify-end border-t pt-3 sm:pt-4">
									<Button
										className="px-4 text-xs sm:px-6 sm:text-sm"
										disabled={isSaving}
										onClick={handleSave}
									>
										{isSaving ? (
											<>
												<div className="mr-2 h-3 w-3 animate-spin rounded-full border border-primary-foreground/30 border-t-primary-foreground sm:h-4 sm:w-4" />
												Saving...
											</>
										) : (
											<>
												<FloppyDiskIcon
													className="mr-2 h-3 w-3 sm:h-4 sm:w-4"
													size={12}
												/>
												Save Changes
											</>
										)}
									</Button>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
