"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AndroidLogoIcon,
	AppleLogoIcon,
	CalendarIcon,
	CircleNotchIcon,
	CopyIcon,
	DeviceMobileIcon,
	DownloadSimpleIcon,
	FileTextIcon,
	ImageIcon,
	LinkIcon,
	PencilSimpleIcon,
	QrCodeIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { QRCode } from "react-qrcode-logo";
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
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Link, useCreateLink, useUpdateLink } from "@/hooks/use-links";
import { AdvancedOptions } from "./advanced-options";
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

const QR_SIZES = [
	{ value: 128, label: "Small", description: "128px" },
	{ value: 256, label: "Medium", description: "256px" },
	{ value: 512, label: "Large", description: "512px" },
	{ value: 1024, label: "XL", description: "1024px" },
];

const QR_COLORS = [
	{ value: "#000000", label: "Black" },
	{ value: "#1a1a2e", label: "Navy" },
	{ value: "#0f3460", label: "Royal" },
	{ value: "#533483", label: "Purple" },
	{ value: "#e94560", label: "Red" },
	{ value: "#00b894", label: "Green" },
	{ value: "#0984e3", label: "Blue" },
	{ value: "#6c5ce7", label: "Indigo" },
];

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
		.refine(
			(val) => {
				if (!val || val === "") {
					return true;
				}
				try {
					const urlToTest = val.startsWith("http") ? val : `https://${val}`;
					const url = new URL(urlToTest);
					return url.protocol === "http:" || url.protocol === "https:";
				} catch {
					return false;
				}
			},
			{ message: "Please enter a valid URL" }
		),
	iosUrl: z
		.string()
		.optional()
		.or(z.literal(""))
		.refine(
			(val) => {
				if (!val || val === "") {
					return true;
				}
				try {
					const urlToTest = val.startsWith("http") ? val : `https://${val}`;
					const url = new URL(urlToTest);
					return url.protocol === "http:" || url.protocol === "https:";
				} catch {
					return false;
				}
			},
			{ message: "Please enter a valid URL" }
		),
	androidUrl: z
		.string()
		.optional()
		.or(z.literal(""))
		.refine(
			(val) => {
				if (!val || val === "") {
					return true;
				}
				try {
					const urlToTest = val.startsWith("http") ? val : `https://${val}`;
					const url = new URL(urlToTest);
					return url.protocol === "http:" || url.protocol === "https:";
				} catch {
					return false;
				}
			},
			{ message: "Please enter a valid URL" }
		),
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

// Helper function to fetch OG data
async function fetchOgData(url: string) {
	if (!url) {
		throw new Error("No URL provided");
	}
	const fullUrl = url.startsWith("http") ? url : `https://${url}`;
	const response = await fetch(
		`https://api.microlink.io?url=${encodeURIComponent(fullUrl)}`
	);
	if (!response.ok) {
		throw new Error("Failed to fetch OG data");
	}
	const data = await response.json();
	return {
		title: data.data?.title ?? "",
		description: data.data?.description ?? "",
		image: data.data?.image?.url ?? data.data?.logo?.url ?? "",
	};
}

