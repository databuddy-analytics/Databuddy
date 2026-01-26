"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AndroidLogoIcon,
	AppleLogoIcon,
	CalendarIcon,
	CaretDownIcon,
	CircleNotchIcon,
	CopyIcon,
	DeviceMobileIcon,
	ImageIcon,
	LinkSimpleIcon,
	QrCodeIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Link, useCreateLink, useUpdateLink } from "@/hooks/use-links";
import { cn } from "@/lib/utils";
import { ExpirationPicker } from "./expiration-picker";
import { LinkQrCode } from "./link-qr-code";
import { type OgData, OgPreview } from "./og-preview";
import {
	appendUtmToUrl,
	parseUtmFromUrl,
	stripUtmFromUrl,
	UtmBuilder,
	type UtmParams,
} from "./utm-builder";

const LINKS_BASE_URL = "dby.sh";

const slugRegex = /^[a-zA-Z0-9_-]+$/;
const domainRegex = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i;

type ExpandedSection = "expiration" | "devices" | "utm" | "social" | null;

function CollapsibleSection({
	icon: Icon,
	title,
	badge,
	isExpanded,
	onToggleAction,
	children,
}: {
	icon: React.ComponentType<{ size?: number; weight?: "duotone" | "fill" }>;
	title: string;
	badge?: number | boolean;
	isExpanded: boolean;
	onToggleAction: () => void;
	children: React.ReactNode;
}) {
	const showBadge =
		badge !== undefined && (typeof badge === "boolean" ? badge : badge > 0);

	return (
		<div className="space-y-2">
			<div className="-mx-3">
				<button
					className="group flex w-full cursor-pointer items-center justify-between rounded px-3 py-3 text-left transition-colors hover:bg-accent/50"
					onClick={onToggleAction}
					type="button"
				>
					<div className="flex items-center gap-2.5">
						<Icon size={16} weight="duotone" />
						<span className="font-medium text-sm">{title}</span>
						{showBadge && (
							<span className="flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
								{typeof badge === "boolean" ? "✓" : badge}
							</span>
						)}
					</div>
					<CaretDownIcon
						className={cn(
							"size-4 text-muted-foreground transition-transform duration-200",
							isExpanded && "rotate-180"
						)}
						weight="fill"
					/>
				</button>
			</div>

			<AnimatePresence initial={false}>
				{isExpanded && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeInOut" }}
					>
						<div className="pb-4">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

const formSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(255, "Name must be less than 255 characters"),
	targetUrl: z
		.string()
		.min(1, "Target URL is required")
		.refine(
			(val) => {
				const urlToTest =
					val.startsWith("http://") || val.startsWith("https://")
						? val
						: `https://${val}`;
				try {
					const url = new URL(urlToTest);
					return url.protocol === "http:" || url.protocol === "https:";
				} catch {
					return false;
				}
			},
			{ message: "Please enter a valid URL" }
		),
	slug: z
		.string()
		.trim()
		.max(50, "Slug must be less than 50 characters")
		.refine((val) => val === "" || val.length >= 3, {
			message: "Slug must be at least 3 characters",
		})
		.refine((val) => val === "" || slugRegex.test(val), {
			message: "Only letters, numbers, hyphens, and underscores",
		})
		.optional()
		.or(z.literal("")),
	expiresAt: z.string().optional().or(z.literal("")),
	expiredRedirectUrl: z
		.string()
		.optional()
		.or(z.literal(""))
		.refine((val) => !val || domainRegex.test(val.split("/").at(0) ?? ""), {
			message: "Enter a valid URL",
		}),
	iosUrl: z
		.string()
		.optional()
		.or(z.literal(""))
		.refine((val) => !val || domainRegex.test(val.split("/").at(0) ?? ""), {
			message: "Enter a valid URL",
		}),
	androidUrl: z
		.string()
		.optional()
		.or(z.literal(""))
		.refine((val) => !val || domainRegex.test(val.split("/").at(0) ?? ""), {
			message: "Enter a valid URL",
		}),
});

type FormData = z.infer<typeof formSchema>;

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

export function LinkSheet({
	open,
	onOpenChange,
	link,
	onSave,
}: LinkSheetProps) {
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

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		mode: "onChange",
		defaultValues: {
			name: "",
			targetUrl: "",
			slug: "",
			expiresAt: "",
			expiredRedirectUrl: "",
			iosUrl: "",
			androidUrl: "",
		},
	});

	const resetForm = useCallback(
		(linkData: Link | null | undefined) => {
			if (linkData) {
				let targetUrl = linkData.targetUrl;
				if (targetUrl.startsWith("https://")) {
					targetUrl = targetUrl.slice(8);
				} else if (targetUrl.startsWith("http://")) {
					targetUrl = targetUrl.slice(7);
				}

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

				const stripProtocol = (url: string | null) => {
					if (!url) {
						return "";
					}
					if (url.startsWith("https://")) {
						return url.slice(8);
					}
					if (url.startsWith("http://")) {
						return url.slice(7);
					}
					return url;
				};

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
				});
				setUtmParams(DEFAULT_UTM_PARAMS);
				setOgData(DEFAULT_OG_DATA);
				setUseCustomOg(false);
			}
			setExpandedSection(null);
		},
		[form]
	);

	const prevOpenRef = useRef(open);
	const prevLinkRef = useRef(link);

	if (open && (!prevOpenRef.current || prevLinkRef.current !== link)) {
		resetForm(link);
	}
	prevOpenRef.current = open;
	prevLinkRef.current = link;

	const handleOpenChange = useCallback(
		(isOpen: boolean) => {
			onOpenChange(isOpen);
		},
		[onOpenChange]
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

	const getErrorMessage = (error: unknown, isEditingMode: boolean): string => {
		const defaultMessage = `Failed to ${isEditingMode ? "update" : "create"} link.`;

		const rpcError = error as {
			data?: { code?: string };
			message?: string;
		};

		if (rpcError?.data?.code) {
			switch (rpcError.data.code) {
				case "CONFLICT":
					return "A link with this slug already exists.";
				case "FORBIDDEN":
					return (
						rpcError.message ||
						"You do not have permission to perform this action."
					);
				case "UNAUTHORIZED":
					return "You must be logged in to perform this action.";
				case "BAD_REQUEST":
					return (
						rpcError.message || "Invalid request. Please check your input."
					);
				default:
					return rpcError.message || defaultMessage;
			}
		}

		return rpcError?.message || defaultMessage;
	};

	const handleSubmit: SubmitHandler<FormData> = async (formData) => {
		if (!activeOrganization?.id) {
			toast.error("No organization selected");
			return;
		}

		let targetUrl = formData.targetUrl.trim();
		const hasProtocol =
			targetUrl.startsWith("http://") || targetUrl.startsWith("https://");
		if (!hasProtocol) {
			targetUrl = `https://${targetUrl}`;
		}

		targetUrl = appendUtmToUrl(targetUrl, utmParams);

		const slug = formData.slug?.trim() || undefined;

		// Handle expiration date - pass Date for create, string for update
		const expiresAtDate = formData.expiresAt
			? new Date(formData.expiresAt)
			: undefined;
		const expiresAtString = formData.expiresAt
			? new Date(formData.expiresAt).toISOString()
			: undefined;

		// Handle expired redirect URL
		let expiredRedirectUrl: string | undefined =
			formData.expiredRedirectUrl?.trim() || undefined;
		if (expiredRedirectUrl && !expiredRedirectUrl.startsWith("http")) {
			expiredRedirectUrl = `https://${expiredRedirectUrl}`;
		}

		// Handle OG data - pass undefined if not using custom OG or if field is empty
		const ogTitle = useCustomOg && ogData.ogTitle ? ogData.ogTitle : undefined;
		const ogDescription =
			useCustomOg && ogData.ogDescription ? ogData.ogDescription : undefined;
		const ogImageUrl =
			useCustomOg && ogData.ogImageUrl ? ogData.ogImageUrl : undefined;
		const ogVideoUrl =
			useCustomOg && ogData.ogVideoUrl ? ogData.ogVideoUrl : undefined;

		// Handle device targeting URLs
		let iosUrl: string | undefined = formData.iosUrl?.trim() || undefined;
		if (iosUrl && !iosUrl.startsWith("http")) {
			iosUrl = `https://${iosUrl}`;
		}

		let androidUrl: string | undefined =
			formData.androidUrl?.trim() || undefined;
		if (androidUrl && !androidUrl.startsWith("http")) {
			androidUrl = `https://${androidUrl}`;
		}

		try {
			if (link?.id) {
				const result = await updateLinkMutation.mutateAsync({
					id: link.id,
					name: formData.name,
					targetUrl,
					slug,
					expiresAt: expiresAtString,
					expiredRedirectUrl,
					ogTitle,
					ogDescription,
					ogImageUrl,
					ogVideoUrl,
					iosUrl,
					androidUrl,
				});
				if (onSave) {
					onSave(result);
				}
				toast.success("Link updated successfully!");
			} else {
				const result = await createLinkMutation.mutateAsync({
					organizationId: activeOrganization.id,
					name: formData.name,
					targetUrl,
					slug,
					expiresAt: expiresAtDate,
					expiredRedirectUrl,
					ogTitle,
					ogDescription,
					ogImageUrl,
					ogVideoUrl,
					iosUrl,
					androidUrl,
				});
				if (onSave) {
					onSave(result);
				}
				toast.success("Link created successfully!");
			}
			onOpenChange(false);
		} catch (error: unknown) {
			const message = getErrorMessage(error, !!link?.id);
			toast.error(message);
		}
	};

	const handleCopyLink = useCallback(async () => {
		if (!link?.slug) {
			return;
		}
		try {
			await navigator.clipboard.writeText(
				`https://${LINKS_BASE_URL}/${link.slug}`
			);
			toast.success("Link copied to clipboard");
		} catch {
			toast.error("Failed to copy link");
		}
	}, [link?.slug]);

	const isPending =
		createLinkMutation.isPending || updateLinkMutation.isPending;

	const { isValid, isDirty } = form.formState;
	const isSubmitDisabled = !(isValid && isDirty);

	// Watch form values for badge counts
	const expiresAtValue = form.watch("expiresAt");
	const iosUrlValue = form.watch("iosUrl");
	const androidUrlValue = form.watch("androidUrl");

	// Computed badge values
	const hasExpiration = !!expiresAtValue;
	const deviceTargetingCount = [iosUrlValue, androidUrlValue].filter((v) =>
		v?.trim()
	).length;
	const utmParamsCount = Object.values(utmParams).filter((v) =>
		v?.trim()
	).length;
	const hasCustomSocial = useCustomOg;

	const renderFormFields = (isEditMode: boolean) => (
		<div className="space-y-4">
			{/* Destination URL - Primary field */}
			<FormField
				control={form.control}
				name="targetUrl"
				render={({ field }) => (
					<FormItem>
						<FormLabel>
							Destination URL
							<span className="ml-1 text-destructive">*</span>
						</FormLabel>
						<FormControl>
							<Input
								placeholder="example.com/landing-page"
								prefix="https://"
								{...field}
								onChange={(e) => {
									let url = e.target.value.trim();
									if (url.startsWith("http://") || url.startsWith("https://")) {
										try {
											const parsed = new URL(url);
											url =
												parsed.host +
												parsed.pathname +
												parsed.search +
												parsed.hash;
										} catch {
											// Keep as is
										}
									}
									field.onChange(url);
								}}
							/>
						</FormControl>
						<FormDescription>
							Where users will be redirected when clicking your link
						</FormDescription>
						<FormMessage />
					</FormItem>
				)}
			/>

			{/* Separator */}
			<div className="h-px bg-border" />

			{/* Name & Short Link */}
			<div className="space-y-4">
				<div className="grid place-items-start gap-4 sm:grid-cols-2">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Name</FormLabel>
								<FormControl>
									<Input placeholder="Marketing Campaign…" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="slug"
						render={({ field }) => (
							<FormItem>
								<FormLabel>
									Short Link
									{!isEditMode && (
										<span className="ml-1 text-muted-foreground">
											(optional)
										</span>
									)}
								</FormLabel>
								<FormControl>
									<Input
										className={cn(isEditMode && "bg-muted")}
										disabled={isEditMode}
										placeholder={isEditMode ? "" : "my-campaign"}
										prefix={`${LINKS_BASE_URL}/`}
										{...field}
										onChange={(e) => {
											const value = e.target.value.replace(/\s/g, "-");
											field.onChange(value);
										}}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				{!(isEditMode || slugValue) && (
					<p className="text-muted-foreground text-xs">
						Leave empty to auto-generate a random short slug
					</p>
				)}
			</div>

			{/* Separator */}
			<div className="h-px bg-border" />

			{/* Advanced Options as Collapsible Sections */}
			<div className="space-y-1">
				{/* Link Expiration */}
				<CollapsibleSection
					badge={hasExpiration}
					icon={CalendarIcon}
					isExpanded={expandedSection === "expiration"}
					onToggleAction={() => toggleSection("expiration")}
					title="Link Expiration"
				>
					<div className="space-y-4">
						<FormField
							control={form.control}
							name="expiresAt"
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<ExpirationPicker
											onChange={field.onChange}
											value={field.value}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="expiredRedirectUrl"
							render={({ field }) => (
								<FormItem>
									<Label className="text-xs" htmlFor="expired-redirect">
										Redirect URL after expiration
									</Label>
									<FormControl>
										<Input
											className="h-9"
											id="expired-redirect"
											placeholder="example.com/link-expired"
											prefix="https://"
											{...field}
											onChange={(e) => {
												let url = e.target.value.trim();
												if (url.startsWith("https://")) {
													url = url.slice(8);
												} else if (url.startsWith("http://")) {
													url = url.slice(7);
												}
												field.onChange(url);
											}}
										/>
									</FormControl>
									<FormDescription className="text-xs">
										Optional fallback page for expired links
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
				</CollapsibleSection>

				{/* Device Targeting */}
				<CollapsibleSection
					badge={deviceTargetingCount}
					icon={DeviceMobileIcon}
					isExpanded={expandedSection === "devices"}
					onToggleAction={() => toggleSection("devices")}
					title="Device Targeting"
				>
					<div className="space-y-4">
						<p className="text-muted-foreground text-xs">
							Redirect mobile users to device-specific URLs like app stores
						</p>

						<div className="grid gap-4 sm:grid-cols-2">
							<FormField
								control={form.control}
								name="iosUrl"
								render={({ field }) => (
									<FormItem>
										<Label
											className="flex items-center gap-1.5 text-xs"
											htmlFor="ios-url"
										>
											<AppleLogoIcon size={14} weight="fill" />
											iOS URL
										</Label>
										<FormControl>
											<Input
												className="h-9"
												id="ios-url"
												placeholder="apps.apple.com/app/..."
												prefix="https://"
												{...field}
												onChange={(e) => {
													let url = e.target.value.trim();
													if (url.startsWith("https://")) {
														url = url.slice(8);
													} else if (url.startsWith("http://")) {
														url = url.slice(7);
													}
													field.onChange(url);
												}}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="androidUrl"
								render={({ field }) => (
									<FormItem>
										<Label
											className="flex items-center gap-1.5 text-xs"
											htmlFor="android-url"
										>
											<AndroidLogoIcon size={14} weight="fill" />
											Android URL
										</Label>
										<FormControl>
											<Input
												className="h-9"
												id="android-url"
												placeholder="play.google.com/store/apps/..."
												prefix="https://"
												{...field}
												onChange={(e) => {
													let url = e.target.value.trim();
													if (url.startsWith("https://")) {
														url = url.slice(8);
													} else if (url.startsWith("http://")) {
														url = url.slice(7);
													}
													field.onChange(url);
												}}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					</div>
				</CollapsibleSection>

				{/* UTM Parameters */}
				<CollapsibleSection
					badge={utmParamsCount}
					icon={LinkSimpleIcon}
					isExpanded={expandedSection === "utm"}
					onToggleAction={() => toggleSection("utm")}
					title="UTM Parameters"
				>
					<UtmBuilder
						baseUrl={fullTargetUrl}
						onChange={setUtmParams}
						value={utmParams}
					/>
				</CollapsibleSection>

				{/* Social Preview */}
				<CollapsibleSection
					badge={hasCustomSocial}
					icon={ImageIcon}
					isExpanded={expandedSection === "social"}
					onToggleAction={() => toggleSection("social")}
					title="Social Preview"
				>
					<OgPreview
						onChange={setOgData}
						onUseCustomOgChange={setUseCustomOg}
						targetUrl={fullTargetUrl}
						useCustomOg={useCustomOg}
						value={ogData}
					/>
				</CollapsibleSection>
			</div>
		</div>
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
							<SheetTitle className="text-lg">
								{isEditing ? "Edit Link" : "Create Link"}
							</SheetTitle>
							<SheetDescription>
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
									<TabsTrigger
										className="focus-visible:ring-0 focus-visible:ring-offset-0"
										value="details"
									>
										<LinkSimpleIcon size={16} weight="duotone" />
										Details
									</TabsTrigger>
									<TabsTrigger
										className="focus-visible:ring-0 focus-visible:ring-offset-0"
										value="qr-code"
									>
										<QrCodeIcon size={16} weight="duotone" />
										QR Code
									</TabsTrigger>
								</TabsList>

								<TabsContent
									className="mt-0 flex-1 overflow-y-auto"
									value="details"
								>
									<SheetBody className="space-y-6">
										{/* Short URL Preview - compact and actionable */}
										<div className="flex items-center justify-between gap-3 rounded border border-primary/20 bg-primary/5 px-3 py-2.5">
											<div className="min-w-0 flex-1">
												<p className="text-muted-foreground text-xs">
													Short URL
												</p>
												<p className="truncate font-mono text-sm">
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

										{renderFormFields(true)}
									</SheetBody>
								</TabsContent>

								<TabsContent
									className="mt-0 flex-1 overflow-y-auto"
									value="qr-code"
								>
									<SheetBody>
										<LinkQrCode name={link.name} slug={link.slug} />
									</SheetBody>
								</TabsContent>

								<SheetFooter>
									<Button
										onClick={() => onOpenChange(false)}
										type="button"
										variant="ghost"
									>
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
												Saving…
											</>
										) : (
											"Save Changes"
										)}
									</Button>
								</SheetFooter>
							</Tabs>
						) : (
							<>
								<SheetBody className="space-y-6">
									{renderFormFields(false)}
								</SheetBody>

								<SheetFooter>
									<Button
										onClick={() => onOpenChange(false)}
										type="button"
										variant="ghost"
									>
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
												Creating…
											</>
										) : (
											"Create Link"
										)}
									</Button>
								</SheetFooter>
							</>
						)}
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}
