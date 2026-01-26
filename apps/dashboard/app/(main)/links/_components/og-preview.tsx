"use client";

import {
	ArrowCounterClockwiseIcon,
	ArrowsClockwiseIcon,
	CheckCircleIcon,
	CircleNotchIcon,
	XIcon as CloseIcon,
	ImageIcon,
	VideoIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export interface OgData {
	ogTitle: string;
	ogDescription: string;
	ogImageUrl: string;
	ogVideoUrl: string;
}

function getProxiedImageUrl(url: string): string {
	if (!url) {
		return "";
	}
	// Skip proxy for internal/CDN images
	if (
		url.startsWith("/") ||
		url.includes("cdn.databuddy.cc") ||
		url.includes("api.dicebear.com")
	) {
		return url;
	}
	return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

interface OgPreviewProps {
	targetUrl: string;
	value: OgData;
	onChange: (data: OgData) => void;
	useCustomOg: boolean;
	onUseCustomOgChange: (useCustom: boolean) => void;
}

interface FetchedOgData {
	title: string;
	description: string;
	image: string;
}

async function fetchOgData(url: string): Promise<FetchedOgData> {
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

type ImageStatus = "idle" | "loading" | "success" | "error";

function useImageValidation(imageUrl: string) {
	const [status, setStatus] = useState<ImageStatus>("idle");
	const [retryKey, setRetryKey] = useState(0);

	useEffect(() => {
		if (!imageUrl) {
			setStatus("idle");
			return;
		}

		setStatus("loading");

		const img = new Image();
		img.onload = () => setStatus("success");
		img.onerror = () => setStatus("error");
		img.src = getProxiedImageUrl(imageUrl);

		return () => {
			img.onload = null;
			img.onerror = null;
		};
	}, [imageUrl, retryKey]);

	const retry = useCallback(() => setRetryKey((k) => k + 1), []);

	return { status, retry };
}

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 240;

export function OgPreview({
	targetUrl,
	value,
	onChange,
	useCustomOg,
	onUseCustomOgChange,
}: OgPreviewProps) {
	const { data: fetchedOg, isLoading } = useQuery({
		queryKey: ["og-preview", targetUrl],
		queryFn: () => fetchOgData(targetUrl),
		enabled: !!targetUrl && targetUrl.length > 3,
		staleTime: 5 * 60 * 1000,
		retry: 1,
	});

	const customImageUrl = value.ogImageUrl;
	const { status: imageStatus, retry: retryImage } =
		useImageValidation(customImageUrl);

	const displayData = useMemo<FetchedOgData>(() => {
		if (useCustomOg) {
			return {
				title: value.ogTitle || fetchedOg?.title || "",
				description: value.ogDescription || fetchedOg?.description || "",
				image: value.ogImageUrl || fetchedOg?.image || "",
			};
		}
		return fetchedOg ?? { title: "", description: "", image: "" };
	}, [useCustomOg, value, fetchedOg]);

	const handleFieldChange = useCallback(
		(field: keyof OgData, fieldValue: string) => {
			onChange({ ...value, [field]: fieldValue });
		},
		[onChange, value]
	);

	const handleReset = useCallback(() => {
		onChange({
			ogTitle: "",
			ogDescription: "",
			ogImageUrl: "",
			ogVideoUrl: "",
		});
	}, [onChange]);

	const hasCustomValues =
		value.ogTitle ||
		value.ogDescription ||
		value.ogImageUrl ||
		value.ogVideoUrl;

	const showCustomImage = useCustomOg && customImageUrl;
	const showFetchedImage = displayData.image && !showCustomImage;
	const showNoImage = !(showCustomImage || showFetchedImage);

	return (
		<div className="space-y-4">
			{/* Preview Card */}
			<div className="overflow-hidden rounded border bg-muted/30">
				{isLoading ? (
					<div className="flex h-40 items-center justify-center">
						<CircleNotchIcon className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : (
					<>
						{/* Custom image preview with status */}
						{showCustomImage && (
							<div className="group relative aspect-video w-full overflow-hidden bg-muted">
								{imageStatus === "loading" && (
									<div className="flex size-full flex-col items-center justify-center gap-2">
										<CircleNotchIcon className="size-8 animate-spin text-muted-foreground" />
										<p className="text-muted-foreground text-xs">
											Loading image…
										</p>
									</div>
								)}

								{imageStatus === "error" && (
									<div className="flex size-full flex-col items-center justify-center gap-2 bg-destructive/10">
										<WarningCircleIcon className="size-8 text-destructive" />
										<p className="text-destructive text-xs">
											Failed to load image
										</p>
										<Button
											className="h-7"
											onClick={retryImage}
											size="sm"
											type="button"
											variant="outline"
										>
											<ArrowsClockwiseIcon className="mr-1.5 size-3.5" />
											Retry
										</Button>
									</div>
								)}

								{imageStatus === "success" && (
									<>
										<img
											alt="OG Preview"
											className="size-full object-cover"
											height={630}
											src={getProxiedImageUrl(customImageUrl)}
											width={1200}
										/>
										<button
											className="absolute top-2 right-2 rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100"
											onClick={() => handleFieldChange("ogImageUrl", "")}
											type="button"
										>
											<CloseIcon className="size-4 text-white" />
										</button>
										<div className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-white text-xs">
											1200 × 630
										</div>
									</>
								)}

								{imageStatus === "idle" && (
									<div className="flex size-full items-center justify-center">
										<ImageIcon
											className="size-10 text-muted-foreground/50"
											weight="duotone"
										/>
									</div>
								)}
							</div>
						)}

						{showFetchedImage && (
							<div className="relative aspect-video w-full overflow-hidden bg-muted">
								<img
									alt="OG Preview"
									className="size-full object-cover"
									height={630}
									src={getProxiedImageUrl(displayData.image)}
									width={1200}
								/>
							</div>
						)}

						{/* No image placeholder */}
						{showNoImage && (
							<div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-muted">
								<ImageIcon
									className="size-10 text-muted-foreground/50"
									weight="duotone"
								/>
								<p className="text-muted-foreground text-xs">
									Enter a URL to generate preview
								</p>
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
			</div>

			{/* Custom OG Toggle */}
			<div className="flex items-center justify-between">
				<Label className="text-sm" htmlFor="use-custom-og">
					Use custom social preview
				</Label>
				<Switch
					checked={useCustomOg}
					id="use-custom-og"
					onCheckedChange={onUseCustomOgChange}
				/>
			</div>

			{/* Custom OG Fields */}
			{useCustomOg && (
				<div className="space-y-3 border-primary/20 border-l-2 pl-4">
					{/* Title */}
					<div className="grid gap-1.5">
						<div className="flex items-center justify-between">
							<Label className="text-xs" htmlFor="og-title">
								Title
							</Label>
							<span className="text-muted-foreground text-xs tabular-nums">
								{value.ogTitle.length}/{TITLE_MAX}
							</span>
						</div>
						<Input
							className="h-8 text-sm"
							id="og-title"
							maxLength={TITLE_MAX}
							onChange={(e) => handleFieldChange("ogTitle", e.target.value)}
							placeholder={fetchedOg?.title || "Enter custom title…"}
							value={value.ogTitle}
						/>
					</div>

					{/* Description */}
					<div className="grid gap-1.5">
						<div className="flex items-center justify-between">
							<Label className="text-xs" htmlFor="og-description">
								Description
							</Label>
							<span className="text-muted-foreground text-xs tabular-nums">
								{value.ogDescription.length}/{DESCRIPTION_MAX}
							</span>
						</div>
						<Textarea
							className="min-h-16 resize-none text-sm"
							id="og-description"
							maxLength={DESCRIPTION_MAX}
							onChange={(e) =>
								handleFieldChange("ogDescription", e.target.value)
							}
							placeholder={
								fetchedOg?.description || "Enter custom description…"
							}
							rows={2}
							value={value.ogDescription}
						/>
					</div>

					{/* Image URL */}
					<div className="grid gap-1.5">
						<div className="flex items-center justify-between">
							<Label className="text-xs" htmlFor="og-image">
								Image URL
							</Label>
							{customImageUrl && (
								<span className="flex items-center gap-1 text-xs">
									{imageStatus === "loading" && (
										<>
											<CircleNotchIcon className="size-3 animate-spin text-muted-foreground" />
											<span className="text-muted-foreground">Checking…</span>
										</>
									)}
									{imageStatus === "success" && (
										<>
											<CheckCircleIcon
												className="size-3 text-green-600"
												weight="fill"
											/>
											<span className="text-green-600">Valid</span>
										</>
									)}
									{imageStatus === "error" && (
										<>
											<WarningCircleIcon
												className="size-3 text-destructive"
												weight="fill"
											/>
											<span className="text-destructive">Invalid</span>
											<button
												className="ml-1 text-muted-foreground hover:text-foreground"
												onClick={retryImage}
												type="button"
											>
												<ArrowsClockwiseIcon className="size-3" />
											</button>
										</>
									)}
								</span>
							)}
						</div>
						<Input
							className="h-8 text-sm"
							id="og-image"
							onChange={(e) => handleFieldChange("ogImageUrl", e.target.value)}
							placeholder={fetchedOg?.image || "https://example.com/og.png"}
							type="url"
							value={value.ogImageUrl}
						/>
						<p className="text-muted-foreground text-xs">
							Recommended: 1200 × 630 pixels (PNG or JPG)
						</p>
					</div>

					{/* Video URL */}
					<div className="grid gap-1.5">
						<Label
							className="flex items-center gap-1.5 text-xs"
							htmlFor="og-video"
						>
							<VideoIcon size={12} weight="duotone" />
							Video URL (optional)
						</Label>
						<Input
							className="h-8 text-sm"
							id="og-video"
							onChange={(e) => handleFieldChange("ogVideoUrl", e.target.value)}
							placeholder="https://example.com/video.mp4"
							type="url"
							value={value.ogVideoUrl}
						/>
						<p className="text-muted-foreground text-xs">
							MP4 format recommended for best compatibility
						</p>
					</div>

					{/* Reset Button */}
					{hasCustomValues && (
						<Button
							className="h-7 w-full"
							onClick={handleReset}
							size="sm"
							type="button"
							variant="ghost"
						>
							<ArrowCounterClockwiseIcon className="mr-1.5 size-3.5" />
							Reset to default
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