// Image validation hook
function useImageValidation(imageUrl: string) {
	const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
		"idle"
	);
	useEffect(() => {
		if (!imageUrl) {
			setStatus("idle");
			return;
		}
		setStatus("loading");
		const img = new Image();
		img.onload = () => setStatus("success");
		img.onerror = () => setStatus("error");
		img.src = imageUrl;
		return () => {
			img.onload = null;
			img.onerror = null;
		};
	}, [imageUrl]);
	return { status };
}

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

	// UTM parameters state (not part of form, handled separately)
	const [utmParams, setUtmParams] = useState<UtmParams>(DEFAULT_UTM_PARAMS);

	// OG data state
	const [ogData, setOgData] = useState<OgData>(DEFAULT_OG_DATA);
	const [useCustomOg, setUseCustomOg] = useState(false);

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

				// Parse UTM params from the target URL
				const parsedUtm = parseUtmFromUrl(targetUrl);
				setUtmParams(parsedUtm);

				// Strip UTM params for display in the form
				const urlWithoutUtm = stripUtmFromUrl(targetUrl);

				// Set OG data from link
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
					expiredRedirectUrl: linkData.expiredRedirectUrl ?? "",
					iosUrl: linkData.iosUrl ?? "",
					androidUrl: linkData.androidUrl ?? "",
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
		},
		[form]
	);

	const prevOpenRef = useRef(open);
	const prevLinkRef = useRef(link);

	// Reset form when sheet opens or link changes
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
	const nameValue = form.watch("name");

	// Generate preview slug for QR code (use custom slug or generate preview)
	const previewSlug = useMemo(() => {
		if (slugValue && slugValue.length >= 3) {
			return slugValue;
		}
		// Generate a preview slug based on name or random
		if (nameValue) {
			return nameValue.toLowerCase().replace(/\s+/g, "-").slice(0, 20);
		}
		return null;
	}, [slugValue, nameValue]);

	// QR Code dialog state
	const [qrDialogOpen, setQrDialogOpen] = useState(false);
	const qrContainerRef = useRef<HTMLDivElement>(null);
	const qrRef = useRef<QRCode>(null);

	// QR Code customization state
	const [qrCodeSettings, setQrCodeSettings] = useState<{
		style: "squares" | "dots";
		color: string;
		logoImage?: string;
		logoSize: number;
		downloadSize: number;
	}>({
		style: "dots",
		color: "#000000",
		logoSize: 50,
		downloadSize: 256,
	});

	// QR Code Dialog Content Component
	const qrDialogSaveRef = useRef<(() => void) | null>(null);

	const QrCodeDialogContent = ({
		name,
		saveRef,
		slug,
		onSave,
	}: {
		name: string;
		saveRef: React.MutableRefObject<(() => void) | null>;
		slug: string;
		onSave: (settings: {
			style: "squares" | "dots";
			color: string;
			logoImage?: string;
			logoSize: number;
			downloadSize: number;
		}) => void;
	}) => {
		const dialogQrRef = useRef<QRCode>(null);
		const dialogQrContainerRef = useRef<HTMLDivElement>(null);
		const [qrStyle, setQrStyle] = useState<"squares" | "dots">(qrCodeSettings.style);
		const [fgColor, setFgColor] = useState(qrCodeSettings.color);
		const [downloadSize, setDownloadSize] = useState(qrCodeSettings.downloadSize);
		const [logoImage, setLogoImage] = useState<string | undefined>(qrCodeSettings.logoImage);
		const [logoSize, setLogoSize] = useState(qrCodeSettings.logoSize);
		const fileInputRef = useRef<HTMLInputElement>(null);
		const shortUrl = `https://${LINKS_BASE_URL}/${slug}`;
		const previewSize = 224;

		const handleSave = useCallback(() => {
			onSave({
				style: qrStyle,
				color: fgColor,
				logoImage,
				logoSize,
				downloadSize,
			});
		}, [qrStyle, fgColor, logoImage, logoSize, downloadSize, onSave]);

		useEffect(() => {
			saveRef.current = handleSave;
			return () => {
				saveRef.current = null;
			};
		}, [handleSave, saveRef]);

		const copyQrCode = useCallback(async () => {
			if (!dialogQrContainerRef.current) {
				toast.error("Failed to copy QR code");
				return;
			}

			const canvas = dialogQrContainerRef.current.querySelector("canvas");
			if (!canvas) {
				toast.error("Failed to copy QR code");
				return;
			}

			canvas.toBlob((blob) => {
				if (!blob) {
					toast.error("Failed to copy QR code");
					return;
				}
				navigator.clipboard
					.write([new ClipboardItem({ "image/png": blob })])
					.then(() => {
						toast.success("QR code copied to clipboard");
					})
					.catch(() => {
						toast.error("Failed to copy QR code");
					});
			}, "image/png");
		}, []);

		const downloadQrCode = useCallback(() => {
			if (!dialogQrRef.current) {
				return;
			}
			const fileName = `${name.toLowerCase().replace(/\s+/g, "-")}-qr-code`;
			dialogQrRef.current.download("png", fileName);
			toast.success("QR code downloaded");
		}, [name]);

		const handleLogoUpload = useCallback(
			(e: React.ChangeEvent<HTMLInputElement>) => {
				const file = e.target.files?.[0];
				if (!file) {
					return;
				}

				if (!file.type.startsWith("image/")) {
					toast.error("Please upload an image file");
					return;
				}

				const reader = new FileReader();
				reader.onload = (event) => {
					setLogoImage(event.target?.result as string);
				};
				reader.readAsDataURL(file);
			},
			[]
		);

		const removeLogo = useCallback(() => {
			setLogoImage(undefined);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}, []);

		return (
			<div className="flex w-full flex-col gap-6">
				{/* Link URL */}
				<div className="flex flex-col items-center gap-3">
					<div className="max-w-[468px] flex flex-col">
						<p className="text-xs font-normal font-mono text-zinc-600">
							{shortUrl}
						</p>
					</div>
					{/* QR Code Preview */}
					<div className="w-56 h-56 p-4 bg-white rounded outline-1 -outline-offset-1 outline-neutral-300 flex flex-col items-center justify-center" ref={dialogQrContainerRef}>
					<QRCode
						bgColor="#ffffff"
						ecLevel="H"
						eyeRadius={qrStyle === "dots" ? 8 : 0}
						fgColor={fgColor}
						logoHeight={logoImage ? logoSize : undefined}
						logoImage={logoImage}
						logoPadding={logoImage ? 4 : undefined}
						logoPaddingStyle="circle"
						logoWidth={logoImage ? logoSize : undefined}
						qrStyle={qrStyle}
						quietZone={16}
						ref={dialogQrRef}
						removeQrCodeBehindLogo={!!logoImage}
						size={previewSize}
						style={{ width: previewSize, height: previewSize }}
						value={shortUrl}
					/>
					</div>
				</div>

				{/* Copy and Download Buttons */}
				<div className="inline-flex justify-center items-center gap-2">
					<Button
						className="h-8 px-2.5 bg-gray-200 rounded gap-1.5"
						onClick={copyQrCode}
						variant="ghost"
					>
						<CopyIcon className="size-4" weight="duotone" />
						<span className="text-sm font-medium text-zinc-950">Copy</span>
					</Button>
					<Button
						className="h-8 px-2.5 bg-indigo-600 rounded gap-1.5"
						onClick={downloadQrCode}
					>
						<DownloadSimpleIcon className="size-4 text-white" weight="duotone" />
						<span className="text-sm font-medium text-white">Download PNG</span>
					</Button>
				</div>

				<div className="h-px bg-neutral-300" />

				{/* Resolution */}
				<div className="flex flex-col gap-3">
					<span className="font-medium text-sm text-neutral-900">Resolution</span>
					<div className="flex w-full gap-2">
						{QR_SIZES.map((size) => (
							<button
								className={`flex-1 py-2 rounded outline-1 -outline-offset-1 flex flex-col gap-0 ${
									downloadSize === size.value
										? "bg-indigo-600/5 outline-indigo-600"
										: "bg-gray-200 outline-black/0"
								}`}
								key={size.value}
								onClick={() => setDownloadSize(size.value)}
								type="button"
							>
								<div className="flex flex-col items-center">
									<span className={`text-xs font-medium ${downloadSize === size.value ? "text-neutral-900" : "text-zinc-600"}`}>
										{size.label}
									</span>
								</div>
								<div className="flex flex-col items-center">
									<span className="text-[10px] font-normal text-zinc-600">
										{size.description}
									</span>
								</div>
							</button>
						))}
					</div>
				</div>

				{/* Style */}
				<div className="flex flex-col gap-3">
					<span className="font-medium text-sm text-neutral-900">Style</span>
					<div className="flex w-full gap-2">
						{(["squares", "dots"] as const).map((style) => (
							<button
								className={`flex-1 py-3 rounded outline-1 -outline-offset-1 flex flex-col justify-center items-center ${
									qrStyle === style
										? "bg-indigo-600/5 outline-indigo-600"
										: "bg-gray-200 outline-black/0"
								}`}
								key={style}
								onClick={() => setQrStyle(style)}
								type="button"
							>
								<span className={`text-sm font-medium capitalize ${qrStyle === style ? "text-neutral-900" : "text-zinc-600"}`}>
									{style}
								</span>
							</button>
						))}
					</div>
				</div>

				{/* Color */}
				<div className="flex flex-col gap-3">
					<span className="font-medium text-sm text-neutral-900">Color</span>
					<div className="inline-flex gap-2 flex-wrap">
						{QR_COLORS.map((color) => (
							<button
								aria-label={color.label}
								className={`size-8 rounded border-2 transition-all ${
									fgColor === color.value
										? "border-indigo-600 shadow-[0px_0px_0px_2px_rgba(48,48,237,0.20)]"
										: "border-black/0"
								}`}
								key={color.value}
								onClick={() => setFgColor(color.value)}
								style={{ backgroundColor: color.value }}
								type="button"
							/>
						))}
					</div>
				</div>

				{/* Logo */}
				<div className="flex flex-col gap-3">
					<span className="font-medium text-sm text-neutral-900">Logo</span>
					{logoImage ? (
						<div className="flex items-center gap-3">
							<div className="relative size-12 overflow-hidden rounded border bg-white">
								<img
									alt="Logo preview"
									className="size-full object-contain"
									height={48}
									src={logoImage}
									width={48}
								/>
							</div>
							<div className="flex-1 space-y-2">
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground text-xs">Size:</span>
									<input
										className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
										max={80}
										min={20}
										onChange={(e) => setLogoSize(Number(e.target.value))}
										type="range"
										value={logoSize}
									/>
									<span className="w-8 text-right font-mono text-muted-foreground text-xs">
										{logoSize}
									</span>
								</div>
							</div>
							<Button onClick={removeLogo} size="sm" variant="ghost">
								<XIcon size={16} />
							</Button>
						</div>
					) : (
						<button
							className="flex h-36 w-full cursor-pointer items-center justify-center gap-2 rounded border border-dashed bg-gray-200/50 px-4 py-6 outline-1 -outline-offset-1 outline-neutral-300 text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground"
							onClick={() => fileInputRef.current?.click()}
							type="button"
						>
							<ImageIcon size={20} weight="duotone" />
							<span className="text-sm font-normal">Upload logo</span>
						</button>
					)}
					<input
						accept="image/*"
						className="hidden"
						onChange={handleLogoUpload}
						ref={fileInputRef}
						type="file"
					/>
					<p className="text-xs font-normal text-zinc-600">
						PNG or SVG recommended. Logo appears in the center.
					</p>
				</div>
			</div>
		);
	};

	// Compute full target URL with protocol for OG preview
	const fullTargetUrl = useMemo(() => {
		if (!targetUrlValue) {
			return "";
		}
		return targetUrlValue.startsWith("http")
			? targetUrlValue
			: `https://${targetUrlValue}`;
	}, [targetUrlValue]);

	// Compact OG Preview component for Create Link mode
	const OgPreviewCompact = ({
		targetUrl,
		value,
		useCustomOg,
	}: {
		targetUrl: string;
		value: OgData;
		useCustomOg: boolean;
	}) => {
		const { data: fetchedOg, isLoading } = useQuery({
			queryKey: ["og-preview", targetUrl],
			queryFn: () => fetchOgData(targetUrl),
			enabled: !!targetUrl && targetUrl.length > 3,
			staleTime: 5 * 60 * 1000,
			retry: 1,
		});

		const customImageUrl = value.ogImageUrl;
		const { status: imageStatus } = useImageValidation(customImageUrl);

		const displayData = useMemo(() => {
			if (useCustomOg) {
				return {
					title: value.ogTitle || fetchedOg?.title || "",
					description: value.ogDescription || fetchedOg?.description || "",
					image: value.ogImageUrl || fetchedOg?.image || "",
				};
			}
			return fetchedOg ?? { title: "", description: "", image: "" };
		}, [useCustomOg, value, fetchedOg]);

		const showCustomImage = useCustomOg && customImageUrl;
		const showFetchedImage = displayData.image && !showCustomImage;
		const showNoImage = !(showCustomImage || showFetchedImage);

		return (
			<>
				{isLoading ? (
					<div className="flex h-40 items-center justify-center">
						<CircleNotchIcon className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : (
					<>
						{showCustomImage && imageStatus === "success" && (
							<div className="relative aspect-video w-full overflow-hidden bg-muted">
								<img
									alt="OG Preview"
									className="size-full object-cover"
									height={630}
									src={customImageUrl}
									width={1200}
								/>
							</div>
						)}
						{showFetchedImage && (
							<div className="relative aspect-video w-full overflow-hidden bg-muted">
								<img
									alt="OG Preview"
									className="size-full object-cover"
									height={630}
									src={displayData.image}
									width={1200}
								/>
							</div>
						)}
						{showNoImage && (
							<div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-muted">
								<ImageIcon
									className="size-10 text-muted-foreground/50"
									weight="duotone"
								/>
							</div>
						)}
						<div className="space-y-1 p-3">
							<p className="line-clamp-1 font-medium text-sm">
								{displayData.title || "No title"}
							</p>
							<p className="line-clamp-2 text-muted-foreground text-xs">
								{displayData.description || "No description"}
							</p>
						</div>
					</>
				)}
			</>
		);
	};

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

		// Append UTM params to target URL
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

	const renderFormFields = (isEditMode: boolean) => (
		<div className="space-y-4">
			<FormField
				control={form.control}
				name="name"
				render={({ field }) => (
					<FormItem>
						<FormLabel>
							Name <span className="text-destructive">*</span>
						</FormLabel>
						<FormControl>
							<Input placeholder="Marketing Campaign" {...field} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			<FormField
				control={form.control}
				name="targetUrl"
				render={({ field }) => (
					<FormItem>
						<FormLabel>
							Destination URL <span className="text-destructive">*</span>
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
						<FormMessage />
					</FormItem>
				)}
			/>

			<FormField
				control={form.control}
				name="slug"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Custom Link</FormLabel>
						<FormControl>
							<Input
								placeholder="datathebud"
								prefix={`${LINKS_BASE_URL}/`}
								{...field}
								onChange={(e) => {
									const value = e.target.value.replace(/\s/g, "-");
									field.onChange(value);
								}}
							/>
						</FormControl>
						<FormDescription className="text-xs">
							Leave empty to generate a random short slug
						</FormDescription>
						<FormMessage />
					</FormItem>
				)}
			/>

			{/* Custom Social Preview Toggle */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<FileTextIcon size={16} weight="duotone" />
					<Label className="text-sm" htmlFor="custom-social-preview">
						Custom Social Preview
					</Label>
				</div>
				<Switch
					checked={useCustomOg}
					id="custom-social-preview"
					onCheckedChange={setUseCustomOg}
				/>
			</div>

			<div className="h-px bg-border" />

			<AdvancedOptions>
				{/* UTM Parameters */}
				<div className="flex flex-col gap-4">
					<UtmBuilder
						baseUrl={fullTargetUrl}
						onChange={setUtmParams}
						value={utmParams}
					/>
				</div>

				{/* Device Targeting */}
				<div className="flex flex-col gap-5">
					<div className="flex flex-col gap-1">
						<div className="inline-flex items-center gap-2">
							<DeviceMobileIcon size={16} weight="duotone" />
							<span className="font-medium text-sm">Device Targeting</span>
						</div>
						<p className="text-muted-foreground text-xs">
							Redirect mobile users to device-specific URLs (e.g., app stores)
						</p>
					</div>

					<div className="flex flex-col gap-5">
						<FormField
							control={form.control}
							name="iosUrl"
							render={({ field }) => (
								<FormItem className="flex min-w-56 flex-col gap-2.5">
									<Label
										className="inline-flex items-center gap-1.5 text-xs"
										htmlFor="ios-url"
									>
										<AppleLogoIcon size={14} weight="fill" />
										iOS URL
									</Label>
									<FormControl>
										<Input
											className="h-9 text-sm"
											id="ios-url"
											placeholder="apps.apple.com/app/..."
											prefix="https://"
											{...field}
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
								<FormItem className="flex min-w-56 flex-col gap-2.5">
									<Label
										className="inline-flex items-center gap-1.5 text-xs"
										htmlFor="android-url"
									>
										<AndroidLogoIcon size={14} weight="fill" />
										Android URL
									</Label>
									<FormControl>
										<Input
											className="h-9 text-sm"
											id="android-url"
											placeholder="play.google.com/store/apps/..."
											prefix="https://"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
				</div>

				{/* Link Expiration */}
				<div className="flex flex-col gap-5">
					<div className="inline-flex items-center gap-2">
						<CalendarIcon size={16} weight="duotone" />
						<span className="font-medium text-sm">Link Expiration</span>
					</div>

					<div className="flex flex-col gap-5">
						<FormField
							control={form.control}
							name="expiresAt"
							render={({ field }) => (
								<FormItem className="flex min-w-56 flex-col gap-2.5">
									<Label className="inline-flex text-xs" htmlFor="expires-at">
										Expiration Date & Time
									</Label>
									<div className="flex flex-col gap-2">
										<FormControl>
											<Input
												className="h-9 text-sm"
												id="expires-at"
												type="datetime-local"
												{...field}
											/>
										</FormControl>
										<FormDescription className="text-xs">
											Leave empty for no expiration
										</FormDescription>
									</div>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="expiredRedirectUrl"
							render={({ field }) => (
								<FormItem className="flex min-w-56 flex-col gap-2.5">
									<Label className="inline-flex text-xs" htmlFor="expired-redirect">
										Expired Redirect URL
									</Label>
									<div className="flex flex-col gap-2">
										<FormControl>
											<Input
												className="h-9 text-sm"
												id="expired-redirect"
												placeholder="example.com/expired"
												prefix="https://"
												{...field}
											/>
										</FormControl>
										<FormDescription className="text-xs">
											Where to redirect after expiration (optional)
										</FormDescription>
									</div>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
				</div>
			</AdvancedOptions>
		</div>
	);

	return (
		<>
			<Sheet onOpenChange={handleOpenChange} open={open}>
			<SheetContent className="sm:max-w-xl" side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div className="flex size-11 items-center justify-center rounded border bg-secondary">
							<LinkIcon className="text-primary" size={20} weight="duotone" />
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
										<LinkIcon size={16} weight="duotone" />
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
										{/* Short URL Preview */}
										<div className="space-y-2">
											<span className="font-medium text-foreground text-sm">
												Short URL
											</span>
											<div className="flex items-center gap-2 rounded border bg-muted/50 px-3 py-2.5">
												<span className="flex-1 truncate font-mono text-sm">
													{LINKS_BASE_URL}/{link.slug}
												</span>
												<Button
													onClick={handleCopyLink}
													size="sm"
													type="button"
													variant="ghost"
												>
													<CopyIcon size={16} />
													Copy
												</Button>
											</div>
										</div>

										<div className="h-px bg-border" />

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
									{/* OG Preview & QR Code Section */}
									<div className="flex items-start gap-0">
										{/* OG Preview */}
										<div className="min-w-0 flex-1 pr-4">
											<div className="overflow-hidden rounded border bg-muted/30">
												<OgPreviewCompact
													targetUrl={fullTargetUrl}
													useCustomOg={useCustomOg}
													value={ogData}
												/>
											</div>
										</div>

										{/* QR Code */}
										<div className="flex flex-col rounded border bg-muted/30 p-2">
											<div className="flex items-center justify-between px-2 pt-2 gap-6">
												<span className="font-medium text-sm">QR Code</span>
												<button
													onClick={() => setQrDialogOpen(true)}
													type="button"
												>
													<PencilSimpleIcon
														className="size-4.5 border p-0.5"
														weight="duotone"
													/>
												</button>
											</div>
											{previewSlug ? (
												<div className="flex items-center justify-center">
													<QRCode
														bgColor="transparent"
														ecLevel="H"
														eyeRadius={qrCodeSettings.style === "dots" ? 8 : 0}
														fgColor={qrCodeSettings.color}
														logoHeight={qrCodeSettings.logoImage ? qrCodeSettings.logoSize : undefined}
														logoImage={qrCodeSettings.logoImage}
														logoPadding={qrCodeSettings.logoImage ? 4 : undefined}
														logoPaddingStyle="circle"
														logoWidth={qrCodeSettings.logoImage ? qrCodeSettings.logoSize : undefined}
														qrStyle={qrCodeSettings.style}
														removeQrCodeBehindLogo={!!qrCodeSettings.logoImage}
														size={120}
														style={{ width: 120, height: 120 }}
														value={`https://${LINKS_BASE_URL}/${previewSlug}`}
													/>
												</div>
											) : (
												<div className="flex aspect-square w-full items-center justify-center">
													<div className="flex flex-col items-center gap-2">
														<QrCodeIcon
															className="size-6 text-muted-foreground/50"
															weight="duotone"
														/>
													</div>
												</div>
											)}
										</div>
									</div>

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

		{/* QR Code Dialog */}
		{previewSlug && (
			<Dialog onOpenChange={setQrDialogOpen} open={qrDialogOpen}>
				<DialogContent className="max-w-[576px] w-[576px] bg-slate-50 shadow-[0px_1px_3px_0px_rgba(0,0,0,0.10)] outline-1 -outline-offset-1 outline-neutral-300 p-0 flex flex-col max-h-[90vh]">
					<DialogHeader className="shrink-0 p-5 bg-gray-100 border-b border-neutral-300">
						<div className="flex flex-col items-center gap-0">
							<DialogTitle className="text-lg font-semibold text-neutral-900">
								{nameValue || "Link"}
							</DialogTitle>
							<p className="text-sm font-normal text-zinc-600">
								Customize your QR code
							</p>
						</div>
					</DialogHeader>
					<div className="flex-1 overflow-y-auto pt-4 flex flex-col gap-6">
						<div className="px-5 flex flex-col items-end gap-6">
							<div className="w-full flex flex-col gap-6">
								<QrCodeDialogContent
									name={nameValue || "Link"}
									onSave={(settings) => {
										setQrCodeSettings(settings);
										setQrDialogOpen(false);
										toast.success("QR code settings saved");
									}}
									saveRef={qrDialogSaveRef}
									slug={previewSlug}
								/>
							</div>
						</div>
					</div>
					<div className="shrink-0 px-5 py-4 bg-gray-200 border-t border-neutral-300 flex justify-end items-center gap-3 relative">
						<div className="absolute left-0 top-px w-full h-16 bg-linear-to-l from-zinc-800/10 via-zinc-800/10 to-zinc-800/0 -z-10" />
						<Button
							className="h-9 px-4"
							onClick={() => setQrDialogOpen(false)}
							variant="ghost"
						>
							<span className="text-sm font-medium text-neutral-900">Cancel</span>
						</Button>
						<Button
							className="h-9 min-w-28 px-5 bg-indigo-600"
							onClick={() => {
								if (qrDialogSaveRef.current) {
									qrDialogSaveRef.current();
								}
							}}
						>
							<span className="text-sm font-medium text-white">Save Changes</span>
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		)}
		</>
	);
}
