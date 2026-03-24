"use client";

import { BuildingsIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useOrganizations } from "@/hooks/use-organizations";

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
			<SheetContent className="sm:max-w-lg" side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div className="flex h-11 w-11 items-center justify-center rounded border bg-secondary-brighter">
							<BuildingsIcon
								className="text-accent-foreground"
								size={22}
								weight="fill"
							/>
						</div>
						<div>
							<SheetTitle className="text-lg">
								Create New Organization
							</SheetTitle>
							<SheetDescription>
								Set up a new organization to collaborate with your team
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<SheetBody className="space-y-6">
					{/* Organization Name */}
					<div className="space-y-2">
						<Label className="font-medium" htmlFor="org-name">
							Organization Name
						</Label>
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

					{/* Organization Slug */}
					<div className="space-y-2">
						<Label className="font-medium" htmlFor="org-slug">
							Organization Slug
						</Label>
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
				</SheetBody>

				<SheetFooter>
					<Button
						disabled={isCreatingOrganization}
						onClick={handleClose}
						type="button"
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={!isFormValid || isCreatingOrganization}
						onClick={handleSubmit}
						type="button"
					>
						{isCreatingOrganization ? (
							"Creating..."
						) : (
							<>
								<BuildingsIcon className="mr-2" size={16} />
								Create Organization
							</>
						)}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
