"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrganizations } from "@/hooks/use-organizations";
import { BuildingsIcon } from "@databuddy/ui/icons";
import { Button, Field, Input } from "@databuddy/ui";
import { Sheet } from "@databuddy/ui/client";

const SLUG_ALLOWED_REGEX = /^[a-z0-9-]+$/;
const REGEX_NON_SLUG_NAME_CHARS = /[^a-z0-9\s-]/g;
const REGEX_SPACES_TO_DASH = /\s+/g;
const REGEX_MULTI_DASH = /-+/g;
const REGEX_TRIM_DASH = /^-+|-+$/g;
const REGEX_INVALID_SLUG_CHARS = /[^a-z0-9-]/g;

interface CreateOrganizationDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

export function CreateOrganizationDialog({
	isOpen,
	onClose,
}: CreateOrganizationDialogProps) {
	const { createOrganization, isCreatingOrganization, setActiveOrganization } =
		useOrganizations();

	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
	const [touchedFields, setTouchedFields] = useState({
		name: false,
		slug: false,
	});

	useEffect(() => {
		if (!(slugManuallyEdited && slug)) {
			const generatedSlug = name
				.toLowerCase()
				.replace(REGEX_NON_SLUG_NAME_CHARS, "")
				.replace(REGEX_SPACES_TO_DASH, "-")
				.replace(REGEX_MULTI_DASH, "-")
				.replace(REGEX_TRIM_DASH, "");
			setSlug(generatedSlug);
		}
	}, [name, slug, slugManuallyEdited]);

	const resetForm = () => {
		setName("");
		setSlug("");
		setSlugManuallyEdited(false);
		setTouchedFields({ name: false, slug: false });
	};

	const handleClose = () => {
		onClose();
		resetForm();
	};

	const handleSlugChange = (value: string) => {
		setSlugManuallyEdited(true);
		const cleanSlug = value
			.toLowerCase()
			.replace(REGEX_INVALID_SLUG_CHARS, "")
			.replace(REGEX_MULTI_DASH, "-")
			.replace(REGEX_TRIM_DASH, "");
		setSlug(cleanSlug);
		if (cleanSlug === "") {
			setSlugManuallyEdited(false);
		}
	};

	const isFormValid = useMemo(
		() =>
			name.trim().length >= 2 &&
			slug.trim().length >= 2 &&
			SLUG_ALLOWED_REGEX.test(slug),
		[name, slug]
	);

	const handleSubmit = () => {
		if (!isFormValid) {
			return;
		}

		createOrganization(
			{
				name: name.trim(),
				slug: slug.trim(),
				metadata: {},
			},
			{
				onSuccess: (organization) => {
					if (organization?.id) {
						setActiveOrganization(organization.id);
					}
					handleClose();
				},
			}
		);
	};

	return (
		<Sheet onOpenChange={handleClose} open={isOpen}>
			<Sheet.Content className="sm:max-w-lg" side="right">
				<Sheet.Header>
					<div className="flex items-center gap-4">
						<div className="flex h-11 w-11 items-center justify-center rounded border bg-secondary-brighter">
							<BuildingsIcon className="size-[22px] text-accent-foreground" />
						</div>
						<div>
							<Sheet.Title className="text-lg">
								Create New Organization
							</Sheet.Title>
							<Sheet.Description>
								Set up a new organization to collaborate with your team
							</Sheet.Description>
						</div>
					</div>
				</Sheet.Header>

				<Sheet.Close />

				<Sheet.Body className="space-y-6">
					<div className="space-y-2">
						<Field.Label htmlFor="org-name">Organization Name</Field.Label>
						{(() => {
							const isNameValid = name.trim().length >= 2;
							const hasUserTyped = name.length > 0;
							const shouldShowError =
								(touchedFields.name || hasUserTyped) && !isNameValid;
							return (
								<Input
									aria-invalid={shouldShowError}
									id="org-name"
									maxLength={100}
									onBlur={() =>
										setTouchedFields((prev) => ({ ...prev, name: true }))
									}
									onChange={(e) => setName(e.target.value)}
									placeholder="e.g., Acme Corporation"
									value={name}
								/>
							);
						})()}
					</div>

					<div className="space-y-2">
						<Field.Label htmlFor="org-slug">Organization Slug</Field.Label>
						{(() => {
							const isSlugValid =
								SLUG_ALLOWED_REGEX.test(slug) && slug.trim().length >= 2;
							const hasUserTyped = slug.length > 0;
							const shouldShowError =
								(touchedFields.slug || hasUserTyped) && !isSlugValid;
							return (
								<>
									<Input
										aria-describedby="org-slug-help"
										aria-invalid={shouldShowError}
										id="org-slug"
										maxLength={50}
										onBlur={() =>
											setTouchedFields((prev) => ({ ...prev, slug: true }))
										}
										onChange={(e) => handleSlugChange(e.target.value)}
										placeholder="e.g., acme-corp"
										value={slug}
									/>
									<p
										className="text-muted-foreground text-xs"
										id="org-slug-help"
									>
										Used in URLs and must be unique. Only lowercase letters,
										numbers, and hyphens allowed.
									</p>
								</>
							);
						})()}
					</div>
				</Sheet.Body>

				<Sheet.Footer>
					<Button onClick={handleClose} type="button" variant="secondary">
						Cancel
					</Button>
					<Button
						disabled={!isFormValid}
						loading={isCreatingOrganization}
						onClick={handleSubmit}
						type="button"
					>
						<BuildingsIcon className="size-4" />
						Create Organization
					</Button>
				</Sheet.Footer>
			</Sheet.Content>
		</Sheet>
	);
}
