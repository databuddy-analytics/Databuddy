"use client";

import { RESERVED_STATUS_PAGE_SLUGS } from "@databuddy/shared/uptime";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	MAX_UPLOAD_BYTES,
	UPLOAD_CONTENT_TYPES,
} from "@databuddy/shared/uploads";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import type { StatusPage } from "@/components/status-pages/status-page-row";
import { orpc } from "@/lib/orpc";
import {
	Button,
	Divider,
	Field,
	Input,
	SegmentedControl,
	Textarea,
} from "@databuddy/ui";
import { Sheet } from "@databuddy/ui/client";

const HTTPS_URL_REGEX = /^https:\/\/.+/;

const UPLOAD_ACCEPT = UPLOAD_CONTENT_TYPES.join(",");

const ASSET_FIELDS = {
	logo: { label: "Logo", field: "logoUrl" },
	favicon: { label: "Favicon", field: "faviconUrl" },
} as const;

type AssetKind = keyof typeof ASSET_FIELDS;

function AssetUploadButton({
	busy,
	onPickAction,
	uploading,
}: {
	busy: boolean;
	onPickAction: (file: File) => void;
	uploading: boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);

	return (
		<>
			{/* policy-ignore dashboard/no-raw-interactive-html: a hidden native file input is the only way to open the OS file picker; @databuddy/ui has no file input component */}
			<input
				accept={UPLOAD_ACCEPT}
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) {
						onPickAction(file);
					}
				}}
				ref={inputRef}
				type="file"
			/>
			<Button
				disabled={busy}
				onClick={() => inputRef.current?.click()}
				size="sm"
				type="button"
				variant="secondary"
			>
				{uploading ? "Uploading" : "Upload"}
			</Button>
		</>
	);
}

const optionalHttpsUrl = z
	.string()
	.refine(
		(v) => v === "" || HTTPS_URL_REGEX.test(v),
		"Must start with https://"
	);

const URL_FIELDS = [
	{
		name: "logoUrl",
		label: "Logo",
		placeholder: "https://example.com/logo.svg",
		asset: "logo",
		description:
			"Displayed in the navbar and page header. Upload a file or paste an https URL.",
	},
	{
		name: "faviconUrl",
		label: "Favicon",
		placeholder: "https://example.com/favicon.ico",
		asset: "favicon",
		description: null,
	},
	{
		name: "websiteUrl",
		label: "Website URL",
		placeholder: "https://example.com",
		asset: null,
		description: "Logo and name link to this URL",
	},
	{
		name: "supportUrl",
		label: "Support URL",
		placeholder: "https://example.com/support",
		asset: null,
		description: 'Shown as a "Get Support" link in the navbar',
	},
] as const;

const statusPageFormSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(120, "Name must be 120 characters or fewer"),
	slug: z
		.string()
		.min(1, "Slug is required")
		.max(100, "Slug must be 100 characters or fewer")
		.regex(
			/^[a-z0-9-]+$/,
			"Slug must only contain lowercase letters, numbers, and dashes"
		)
		.refine(
			(slug) => !RESERVED_STATUS_PAGE_SLUGS.has(slug),
			"This slug is reserved"
		),
	description: z
		.string()
		.max(500, "Description must be 500 characters or fewer")
		.optional(),
	logoUrl: optionalHttpsUrl,
	faviconUrl: optionalHttpsUrl,
	websiteUrl: optionalHttpsUrl,
	supportUrl: optionalHttpsUrl,
	theme: z.enum(["system", "light", "dark"]),
});

type StatusPageFormData = z.infer<typeof statusPageFormSchema>;

const themeOptions = [
	{ value: "system" as const, label: "System" },
	{ value: "light" as const, label: "Light" },
	{ value: "dark" as const, label: "Dark" },
];

interface StatusPageSheetProps {
	onCloseAction: (open: boolean) => void;
	onSaveAction?: () => void;
	open: boolean;
	statusPage?: Pick<
		StatusPage,
		| "description"
		| "faviconUrl"
		| "id"
		| "logoUrl"
		| "name"
		| "slug"
		| "supportUrl"
		| "theme"
		| "websiteUrl"
	> | null;
}

