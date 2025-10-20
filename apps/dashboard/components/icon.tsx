'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

const BROWSER_ICONS = [
	'Chrome',
	'Firefox',
	'Safari',
	'Edge',
	'Opera',
	'OperaGX',
	'SamsungInternet',
	'UCBrowser',
	'Yandex',
	'Baidu',
	'QQ',
	'WeChat',
	'Instagram',
	'Facebook',
	'IE',
	'Chromium',
	'DuckDuckGo',
	'Avast',
	'AVG',
	'Android',
	'Huawei',
	'Miui',
	'Vivo',
	'Sogou',
	'CocCoc',
	'Whale',
	'WebKit',
	'Wolvic',
	'Sleipnir',
	'Silk',
	'Quark',
	'PaleMoon',
	'Oculus',
	'Naver',
	'Line',
	'Lenovo',
	'KAKAOTALK',
	'Iron',
	'HeyTap',
	'360',
	'Brave',
	'Twitter',
	'GSA',
	'LinkedIn',
] as const;

const OS_ICONS = [
	'Windows',
	'macOS',
	'Android',
	'Ubuntu',
	'Tux',
	'Apple',
	'Chrome',
	'HarmonyOS',
	'OpenHarmony',
	'Playstation',
	'Tizen',
] as const;

export type BrowserIconName = (typeof BROWSER_ICONS)[number];
export type OSIconName = (typeof OS_ICONS)[number];
export type IconType = 'browser' | 'os';

interface PublicIconProps {
	type: IconType;
	name: string;
	size?: 'sm' | 'md' | 'lg' | number;
	className?: string;
	fallback?: React.ReactNode;
}

const sizeMap = {
	sm: 16,
	md: 20,
	lg: 24,
};

function getIconSize(size: 'sm' | 'md' | 'lg' | number): number {
	return typeof size === 'number' ? size : sizeMap[size];
}

function normalizeIconName(name: string): string {
	return name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
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
		linux: 'Ubuntu',
		ios: 'Apple',
		darwin: 'macOS',
		mac: 'macOS',
	};
	const lowerName = normalizedName.toLowerCase();
	return osMap[lowerName] || normalizedName;
}

function getIconSrc(iconName: string, folder: string): string {
	if ((iconName === 'Brave' || iconName === 'QQ') && folder === 'browsers') {
		return `/${folder}/${iconName}.webp`;
	}
	return `/${folder}/${iconName}.svg`;
}

function createFallbackIcon(
	normalizedName: string,
	iconSize: number,
	className?: string
) {
	return (
		<div
			className={cn(
				'flex items-center justify-center rounded bg-muted font-medium text-muted-foreground text-xs',
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
	size = 'md',
	className,
	fallback,
}: PublicIconProps) {
	const iconSize = getIconSize(size);

	if (!name) {
		return fallback || createFallbackIcon('?', iconSize, className);
	}

	const normalizedName = normalizeIconName(name);
	const folder = type === 'browser' ? 'browsers' : 'operating-systems';
	const availableIcons = type === 'browser' ? BROWSER_ICONS : OS_ICONS;

	let searchName = normalizedName;
	if (type === 'os') {
		searchName = getOSMappedName(normalizedName);
	}

	const iconName = findIconMatch(searchName, availableIcons);

	if (!iconName) {
		return fallback || createFallbackIcon(normalizedName, iconSize, className);
	}

	const iconSrc = getIconSrc(iconName, folder);

	return (
		<div
			className={cn(
				'relative flex-shrink-0 overflow-hidden rounded',
				className
			)}
			style={{
				width: iconSize,
				height: iconSize,
				minWidth: iconSize,
				minHeight: iconSize,
			}}
		>
			<Image
				alt={name}
				className={cn('object-contain')}
				height={iconSize}
				key={`${iconName}`}
				onError={(e) => {
					const img = e.target as HTMLImageElement;
					img.style.display = 'none';
				}}
				src={iconSrc}
				width={iconSize}
			/>
		</div>
	);
}

export function BrowserIcon({
	name,
	size = 'md',
	className,
	fallback,
}: Omit<PublicIconProps, 'type'>) {
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
	size = 'md',
	className,
	fallback,
}: Omit<PublicIconProps, 'type'>) {
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
	country: string;
	size?: 'sm' | 'md' | 'lg' | number;
	className?: string;
	fallback?: React.ReactNode;
}

export function CountryFlag({
	country,
	size = 'md',
	className,
	fallback,
}: CountryFlagProps) {
	const iconSize = getIconSize(size);

	if (!country || country === 'Unknown' || country === '') {
		return (
			fallback || (
				<div
					className={cn('flex h-4 w-6 items-center justify-center', className)}
				>
					<div className="h-4 w-4 text-muted-foreground">🌐</div>
				</div>
			)
		);
	}

	return (
		<div
			className={cn(
				'relative flex-shrink-0 overflow-hidden rounded-sm',
				className
			)}
			style={{ width: 24, height: iconSize, minWidth: 24, minHeight: iconSize }}
		>
			<Image
				alt={`${country} flag`}
				className={cn('object-cover')}
				height={iconSize}
				onError={(e) => {
					const img = e.target as HTMLImageElement;
					img.style.display = 'none';
				}}
				src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${country.toUpperCase()}.svg`}
				width={24}
			/>
		</div>
	);
}
