"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { QRCode } from "react-qrcode-logo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LINKS_FULL_URL } from "./link-constants";
import {
	CopyIcon,
	DownloadSimpleIcon,
	ImageIcon,
	XMarkIcon as XIcon,
} from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

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

interface LinkQrCodeProps {
	className?: string;
	name: string;
	showControls?: boolean;
	slug: string;
}

export function LinkQrCode({
	slug,
	name,
	showControls = true,
	className,
}: LinkQrCodeProps) {
	const qrRef = useRef<QRCode>(null);
	const qrContainerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const shortUrl = `${LINKS_FULL_URL}/${slug}`;

	const [qr, setQr] = useState({
		color: "#000000",
		logo: "",
		logoSize: 50,
		size: 256,
		style: "dots" as "squares" | "dots",
	});
	const updateQr = (next: Partial<typeof qr>) => {
		setQr((current) => ({ ...current, ...next }));
	};

	const downloadQrCode = () => {
		if (!qrRef.current) {
			return;
		}
		const fileName = `${name.toLowerCase().replace(/\s+/g, "-")}-qr-code`;
		qrRef.current.download("png", fileName);
		toast.success("QR code downloaded");
	};

	const copyQrCode = () => {
		const canvas = qrContainerRef.current?.querySelector("canvas");
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
	};

	const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		if (!file.type.startsWith("image/")) {
			toast.error("Please upload an image file");
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				updateQr({ logo: reader.result });
			}
		};
		reader.readAsDataURL(file);
	};

	const removeLogo = () => {
		updateQr({ logo: "" });
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	return (
		<div className={cn("flex flex-col gap-6", className)}>
			<div className="flex flex-col items-center gap-3">
				<div className="rounded border bg-white p-4" ref={qrContainerRef}>
					<QRCode
						bgColor="#ffffff"
						ecLevel="H"
						eyeRadius={qr.style === "dots" ? 8 : 0}
						fgColor={qr.color}
						logoHeight={qr.logo ? qr.logoSize : undefined}
						logoImage={qr.logo || undefined}
						logoPadding={qr.logo ? 4 : undefined}
						logoPaddingStyle="circle"
						logoWidth={qr.logo ? qr.logoSize : undefined}
						qrStyle={qr.style}
						quietZone={16}
						ref={qrRef}
						removeQrCodeBehindLogo={!!qr.logo}
						size={qr.size}
						style={{ width: 180, height: 180 }}
						value={shortUrl}
					/>
				</div>
				<p className="font-mono text-muted-foreground text-xs">{shortUrl}</p>
			</div>

			{showControls && (
				<>
					<div className="flex justify-center gap-2">
						<Button onClick={copyQrCode} size="sm" variant="secondary">
							<CopyIcon size={16} weight="duotone" />
							Copy
						</Button>
						<Button onClick={downloadQrCode} size="sm">
							<DownloadSimpleIcon size={16} weight="bold" />
							Download PNG
						</Button>
					</div>

					<div className="h-px bg-border" />

					<div className="space-y-2">
						<span className="font-medium text-foreground text-sm">
							Resolution
						</span>
						<div className="grid grid-cols-4 gap-2">
							{QR_SIZES.map((size) => (
								<button
									aria-pressed={qr.size === size.value}
									className={cn(
										"cursor-pointer rounded border py-2 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
										qr.size === size.value
											? "border-primary bg-primary/5 text-foreground"
											: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:text-foreground"
									)}
									key={size.value}
									onClick={() => updateQr({ size: size.value })}
									type="button"
								>
									<span className="block font-medium text-xs">
										{size.label}
									</span>
									<span className="block text-[10px] text-muted-foreground">
										{size.description}
									</span>
								</button>
							))}
						</div>
					</div>

					<div className="space-y-2">
						<span className="font-medium text-foreground text-sm">Style</span>
						<div className="grid grid-cols-2 gap-2">
							{(["squares", "dots"] as const).map((style) => (
								<button
									aria-pressed={qr.style === style}
									className={cn(
										"cursor-pointer rounded border py-2.5 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
										qr.style === style
											? "border-primary bg-primary/5 text-foreground"
											: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:text-foreground"
									)}
									key={style}
									onClick={() => updateQr({ style })}
									type="button"
								>
									<span className="font-medium text-sm capitalize">
										{style}
									</span>
								</button>
							))}
						</div>
					</div>

					<div className="space-y-2">
						<span className="font-medium text-foreground text-sm">Color</span>
						<div className="flex flex-wrap gap-2">
							{QR_COLORS.map((color) => (
								<button
									aria-label={color.label}
									className={cn(
										"size-8 cursor-pointer rounded border-2 transition-all",
										qr.color === color.value
											? "border-primary ring-2 ring-primary/20"
											: "border-transparent hover:border-border"
									)}
									key={color.value}
									onClick={() => updateQr({ color: color.value })}
									style={{ backgroundColor: color.value }}
									type="button"
								/>
							))}
						</div>
					</div>

					<div className="space-y-2">
						<span
							className="font-medium text-foreground text-sm"
							id="logo-label"
						>
							Logo
						</span>
						{qr.logo ? (
							<div className="flex items-center gap-3">
								<div className="relative size-12 overflow-hidden rounded border bg-white">
									<img
										alt="Logo preview"
										className="size-full object-contain"
										height={48}
										src={qr.logo}
										width={48}
									/>
								</div>
								<div className="flex-1 space-y-2">
									<div className="flex items-center gap-2">
										<label
											className="text-muted-foreground text-xs"
											htmlFor="logo-size"
										>
											Size:
										</label>
										<input
											aria-valuemax={80}
											aria-valuemin={20}
											aria-valuenow={qr.logoSize}
											className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
											id="logo-size"
											max={80}
											min={20}
											onChange={(e) =>
												updateQr({ logoSize: Number(e.target.value) })
											}
											type="range"
											value={qr.logoSize}
										/>
										<span
											aria-hidden="true"
											className="w-8 text-right font-mono text-muted-foreground text-xs"
										>
											{qr.logoSize}
										</span>
									</div>
								</div>
								<Button
									aria-label="Remove logo"
									onClick={removeLogo}
									size="sm"
									variant="ghost"
								>
									<XIcon aria-hidden="true" size={16} />
								</Button>
							</div>
						) : (
							<button
								aria-describedby="logo-label"
								className="flex w-full cursor-pointer items-center justify-center gap-2 rounded border border-dashed bg-secondary/50 px-4 py-6 text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
								onClick={() => fileInputRef.current?.click()}
								type="button"
							>
								<ImageIcon aria-hidden="true" size={20} weight="duotone" />
								<span className="text-sm">Upload logo</span>
							</button>
						)}
						<input
							accept="image/*"
							aria-label="Upload logo image"
							className="hidden"
							onChange={handleLogoUpload}
							ref={fileInputRef}
							type="file"
						/>
						<p className="text-muted-foreground text-xs">
							PNG or SVG recommended. Logo appears in the center.
						</p>
					</div>
				</>
			)}
		</div>
	);
}
