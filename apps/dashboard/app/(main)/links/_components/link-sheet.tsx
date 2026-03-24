"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	CircleNotchIcon,
	CopyIcon,
	LinkSimpleIcon,
	QrCodeIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Link, useCreateLink, useUpdateLink } from "@/hooks/use-links";
import dayjs from "@/lib/dayjs";
import { LINKS_BASE_URL, LINKS_FULL_URL } from "./link-constants";
import type { ExpandedSection, LinkFormData } from "./link-form-schema";
import { linkFormSchema } from "./link-form-schema";
import { LinkFormFields } from "./link-form-fields";
import { LinkQrCode } from "./link-qr-code";
import { buildLinkPayload, mapLinkApiError, stripProtocol } from "./link-utils";
import type { OgData } from "./og-preview";
import { parseUtmFromUrl, stripUtmFromUrl, type UtmParams } from "./utm-builder";

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
	open: boolean;
	onOpenChange: (open: boolean) => void;
	link?: Link | null;
	onSave?: (link: Link) => void;
}

function LinkSheetInner({ open, onOpenChange, link, onSave }: LinkSheetProps) {
	const isEditing = !!link;
	const { activeOrganization } = useOrganizationsContext();

	const createLinkMutation = useCreateLink();
	const updateLinkMutation = useUpdateLink();

	const [utmParams, setUtmParams] = useState<UtmParams>(DEFAULT_UTM_PARAMS);
	const [ogData, setOgData] = useState<OgData>(DEFAULT_OG_DATA);
	const [useCustomOg, setUseCustomOg] = useState(false);
	const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);

	const toggleSection = (section: ExpandedSection) => {
		setExpandedSection((prev) => (prev === section ? null : section));
	};

	const form = useForm<LinkFormData>({
		resolver: zodResolver(linkFormSchema),
		mode: "onChange",
		defaultValues: {
			name: "",
			targetUrl: "",
			slug: "",
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
			setExpandedSection(null);
		},
		[form],
	);

	const handleOpenChange = useCallback(
		(isOpen: boolean) => {
			if (isOpen) {
				resetForm(link);
			}
			onOpenChange(isOpen);
		},
		[onOpenChange, resetForm, link],
	);

	const slugValue = form.watch("slug");
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
		if (!activeOrganization?.id) {
			toast.error("No organization selected");
			return;
		}

		const payload = buildLinkPayload({ formData, utmParams, ogData, useCustomOg });

		try {
			if (link?.id) {
				const result = await updateLinkMutation.mutateAsync({
					id: link.id,
					name: payload.name,
					targetUrl: payload.targetUrl,
					slug: payload.slug,
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
				toast.success("Link updated successfully!");
			} else {
				const result = await createLinkMutation.mutateAsync({
					organizationId: activeOrganization.id,
					name: payload.name,
					targetUrl: payload.targetUrl,
					slug: payload.slug,
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
				toast.success("Link created successfully!");
			}
			onOpenChange(false);
		} catch (error: unknown) {
			toast.error(mapLinkApiError(error, !!link?.id));
		}
	};

	const handleCopyLink = useCallback(async () => {
		if (!link?.slug) {
			return;
		}
		try {
			await navigator.clipboard.writeText(`${LINKS_FULL_URL}/${link.slug}`);
			toast.success("Link copied to clipboard");
		} catch {
			toast.error("Failed to copy link");
		}
	}, [link?.slug]);

	const isPending =
		createLinkMutation.isPending || updateLinkMutation.isPending;
	const { isValid, isDirty } = form.formState;
	const isSubmitDisabled = !(isValid && isDirty);

	const expiresAtValue = form.watch("expiresAt");
	const iosUrlValue = form.watch("iosUrl");
	const androidUrlValue = form.watch("androidUrl");

	const hasExpiration = !!expiresAtValue;
	const deviceTargetingCount = [iosUrlValue, androidUrlValue].filter((v) =>
		v?.trim(),
	).length;
	const utmParamsCount = Object.values(utmParams).filter((v) =>
		v?.trim(),
	).length;

	const formFieldsProps = {
		form,
		expandedSection,
		onToggleSectionAction: toggleSection,
		slugValue,
		fullTargetUrl,
		utmParams,
		onUtmParamsChangeAction: setUtmParams,
		ogData,
		onOgDataChangeAction: setOgData,
		useCustomOg,
		onUseCustomOgChangeAction: setUseCustomOg,
		hasExpiration,
		deviceTargetingCount,
		utmParamsCount,
		hasCustomSocial: useCustomOg,
	};

	const footer = (
		<SheetFooter>
			<Button onClick={() => onOpenChange(false)} type="button" variant="outline">
				Cancel
			</Button>
			<Button
				className="min-w-28"
				disabled={isPending || isSubmitDisabled}
				type="submit"
			>
				{isPending ? (
					<>
						<CircleNotchIcon className="animate-spin" size={16} />
						{isEditing ? "Saving…" : "Creating…"}
					</>
				) : isEditing ? (
					"Save Changes"
				) : (
					"Create Link"
				)}
			</Button>
		</SheetFooter>
	);

	return (
		<Sheet onOpenChange={handleOpenChange} open={open}>
			<SheetContent className="sm:max-w-xl" side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div className="flex size-11 items-center justify-center rounded border bg-secondary">
							<LinkSimpleIcon
								className="text-primary"
								size={20}
								weight="duotone"
							/>
						</div>
						<div>
							<SheetTitle className="text-balance text-lg">
								{isEditing ? "Edit Link" : "Create Link"}
							</SheetTitle>
							<SheetDescription className="text-pretty">
								{isEditing
									? `Editing ${link?.name || link?.slug}`
									: "Create a short link to track clicks and analytics"}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={form.handleSubmit(handleSubmit)}
					>
						{isEditing && link ? (
							<Tabs
								className="flex flex-1 flex-col overflow-hidden"
								defaultValue="details"
								variant="underline"
							>
								<TabsList className="shrink-0">
									<TabsTrigger value="details">
										<LinkSimpleIcon aria-hidden="true" size={16} weight="duotone" />
										Details
									</TabsTrigger>
									<TabsTrigger value="qr-code">
										<QrCodeIcon aria-hidden="true" size={16} weight="duotone" />
										QR Code
									</TabsTrigger>
								</TabsList>

								<TabsContent className="mt-0 flex-1 overflow-y-auto" value="details">
									<SheetBody className="space-y-6">
										<div className="flex items-center justify-between gap-3 rounded border border-primary/20 bg-primary/5 px-3 py-2.5">
											<div className="min-w-0 flex-1">
												<p className="text-muted-foreground text-xs">Short URL</p>
												<p className="truncate font-mono text-sm tabular-nums">
													https://{LINKS_BASE_URL}/{link.slug}
												</p>
											</div>
											<Button
												className="shrink-0"
												onClick={handleCopyLink}
												size="sm"
												type="button"
												variant="secondary"
											>
												<CopyIcon size={16} />
												Copy
											</Button>
										</div>

										<LinkFormFields {...formFieldsProps} isEditMode={true} />
									</SheetBody>
								</TabsContent>

								<TabsContent className="mt-0 flex-1 overflow-y-auto" value="qr-code">
									<SheetBody>
										<LinkQrCode name={link.name} slug={link.slug} />
									</SheetBody>
								</TabsContent>

								{footer}
							</Tabs>
						) : (
							<>
								<SheetBody className="space-y-6">
									<LinkFormFields {...formFieldsProps} isEditMode={false} />
								</SheetBody>
								{footer}
							</>
						)}
					</form>
				</Form>
			</SheetContent>
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
