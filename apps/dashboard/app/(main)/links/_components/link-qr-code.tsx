"use client";

import {
	CopyIcon,
	DownloadSimpleIcon,
	ImageIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { QRCode } from "react-qrcode-logo";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS_BASE_URL = "https://dby.sh";

type QrStyle = "squares" | "dots";

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
	slug: string;
	name: string;
	showControls?: boolean;
	className?: string;
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
	const shortUrl = `${LINKS_BASE_URL}/${slug}`;

	// Customization state
	const [qrStyle, setQrStyle] = useState<QrStyle>("dots");
	const [fgColor, setFgColor] = useState("#000000");
	const [downloadSize, setDownloadSize] = useState(256);
	const [logoImage, setLogoImage] = useState<string | undefined>(undefined);
	const [logoSize, setLogoSize] = useState(50);

	// Preview is always smaller
	const previewSize = 180;

	const downloadQrCode = useCallback(() => {
		if (!qrRef.current) {
			return;
		}
		const fileName = `${name.toLowerCase().replace(/\s+/g, "-")}-qr-code`;
		qrRef.current.download("png", fileName);
		toast.success("QR code downloaded");
	}, [name]);

	const copyQrCode = useCallback(() => {
		if (!qrContainerRef.current) {
			toast.error("Failed to copy QR code");
			return;
		}

		const canvas = qrContainerRef.current.querySelector("canvas");
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
		<div className={cn("flex flex-col gap-6", className)}>
			{/* Preview */}
			<div className="flex flex-col items-center gap-3">
				<div className="rounded border bg-white p-4" ref={qrContainerRef}>
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
						ref={qrRef}
						removeQrCodeBehindLogo={!!logoImage}
						size={downloadSize}
						style={{ width: previewSize, height: previewSize }}
						value={shortUrl}
					/>
				</div>
				<p className="font-mono text-muted-foreground text-xs">{shortUrl}</p>
			</div>

			{showControls && (
				<>
					{/* Download Actions */}
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

					{/* Resolution */}
					<div className="space-y-2">
						<span className="font-medium text-foreground text-sm">
							Resolution
						</span>
						<div className="grid grid-cols-4 gap-2">
							{QR_SIZES.map((size) => (
								<button
									className={cn(
										"cursor-pointer rounded border py-2 text-center transition-all",
										downloadSize === size.value
											? "border-primary bg-primary/5 text-foreground"
											: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:text-foreground"
									)}
									key={size.value}
									onClick={() => setDownloadSize(size.value)}
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

					{/* Style */}
					<div className="space-y-2">
						<span className="font-medium text-foreground text-sm">Style</span>
						<div className="grid grid-cols-2 gap-2">
							{(["squares", "dots"] as const).map((style) => (
								<button
									className={cn(
										"cursor-pointer rounded border py-2.5 text-center transition-all",
										qrStyle === style
											? "border-primary bg-primary/5 text-foreground"
											: "border-transparent bg-secondary text-muted-foreground hover:border-border hover:text-foreground"
									)}
									key={style}
									onClick={() => setQrStyle(style)}
									type="button"
								>
									<span className="font-medium text-sm capitalize">
										{style}
									</span>
								</button>
							))}
						</div>
					</div>

					{/* Color */}
					<div className="space-y-2">
						<span className="font-medium text-foreground text-sm">Color</span>
						<div className="flex flex-wrap gap-2">
							{QR_COLORS.map((color) => (
								<button
									aria-label={color.label}
									className={cn(
										"size-8 cursor-pointer rounded border-2 transition-all",
										fgColor === color.value
											? "border-primary ring-2 ring-primary/20"
											: "border-transparent hover:border-border"
									)}
									key={color.value}
									onClick={() => setFgColor(color.value)}
									style={{ backgroundColor: color.value }}
									type="button"
								/>
							))}
						</div>
					</div>

					{/* Logo */}
					<div className="space-y-2">
						<span className="font-medium text-foreground text-sm">Logo</span>
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
								className="flex w-full cursor-pointer items-center justify-center gap-2 rounded border border-dashed bg-secondary/50 px-4 py-6 text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground"
								onClick={() => fileInputRef.current?.click()}
								type="button"
							>
								<ImageIcon size={20} weight="duotone" />
								<span className="text-sm">Upload logo</span>
							</button>
						)}
						<input
							accept="image/*"
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
