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
import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	type FetchedOgData,
	getProxiedImageUrl,
	useImageValidation,
	useOgMetadata,
} from "./use-og-metadata";

export interface OgData {
	ogTitle: string;
	ogDescription: string;
	ogImageUrl: string;
	ogVideoUrl: string;
}

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 240;

interface OgPreviewProps {
	targetUrl: string;
	value: OgData;
	onChange: (data: OgData) => void;
	useCustomOg: boolean;
	onUseCustomOgChange: (useCustom: boolean) => void;
}

export function OgPreview({
	targetUrl,
	value,
	onChange,
	useCustomOg,
	onUseCustomOgChange,
}: OgPreviewProps) {
	const { data: fetchedOg, isLoading } = useOgMetadata(targetUrl);

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
		[onChange, value],
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
			<div className="overflow-hidden rounded border bg-muted/30">
				{isLoading ? (
					<div className="flex h-40 items-center justify-center">
						<CircleNotchIcon className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : (
					<>
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
											aria-label="Remove image"
											className="absolute top-2 right-2 rounded bg-black/60 p-1 opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
											onClick={() => handleFieldChange("ogImageUrl", "")}
											type="button"
										>
											<CloseIcon
												aria-hidden="true"
												className="size-4 text-white"
											/>
										</button>
										<div
											aria-hidden="true"
											className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-white text-xs"
										>
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

						{showNoImage && (
							<div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-muted">
								<ImageIcon
									className="size-10 text-muted-foreground/50"
									weight="duotone"
								/>
								<p className="text-muted-foreground text-xs text-pretty">
									Enter a URL to generate preview
								</p>
							</div>
						)}

						<div className="space-y-1 p-3">
							<p className="line-clamp-1 font-medium text-sm">
								{displayData.title || "No title"}
							</p>
							<p className="line-clamp-2 text-muted-foreground text-xs text-pretty">
								{displayData.description || "No description"}
							</p>
						</div>
					</>
				)}
			</div>

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

			{useCustomOg && (
				<div className="space-y-3 border-primary/20 border-l-2 pl-4">
					<div className="grid gap-1.5">
						<div className="flex items-center justify-between">
							<Label className="text-xs" htmlFor="og-title">
								Title
							</Label>
							<span
								aria-live="polite"
								className="text-muted-foreground text-xs tabular-nums"
							>
								{value.ogTitle.length}/{TITLE_MAX}
							</span>
						</div>
						<Input
							className="h-8 text-sm"
							id="og-title"
							maxLength={TITLE_MAX}
							onChange={(e) => handleFieldChange("ogTitle", e.target.value)}
							placeholder={
								fetchedOg?.title
									? `${fetchedOg.title.slice(0, 30)}…`
									: "Enter custom title…"
							}
							value={value.ogTitle}
						/>
					</div>

					<div className="grid gap-1.5">
						<div className="flex items-center justify-between">
							<Label className="text-xs" htmlFor="og-description">
								Description
							</Label>
							<span
								aria-live="polite"
								className="text-muted-foreground text-xs tabular-nums"
							>
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
								fetchedOg?.description
									? `${fetchedOg.description.slice(0, 40)}…`
									: "Enter custom description…"
							}
							rows={2}
							value={value.ogDescription}
						/>
					</div>

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
												aria-hidden="true"
												className="size-3 text-destructive"
												weight="fill"
											/>
											<span className="text-destructive">Invalid</span>
											<button
												aria-label="Retry image validation"
												className="ml-1 text-muted-foreground hover:text-foreground focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												onClick={retryImage}
												type="button"
											>
												<ArrowsClockwiseIcon
													aria-hidden="true"
													className="size-3"
												/>
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
						<p className="text-muted-foreground text-xs text-pretty">
							Recommended: 1200 × 630 pixels (PNG or JPG)
						</p>
					</div>

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
						<p className="text-muted-foreground text-xs text-pretty">
							MP4 format recommended for best compatibility
						</p>
					</div>

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