export function StatusPageSheet({
	open,
	onCloseAction,
	onSaveAction,
	statusPage,
}: StatusPageSheetProps) {
	const isEditing = !!statusPage;
	const { activeOrganizationId, activeOrganization } =
		useOrganizationsContext();

	const form = useForm<StatusPageFormData>({
		resolver: zodResolver(statusPageFormSchema),
		defaultValues: buildDefaults(statusPage),
	});

	useEffect(() => {
		if (open) {
			form.reset(buildDefaults(statusPage));
		}
	}, [open, statusPage, form]);

	const uploadUrlMutation = useMutation(
		orpc.statusPage.createAssetUploadUrl.mutationOptions()
	);
	const [uploading, setUploading] = useState<AssetKind | null>(null);
	const organizationId = activeOrganization?.id ?? activeOrganizationId ?? null;

	const uploadAsset = async (asset: AssetKind, file: File) => {
		if (!organizationId) {
			toast.error("No active organization selected");
			return;
		}

		const contentType = UPLOAD_CONTENT_TYPES.find((type) => type === file.type);

		if (!contentType) {
			toast.error("Unsupported file type. Use PNG, JPEG, WebP, or ICO.");
			return;
		}

		if (file.size > MAX_UPLOAD_BYTES) {
			toast.error("File is too large. The limit is 2 MB.");
			return;
		}

		const { label, field } = ASSET_FIELDS[asset];

		setUploading(asset);
		try {
			const { publicUrl, uploadUrl } = await uploadUrlMutation.mutateAsync({
				asset,
				contentLength: file.size,
				contentType,
				organizationId,
			});

			const response = await fetch(uploadUrl, {
				body: file,
				headers: { "Content-Type": contentType },
				method: "PUT",
			}).catch(() => null);

			if (!response?.ok) {
				toast.error("Upload failed, try again");
				return;
			}

			form.setValue(field, publicUrl, {
				shouldDirty: true,
				shouldValidate: true,
			});
			toast.success(`${label} uploaded`);
		} catch {
		} finally {
			setUploading(null);
		}
	};

	const createMutation = useMutation(orpc.statusPage.create.mutationOptions());
	const updateMutation = useMutation(orpc.statusPage.update.mutationOptions());

	const handleSubmit = async () => {
		const data = form.getValues();
		const details = {
			name: data.name,
			slug: data.slug,
			description: data.description,
			logoUrl: urlOrNull(data.logoUrl),
			faviconUrl: urlOrNull(data.faviconUrl),
			websiteUrl: urlOrNull(data.websiteUrl),
			supportUrl: urlOrNull(data.supportUrl),
			theme: data.theme,
		};

		try {
			if (statusPage) {
				await updateMutation.mutateAsync({
					statusPageId: statusPage.id,
					...details,
				});
			} else {
				if (!organizationId) {
					toast.error("No active organization selected");
					return;
				}
				await createMutation.mutateAsync({ organizationId, ...details });
			}
			toast.success(`Status page ${statusPage ? "updated" : "created"}`);
			onSaveAction?.();
			onCloseAction(false);
		} catch {}
	};

	const isPending = createMutation.isPending || updateMutation.isPending;

	return (
		<Sheet onOpenChange={onCloseAction} open={open}>
			<Sheet.Content className="w-full sm:max-w-md">
				<Sheet.Close />
				<Sheet.Header>
					<Sheet.Title>
						{isEditing ? "Edit Status Page" : "Create Status Page"}
					</Sheet.Title>
					<Sheet.Description>
						{isEditing
							? "Update your status page details and appearance"
							: "Set up a new public status page"}
					</Sheet.Description>
				</Sheet.Header>

				<form
					className="flex flex-1 flex-col overflow-hidden"
					onSubmit={form.handleSubmit(handleSubmit)}
				>
					<Sheet.Body className="space-y-5">
						<div className="space-y-4">
							<Controller
								control={form.control}
								name="name"
								render={({ field, fieldState }) => (
									<Field error={!!fieldState.error}>
										<Field.Label>Name</Field.Label>
										<Input placeholder="e.g. Acme Systems" {...field} />
										{fieldState.error && (
											<Field.Error>{fieldState.error.message}</Field.Error>
										)}
									</Field>
								)}
							/>

							<Controller
								control={form.control}
								name="slug"
								render={({ field, fieldState }) => (
									<Field error={!!fieldState.error}>
										<Field.Label>Slug</Field.Label>
										<Input placeholder="e.g. acme-systems" {...field} />
										<Field.Description>
											URL path for your status page
										</Field.Description>
										{fieldState.error && (
											<Field.Error>{fieldState.error.message}</Field.Error>
										)}
									</Field>
								)}
							/>

							<Controller
								control={form.control}
								name="description"
								render={({ field }) => (
									<Field>
										<Field.Label>Description</Field.Label>
										<Textarea
											placeholder="e.g. Real-time status for our core services."
											{...field}
										/>
									</Field>
								)}
							/>
						</div>

						<Divider />

						<div className="space-y-4">
							<div className="space-y-0.5">
								<p className="font-medium text-sm">Branding</p>
								<p className="text-muted-foreground text-xs">
									Customize how your status page looks to visitors
								</p>
							</div>

							{URL_FIELDS.map(
								({ name, label, placeholder, asset, description }) => (
									<Controller
										control={form.control}
										key={name}
										name={name}
										render={({ field, fieldState }) => (
											<Field error={!!fieldState.error}>
												<Field.Label>{label}</Field.Label>
												{asset ? (
													<div className="flex items-center gap-2">
														<Input placeholder={placeholder} {...field} />
														<AssetUploadButton
															busy={uploading !== null}
															onPickAction={(file) => uploadAsset(asset, file)}
															uploading={uploading === asset}
														/>
													</div>
												) : (
													<Input placeholder={placeholder} {...field} />
												)}
												{description && (
													<Field.Description>{description}</Field.Description>
												)}
												{fieldState.error && (
													<Field.Error>{fieldState.error.message}</Field.Error>
												)}
											</Field>
										)}
									/>
								)
							)}
						</div>

						<Divider />

						<div className="space-y-4">
							<div className="space-y-0.5">
								<p className="font-medium text-sm">Appearance</p>
								<p className="text-muted-foreground text-xs">
									Choose how the public page follows visitor preferences
								</p>
							</div>

							<Controller
								control={form.control}
								name="theme"
								render={({ field }) => (
									<Field>
										<Field.Label>Theme</Field.Label>
										<SegmentedControl
											className="w-full"
											onChange={field.onChange}
											options={themeOptions}
											value={field.value}
										/>
									</Field>
								)}
							/>
						</div>
					</Sheet.Body>

					<Sheet.Footer>
						<Button
							onClick={() => onCloseAction(false)}
							type="button"
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							className="min-w-28"
							disabled={!form.formState.isValid}
							loading={isPending}
							type="submit"
						>
							{isEditing ? "Update" : "Create"}
						</Button>
					</Sheet.Footer>
				</form>
			</Sheet.Content>
		</Sheet>
	);
}

function urlOrNull(value: string | undefined) {
	return value && value.trim() !== "" ? value : null;
}

function buildDefaults(
	sp: StatusPageSheetProps["statusPage"]
): StatusPageFormData {
	return {
		name: sp?.name ?? "",
		slug: sp?.slug ?? "",
		description: sp?.description ?? "",
		logoUrl: sp?.logoUrl ?? "",
		faviconUrl: sp?.faviconUrl ?? "",
		websiteUrl: sp?.websiteUrl ?? "",
		supportUrl: sp?.supportUrl ?? "",
		theme: statusPageFormSchema.shape.theme.catch("system").parse(sp?.theme),
	};
}
