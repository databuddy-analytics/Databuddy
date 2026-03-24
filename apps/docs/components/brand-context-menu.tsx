"use client";

import {
	CheckIcon,
	CopyIcon,
	ImageIcon,
	PaletteIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { type ReactNode, useCallback, useState } from "react";
import { toast } from "sonner";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";

async function fetchSvgText(path: string): Promise<string> {
	const response = await fetch(path);
	return response.text();
}

async function copySvgAction(path: string, label: string) {
	const svg = await fetchSvgText(path);
	await navigator.clipboard.writeText(svg);
	toast.success(`${label} copied as SVG`);
}

async function copyPngAction(path: string, label: string) {
	const svg = await fetchSvgText(path);
	const img = new Image();
	const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
	const url = URL.createObjectURL(blob);

	await new Promise<void>((resolve, reject) => {
		img.onload = () => {
			const scale = 4;
			const canvas = document.createElement("canvas");
			canvas.width = img.naturalWidth * scale;
			canvas.height = img.naturalHeight * scale;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Canvas context unavailable"));
				return;
			}
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			canvas.toBlob(async (pngBlob) => {
				if (!pngBlob) {
					reject(new Error("Failed to create PNG"));
					return;
				}
				try {
					await navigator.clipboard.write([
						new ClipboardItem({ "image/png": pngBlob }),
					]);
					toast.success(`${label} copied as PNG`);
					resolve();
				} catch (e) {
					reject(e);
				}
			}, "image/png");
			URL.revokeObjectURL(url);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("Failed to load SVG"));
		};
	});
}

function useFlashAction(action: () => Promise<void>) {
	const [flash, setFlash] = useState(false);

	const run = useCallback(async () => {
		try {
			await action();
			setFlash(true);
			setTimeout(() => setFlash(false), 1200);
		} catch {
			toast.error("Action failed");
		}
	}, [action]);

	return { flash, run };
}

function CopyMenuItem({
	label,
	icon,
	onAction,
}: {
	label: string;
	icon: ReactNode;
	onAction: () => Promise<void>;
}) {
	const { flash, run } = useFlashAction(onAction);

	return (
		<ContextMenuItem onClick={run}>
			{flash ? (
				<CheckIcon className="size-4 text-emerald-500" weight="bold" />
			) : (
				icon
			)}
			{label}
		</ContextMenuItem>
	);
}

function getThemeAwarePath(lightPath: string, darkPath: string): string {
	if (typeof document === "undefined") {
		return lightPath;
	}
	return document.documentElement.classList.contains("dark")
		? darkPath
		: lightPath;
}

interface BrandContextMenuProps {
	children: ReactNode;
}

export function BrandContextMenu({ children }: BrandContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				<CopyMenuItem
					icon={<CopyIcon className="size-4" />}
					label="Copy logo SVG"
					onAction={() =>
						copySvgAction(
							getThemeAwarePath(
								"/brand/logomark/black.svg",
								"/brand/logomark/white.svg"
							),
							"Logo"
						)
					}
				/>
				<CopyMenuItem
					icon={<ImageIcon className="size-4" />}
					label="Copy logo PNG"
					onAction={() =>
						copyPngAction(
							getThemeAwarePath(
								"/brand/logomark/black.svg",
								"/brand/logomark/white.svg"
							),
							"Logo"
						)
					}
				/>
				<ContextMenuSeparator />
				<CopyMenuItem
					icon={<CopyIcon className="size-4" />}
					label="Copy wordmark SVG"
					onAction={() =>
						copySvgAction(
							getThemeAwarePath(
								"/brand/wordmark/black.svg",
								"/brand/wordmark/white.svg"
							),
							"Wordmark"
						)
					}
				/>
				<CopyMenuItem
					icon={<ImageIcon className="size-4" />}
					label="Copy wordmark PNG"
					onAction={() =>
						copyPngAction(
							getThemeAwarePath(
								"/brand/wordmark/black.svg",
								"/brand/wordmark/white.svg"
							),
							"Wordmark"
						)
					}
				/>
				<ContextMenuSeparator />
				<ContextMenuItem asChild>
					<Link href="/branding">
						<PaletteIcon className="size-4" weight="duotone" />
						Brand guidelines
					</Link>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
