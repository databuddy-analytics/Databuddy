"use client";

import "flag-icons/css/flag-icons.min.css";
import Image from "next/image";
import { cn } from "@/lib/utils";

// Must match files in public/browsers/. Missing names fall back to a letter.
const BROWSER_ICON_EXT: Record<string, "svg" | "png" | "webp"> = {
	"360": "png",
	AVG: "svg",
	Android: "svg",
	Avast: "png",
	Baidu: "svg",
	Brave: "webp",
	Chrome: "svg",
	Chromium: "svg",
	CocCoc: "svg",
	DuckDuckGo: "svg",
	Edge: "svg",
	Facebook: "svg",
	Firefox: "svg",
	HeyTap: "png",
	Huawei: "svg",
	IE: "svg",
	Instagram: "svg",
	Iron: "png",
	KAKAOTALK: "svg",
	Lenovo: "png",
	Line: "svg",
	LinkedIn: "svg",
	Miui: "png",
	Naver: "webp",
	Oculus: "svg",
	Opera: "svg",
	OperaGX: "svg",
	PaleMoon: "png",
	QQ: "webp",
	Quark: "svg",
	Safari: "svg",
	SamsungInternet: "svg",
	Silk: "png",
	Sleipnir: "webp",
	Sogou: "png",
	Twitter: "svg",
	UCBrowser: "svg",
	Vivo: "webp",
	WeChat: "svg",
	WebKit: "svg",
	Whale: "svg",
	Wolvic: "png",
	Yandex: "svg",
};

const OS_ICON_EXT: Record<string, "svg" | "png" | "webp"> = {
	Android: "svg",
	Apple: "svg",
	Chrome: "svg",
	HarmonyOS: "svg",
	OpenHarmony: "png",
	Playstation: "svg",
	Tizen: "png",
	Tux: "svg",
	Ubuntu: "svg",
	Windows: "svg",
	macOS: "svg",
};

const BROWSER_ICONS = Object.keys(BROWSER_ICON_EXT);
const OS_ICONS = Object.keys(OS_ICON_EXT);

export type BrowserIconName = keyof typeof BROWSER_ICON_EXT;
export type OSIconName = keyof typeof OS_ICON_EXT;
export type IconType = "browser" | "os";

interface PublicIconProps {
	className?: string;
	fallback?: React.ReactNode;
	name: string;
	size?: "sm" | "md" | "lg" | number;
	type: IconType;
}

const sizeMap = {
	sm: 16,
	md: 20,
	lg: 24,
};

function getIconSize(size: "sm" | "md" | "lg" | number): number {
	return typeof size === "number" ? size : sizeMap[size];
}

function normalizeIconName(name: string): string {
	return name.replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "");
}

function findIconMatch(
	normalizedName: string,
	availableIcons: readonly string[]
): string | undefined {
	const exactMatch = availableIcons.find(
		(icon) => icon.toLowerCase() === normalizedName.toLowerCase()
	);
	if (exactMatch) {
		return exactMatch;
	}

	const partialMatch = availableIcons.find(
		(icon) =>
			icon.toLowerCase().includes(normalizedName.toLowerCase()) ||
			normalizedName.toLowerCase().includes(icon.toLowerCase())
	);
	return partialMatch;
}

function getOSMappedName(normalizedName: string): string {
	const osMap: Record<string, string> = {
		linux: "Ubuntu",
		ios: "Apple",
		darwin: "macOS",
		mac: "macOS",
	};
	const lowerName = normalizedName.toLowerCase();
	return osMap[lowerName] || normalizedName;
}

function getIconSrc(iconName: string, folder: string): string {
	const ext =
		folder === "browsers" ? BROWSER_ICON_EXT[iconName] : OS_ICON_EXT[iconName];
	return `/${folder}/${iconName}.${ext ?? "svg"}`;
}

function createFallbackIcon(
	normalizedName: string,
	iconSize: number,
	className?: string
) {
	return (
		<div
			className={cn(
				"flex items-center justify-center rounded bg-secondary font-medium text-secondary-foreground text-xs",
				className
			)}
			style={{ width: iconSize, height: iconSize }}
		>
			{normalizedName.charAt(0).toUpperCase()}
		</div>
	);
}

export function PublicIcon({
	type,
	name,
	size = "md",
	className,
	fallback,
}: PublicIconProps) {
	const iconSize = getIconSize(size);

	if (!name) {
		return fallback || createFallbackIcon("?", iconSize, className);
	}

	const normalizedName = normalizeIconName(name);
	const folder = type === "browser" ? "browsers" : "operating-systems";
	const availableIcons = type === "browser" ? BROWSER_ICONS : OS_ICONS;

	let searchName = normalizedName;
	if (type === "os") {
		searchName = getOSMappedName(normalizedName);
	}

	const iconName = findIconMatch(searchName, availableIcons);

	if (!iconName) {
		return fallback || createFallbackIcon(normalizedName, iconSize, className);
	}

	const iconSrc = getIconSrc(iconName, folder);

	return (
		<div
			className={cn("relative shrink-0 overflow-hidden rounded", className)}
			style={{
				width: iconSize,
				height: iconSize,
				minWidth: iconSize,
				minHeight: iconSize,
			}}
		>
			<Image
				alt={name}
				className={cn("object-contain")}
				height={iconSize}
				key={`${iconName}`}
				onError={(e) => {
					const img = e.target as HTMLImageElement;
					img.style.display = "none";
				}}
				src={iconSrc}
				width={iconSize}
			/>
		</div>
	);
}

export function BrowserIcon({
	name,
	size = "md",
	className,
	fallback,
}: Omit<PublicIconProps, "type">) {
	return (
		<PublicIcon
			className={className}
			fallback={fallback}
			name={name}
			size={size}
			type="browser"
		/>
	);
}

export function OSIcon({
	name,
	size = "md",
	className,
	fallback,
}: Omit<PublicIconProps, "type">) {
	return (
		<PublicIcon
			className={className}
			fallback={fallback}
			name={name}
			size={size}
			type="os"
		/>
	);
}

interface CountryFlagProps {
	className?: string;
	country: string;
	fallback?: React.ReactNode;
	size?: "sm" | "md" | "lg" | number;
}

export function CountryFlag({
	country,
	size = "md",
	className,
	fallback,
}: CountryFlagProps) {
	const iconSize = getIconSize(size);

	if (!country || country === "Unknown" || country === "") {
		return (
			fallback || (
				<div
					className={cn("flex h-4 w-6 items-center justify-center", className)}
				>
					<div className="size-4 text-muted-foreground">🌐</div>
				</div>
			)
		);
	}

	return (
		<span
			aria-label={`${country} flag`}
			className={cn(`fi shrink-0 fi-${country.toLowerCase()}`, className)}
			role="img"
			style={{
				fontSize: iconSize,
				lineHeight: 1,
				borderRadius: 2,
			}}
		/>
	);
}
