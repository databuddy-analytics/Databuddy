"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
	type Link,
	useCreateLink,
	useLinkFolders,
	useUpdateLink,
} from "@/hooks/use-links";
import { LINKS_BASE_URL, LINKS_FULL_URL } from "./link-constants";
import type { LinkFormData } from "./link-form-schema";
import { linkFormSchema } from "./link-form-schema";
import { LinkQrCode } from "./link-qr-code";
import {
	buildLinkPayload,
	mapLinkApiError,
	normalizeUrlInput,
	stripProtocol,
} from "./link-utils";
import { type OgData, OgPreview } from "./og-preview";
import { ExpirationPicker } from "./expiration-picker";
import {
	type UtmParams,
	UtmBuilder,
	parseUtmFromUrl,
	stripUtmFromUrl,
} from "./utm-builder";
import {
	CalendarIcon,
	CopyIcon,
	DeviceMobileIcon,
	ImageIcon,
	LinkIcon as LinkSimpleIcon,
	QrCodeIcon,
} from "@databuddy/ui/icons";
import { FolderDropdown } from "./folder-dropdown";
import { Accordion, Sheet, Tabs } from "@databuddy/ui/client";
import { Button, Divider, Field, Input, Text, dayjs } from "@databuddy/ui";

const DEFAULT_UTM_PARAMS: UtmParams = {
	utm_source: "",
	utm_medium: "",
	utm_campaign: "",
	utm_content: "",
	utm_term: "",
};

const DEFAULT_OG_DATA: OgData = {
	ogTitle: "",
	ogDescription: "",
	ogImageUrl: "",
	ogVideoUrl: "",
};

interface LinkSheetProps {
	link?: Link | null;
	onOpenChange: (open: boolean) => void;
	onSave?: (link: Link) => void;
	open: boolean;
}

function LinkSheetInner({ open, onOpenChange, link, onSave }: LinkSheetProps) {
	const isEditing = !!link;
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();

	const createLinkMutation = useCreateLink();
	const updateLinkMutation = useUpdateLink();
	const { folders, isLoading: foldersLoading } = useLinkFolders();

	const [utmParams, setUtmParams] = useState<UtmParams>(DEFAULT_UTM_PARAMS);
	const [ogData, setOgData] = useState<OgData>(DEFAULT_OG_DATA);
	const [useCustomOg, setUseCustomOg] = useState(false);

	const form = useForm<LinkFormData>({
		resolver: zodResolver(linkFormSchema),
		mode: "onChange",
		defaultValues: {
			name: "",
			targetUrl: "",
			slug: "",
			folderId: "",
			expiresAt: "",
			expiredRedirectUrl: "",
			iosUrl: "",
			androidUrl: "",
			externalId: "",
		},
	});

	const resetForm = useCallback(
		(linkData: Link | null | undefined) => {
			if (linkData) {
				const targetUrl = stripProtocol(linkData.targetUrl);
				const parsedUtm = parseUtmFromUrl(targetUrl);
				setUtmParams(parsedUtm);
				const urlWithoutUtm = stripUtmFromUrl(targetUrl);

				const hasCustomOg =
					linkData.ogTitle ?? linkData.ogDescription ?? linkData.ogImageUrl;
				setUseCustomOg(!!hasCustomOg);
				setOgData({
					ogTitle: linkData.ogTitle ?? "",
					ogDescription: linkData.ogDescription ?? "",
					ogImageUrl: linkData.ogImageUrl ?? "",
					ogVideoUrl: linkData.ogVideoUrl ?? "",
				});

				form.reset({
					name: linkData.name,
					targetUrl: urlWithoutUtm,
					slug: linkData.slug,
					folderId: linkData.folderId ?? "",
					expiresAt: linkData.expiresAt
						? dayjs(linkData.expiresAt).format("YYYY-MM-DDTHH:mm")
						: "",
					expiredRedirectUrl: stripProtocol(linkData.expiredRedirectUrl),
					iosUrl: stripProtocol(linkData.iosUrl),
					androidUrl: stripProtocol(linkData.androidUrl),
					externalId: linkData.externalId ?? "",
				});
			} else {
				form.reset({
					name: "",
					targetUrl: "",
					slug: "",
					folderId: "",
					expiresAt: "",
					expiredRedirectUrl: "",
					iosUrl: "",
					androidUrl: "",
					externalId: "",
				});
				setUtmParams(DEFAULT_UTM_PARAMS);
				setOgData(DEFAULT_OG_DATA);
				setUseCustomOg(false);
			}
		},
		[form]
	);

	const linkRef = useRef(link);
	linkRef.current = link;

	useLayoutEffect(() => {
		if (!open) {
			return;
		}
		resetForm(linkRef.current);
	}, [open, link?.id, resetForm]);

	const handleOpenChange = useCallback(
		(isOpen: boolean) => {
			onOpenChange(isOpen);
		},
		[onOpenChange]
	);

	const targetUrlValue = form.watch("targetUrl");

	const fullTargetUrl = useMemo(() => {
		if (!targetUrlValue) {
			return "";
		}
		return targetUrlValue.startsWith("http")
			? targetUrlValue
			: `https://${targetUrlValue}`;
	}, [targetUrlValue]);

	const handleSubmit: SubmitHandler<LinkFormData> = async (formData) => {
		const resolvedOrganizationId =
			activeOrganization?.id ?? activeOrganizationId ?? null;

		const payload = buildLinkPayload({
			formData,
			utmParams,
			ogData,
			useCustomOg,
		});

		try {
			if (link?.id) {
				const result = await updateLinkMutation.mutateAsync({
					id: link.id,
					name: payload.name,
					targetUrl: payload.targetUrl,
					slug: payload.slug,
					folderId: payload.folderId,
					expiresAt: payload.expiresAtString,
					expiredRedirectUrl: payload.expiredRedirectUrl,
					ogTitle: payload.ogTitle,
					ogDescription: payload.ogDescription,
					ogImageUrl: payload.ogImageUrl,
					ogVideoUrl: payload.ogVideoUrl,
					iosUrl: payload.iosUrl,
					androidUrl: payload.androidUrl,
					externalId: payload.externalId ?? null,
				});
				onSave?.(result);
				toast.success("Link updated");
			} else {
				const result = await createLinkMutation.mutateAsync({
					...(resolvedOrganizationId
						? { organizationId: resolvedOrganizationId }
						: {}),
					name: payload.name,
					targetUrl: payload.targetUrl,
					slug: payload.slug,
					folderId: payload.folderId,
					expiresAt: payload.expiresAtDate,
					expiredRedirectUrl: payload.expiredRedirectUrl,
					ogTitle: payload.ogTitle,
					ogDescription: payload.ogDescription,
					ogImageUrl: payload.ogImageUrl,
					ogVideoUrl: payload.ogVideoUrl,
					iosUrl: payload.iosUrl,
					androidUrl: payload.androidUrl,
					externalId: payload.externalId ?? null,
				});
				onSave?.(result);
				toast.success("Link created");
			}
			onOpenChange(false);
		} catch (error: unknown) {
			toast.error(mapLinkApiError(error, !!link?.id));
		}
	};

	const { copyToClipboard } = useCopyToClipboard({
		onCopy: () => toast.success("Copied to clipboard"),
	});

	const isPending =
		createLinkMutation.isPending || updateLinkMutation.isPending;
	const { isValid, isDirty } = form.formState;

	const expiresAtValue = form.watch("expiresAt");
	const iosUrlValue = form.watch("iosUrl");
	const androidUrlValue = form.watch("androidUrl");

	const hasExpiration = !!expiresAtValue;
	const deviceTargetingCount = [iosUrlValue, androidUrlValue].filter((v) =>
		v?.trim()
	).length;
	const utmCount = Object.values(utmParams).filter((v) => v?.trim()).length;

	const formContent = (
		<Sheet.Body className="space-y-6">
			{isEditing && link && (
				<>
					<div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2.5">
						<div className="min-w-0 flex-1">
							<Text tone="muted" variant="caption">
								Short URL
							</Text>
							<p className="truncate font-mono text-sm tabular-nums">
								{LINKS_BASE_URL}/{link.slug}
							</p>
						</div>
						<Button
							className="shrink-0"
							onClick={() => copyToClipboard(`${LINKS_FULL_URL}/${link.slug}`)}
							size="sm"
							type="button"
							variant="secondary"
						>
							<CopyIcon className="size-3.5" />
							Copy
						</Button>
					</div>
					<Divider />
				</>
			)}

			<Controller
				control={form.control}
				name="targetUrl"
				render={({ field, fieldState }) => (
					<Field error={!!fieldState.error}>
						<Field.Label>Destination URL</Field.Label>
						<Input
							placeholder="example.com/landing-page…"
							prefix="https://"
							{...field}
							onChange={(e) => {
								field.onChange(normalizeUrlInput(e.target.value));
							}}
						/>
						<Field.Description>
							Where users will be redirected when clicking your link
						</Field.Description>
						{fieldState.error && (
							<Field.Error>{fieldState.error.message}</Field.Error>
						)}
					</Field>
				)}
			/>

			<div className="grid gap-4 sm:grid-cols-2">
				<Controller
					control={form.control}
					name="name"
					render={({ field, fieldState }) => (
						<Field error={!!fieldState.error}>
							<Field.Label>Name</Field.Label>
							<Input placeholder="Marketing Campaign…" {...field} />
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
							<Field.Label>
								Short Link{" "}
								{!isEditing && (
									<span className="text-muted-foreground">(optional)</span>
								)}
							</Field.Label>
							<Input
								disabled={isEditing}
								placeholder={isEditing ? "" : "my-campaign"}
								prefix={`${LINKS_BASE_URL}/`}
								{...field}
								onChange={(e) => {
									field.onChange(e.target.value.replace(/\s/g, "-"));
								}}
							/>
							{fieldState.error && (
								<Field.Error>{fieldState.error.message}</Field.Error>
							)}
						</Field>
					)}
				/>
			</div>

			<Controller
				control={form.control}
				name="folderId"
				render={({ field }) => (
					<Field>
						<Field.Label>Folder</Field.Label>
						<FolderDropdown
							folders={folders}
							isLoading={foldersLoading}
							onChange={field.onChange}
							value={field.value}
						/>
					</Field>
				)}
			/>

			<Controller
				control={form.control}
				name="externalId"
				render={({ field, fieldState }) => (
					<Field error={!!fieldState.error}>
						<Field.Label>
							External ID{" "}
							<span className="text-muted-foreground">(optional)</span>
						</Field.Label>
						<Input
							placeholder="company-123"
							{...field}
							value={field.value ?? ""}
						/>
						<Field.Description>
							Third-party identifier for querying (e.g. company, campaign, or
							partner ID)
						</Field.Description>
						{fieldState.error && (
							<Field.Error>{fieldState.error.message}</Field.Error>
						)}
					</Field>
				)}
			/>

			<Divider />

			<div className="space-y-2">
				<div className="overflow-hidden rounded-md border border-border/60">
					<Accordion>
						<Accordion.Trigger>
							<CalendarIcon
								className="size-4 shrink-0 text-muted-foreground"
								weight="duotone"
							/>
							<Text variant="label">Link Expiration</Text>
							{hasExpiration && (
								<span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
									1
								</span>
							)}
						</Accordion.Trigger>
						<Accordion.Content>
							<div className="space-y-4">
								<Controller
									control={form.control}
									name="expiresAt"
									render={({ field }) => (
										<ExpirationPicker
											onChange={field.onChange}
											value={field.value}
										/>
									)}
								/>
								<Controller
									control={form.control}
									name="expiredRedirectUrl"
									render={({ field, fieldState }) => (
										<Field error={!!fieldState.error}>
											<Field.Label>Redirect URL after expiration</Field.Label>
											<Input
												placeholder="example.com/link-expired…"
												prefix="https://"
												{...field}
												onChange={(e) => {
													field.onChange(stripProtocol(e.target.value.trim()));
												}}
											/>
											<Field.Description>
												Optional fallback page for expired links
											</Field.Description>
											{fieldState.error && (
												<Field.Error>{fieldState.error.message}</Field.Error>
											)}
										</Field>
									)}
								/>
							</div>
						</Accordion.Content>
					</Accordion>
				</div>

				<div className="overflow-hidden rounded-md border border-border/60">
					<Accordion>
						<Accordion.Trigger>
							<DeviceMobileIcon
								className="size-4 shrink-0 text-muted-foreground"
								weight="duotone"
							/>
							<Text variant="label">Device Targeting</Text>
							{deviceTargetingCount > 0 && (
								<span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
									{deviceTargetingCount}
								</span>
							)}
						</Accordion.Trigger>
						<Accordion.Content>
							<div className="space-y-4">
								<Text tone="muted" variant="caption">
									Redirect mobile users to device-specific URLs like app stores
								</Text>
								<div className="grid gap-4 sm:grid-cols-2">
									<Controller
										control={form.control}
										name="iosUrl"
										render={({ field, fieldState }) => (
											<Field error={!!fieldState.error}>
												<Field.Label className="flex items-center gap-1.5">
													<DeviceMobileIcon size={14} weight="fill" />
													iOS URL
												</Field.Label>
												<Input
													placeholder="apps.apple.com/app/…"
													prefix="https://"
													{...field}
													onChange={(e) => {
														field.onChange(
															stripProtocol(e.target.value.trim())
														);
													}}
												/>
												{fieldState.error && (
													<Field.Error>{fieldState.error.message}</Field.Error>
												)}
											</Field>
										)}
									/>
									<Controller
										control={form.control}
										name="androidUrl"
										render={({ field, fieldState }) => (
											<Field error={!!fieldState.error}>
												<Field.Label className="flex items-center gap-1.5">
													<DeviceMobileIcon size={14} weight="fill" />
													Android URL
												</Field.Label>
												<Input
													placeholder="play.google.com/store/apps/…"
													prefix="https://"
													{...field}
													onChange={(e) => {
														field.onChange(
															stripProtocol(e.target.value.trim())
														);
													}}
												/>
												{fieldState.error && (
													<Field.Error>{fieldState.error.message}</Field.Error>
												)}
											</Field>
										)}
									/>
								</div>
							</div>
						</Accordion.Content>
					</Accordion>
				</div>

				<div className="overflow-hidden rounded-md border border-border/60">
					<Accordion>
						<Accordion.Trigger>
							<LinkSimpleIcon
								className="size-4 shrink-0 text-muted-foreground"
								weight="duotone"
							/>
							<Text variant="label">UTM Parameters</Text>
							{utmCount > 0 && (
								<span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
									{utmCount}
								</span>
							)}
						</Accordion.Trigger>
						<Accordion.Content>
							<UtmBuilder
								baseUrl={fullTargetUrl}
								onChange={setUtmParams}
								value={utmParams}
							/>
						</Accordion.Content>
					</Accordion>
				</div>

				<div className="overflow-hidden rounded-md border border-border/60">
					<Accordion>
						<Accordion.Trigger>
							<ImageIcon
								className="size-4 shrink-0 text-muted-foreground"
								weight="duotone"
							/>
							<Text variant="label">Social Preview</Text>
							{useCustomOg && (
								<span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
									1
								</span>
							)}
						</Accordion.Trigger>
						<Accordion.Content>
							<OgPreview
								onChange={setOgData}
								onUseCustomOgChange={setUseCustomOg}
								targetUrl={fullTargetUrl}
								useCustomOg={useCustomOg}
								value={ogData}
							/>
						</Accordion.Content>
					</Accordion>
				</div>
			</div>
		</Sheet.Body>
	);

	return (
		<Sheet onOpenChange={handleOpenChange} open={open}>
			<Sheet.Content className="w-full sm:max-w-lg" side="right">
				<Sheet.Header>
					<Sheet.Title>{isEditing ? "Edit Link" : "Create Link"}</Sheet.Title>
					<Sheet.Description>
						{isEditing
							? `Editing ${link?.name || link?.slug}`
							: "Create a short link to track clicks and analytics"}
					</Sheet.Description>
				</Sheet.Header>

				<Sheet.Form onSubmit={form.handleSubmit(handleSubmit)}>
					{isEditing && link ? (
						<Tabs
							className="flex flex-1 flex-col overflow-hidden"
							defaultValue="details"
						>
							<Tabs.List className="mx-5 mt-3 shrink-0">
								<Tabs.Tab value="details">Details</Tabs.Tab>
								<Tabs.Tab value="qr-code">
									<QrCodeIcon className="size-3.5" weight="duotone" />
									QR Code
								</Tabs.Tab>
							</Tabs.List>

							<Tabs.Panel
								className="mt-0 flex-1 overflow-y-auto"
								value="details"
							>
								{formContent}
							</Tabs.Panel>

							<Tabs.Panel
								className="mt-0 flex-1 overflow-y-auto"
								value="qr-code"
							>
								<Sheet.Body>
									<LinkQrCode name={link.name} slug={link.slug} />
								</Sheet.Body>
							</Tabs.Panel>

							<Sheet.Footer>
								<Button
									onClick={() => onOpenChange(false)}
									type="button"
									variant="secondary"
								>
									Cancel
								</Button>
								<Button
									disabled={!(isValid && isDirty)}
									loading={isPending}
									type="submit"
								>
									Save Changes{" "}
								</Button>
							</Sheet.Footer>
						</Tabs>
					) : (
						<>
							{formContent}
							<Sheet.Footer>
								<Button
									onClick={() => onOpenChange(false)}
									type="button"
									variant="secondary"
								>
									Cancel
								</Button>
								<Button
									disabled={!(isValid && isDirty)}
									loading={isPending}
									type="submit"
								>
									Create Link{" "}
								</Button>
							</Sheet.Footer>
						</>
					)}
				</Sheet.Form>
				<Sheet.Close />
			</Sheet.Content>
		</Sheet>
	);
}

export function LinkSheet(props: LinkSheetProps) {
	return (
		<LinkSheetInner
			key={props.open ? (props.link?.id ?? "new") : "closed"}
			{...props}
		/>
	);
}
