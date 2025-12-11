import {
	Globe,
	HelpCircle,
	Laptop,
	Monitor,
	Smartphone,
	Tablet,
	Tv,
} from "lucide-react";
import Image from "next/image";
import type React from "react";
import { BrowserIcon, OSIcon } from "@/components/icon";

// Regex patterns for browser name processing
const MOBILE_PREFIX_REGEX = /^Mobile\s+/;
const MOBILE_SUFFIX_REGEX = /\s+Mobile$/;

// Types
export type DeviceTypeEntry = {
	device_type: string;
	device_brand?: string;
	device_model?: string;
	visitors: number;
	pageviews?: number;
};

export type BrowserVersionEntry = {
	browser: string;
	version?: string;
	visitors: number;
	pageviews?: number;
	count?: number;
};

export type TechnologyTableEntry = {
	name: string;
	visitors: number;
	percentage: number;
	icon?: string;
	iconComponent?: React.ReactNode;
	category?: string;
};

export const getDeviceTypeIcon = (
	deviceType: string | null | undefined,
	size: "sm" | "md" | "lg" = "md"
) => {
	const sizeClasses = {
		sm: "size-3",
		md: "size-4",
		lg: "size-5",
	};

	if (!deviceType) {
		return (
			<HelpCircle className={`${sizeClasses[size]} text-muted-foreground`} />
		);
	}

	const typeLower = deviceType.toLowerCase();
	const className = `${sizeClasses[size]}`;

	if (typeLower.includes("mobile") || typeLower.includes("phone")) {
		return (
			<Smartphone className={`${className} text-blue-600 dark:text-blue-400`} />
		);
	}
	if (typeLower.includes("tablet")) {
		return (
			<Tablet className={`${className} text-purple-600 dark:text-purple-400`} />
		);
	}
	if (typeLower.includes("desktop")) {
		return (
			<Monitor className={`${className} text-green-600 dark:text-green-400`} />
		);
	}
	if (typeLower.includes("laptop")) {
		return (
			<Laptop className={`${className} text-amber-600 dark:text-amber-400`} />
		);
	}
	if (typeLower.includes("tv")) {
		return <Tv className={`${className} text-red-600 dark:text-red-400`} />;
	}

	return <HelpCircle className={`${className} text-muted-foreground`} />;
};

export const processDeviceData = (
	deviceTypes: DeviceTypeEntry[]
): TechnologyTableEntry[] => {
	const deviceGroups: Record<string, number> = {};

	for (const item of deviceTypes) {
		const deviceType = item.device_type || "Unknown";
		const capitalizedType =
			deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
		deviceGroups[capitalizedType] =
			(deviceGroups[capitalizedType] || 0) + (item.visitors || 0);
	}

	const totalVisitors = Object.values(deviceGroups).reduce(
		(sum, count) => sum + count,
		0
	);

	return Object.entries(deviceGroups)
		.sort(([, a], [, b]) => (b as number) - (a as number))
		.slice(0, 10)
		.map(([name, visitors]) => ({
			name,
			visitors,
			percentage:
				totalVisitors > 0 ? Math.round((visitors / totalVisitors) * 100) : 0,
			iconComponent: getDeviceTypeIcon(name, "md"),
			category: "device",
		}));
};

export const processBrowserData = (
	browserVersions: BrowserVersionEntry[]
): TechnologyTableEntry[] => {
	const browserGroups: Record<string, number> = {};

	for (const item of browserVersions) {
		let browserName = item.browser || "Unknown";
		browserName = browserName
			.replace(MOBILE_PREFIX_REGEX, "")
			.replace(MOBILE_SUFFIX_REGEX, "");
		browserGroups[browserName] =
			(browserGroups[browserName] || 0) + (item.visitors || 0);
	}

	const totalVisitors = Object.values(browserGroups).reduce(
		(sum, count) => sum + count,
		0
	);

	return Object.entries(browserGroups)
		.sort(([, a], [, b]) => (b as number) - (a as number))
		.slice(0, 10)
		.map(([name, visitors]) => ({
			name,
			visitors,
			percentage:
				totalVisitors > 0 ? Math.round((visitors / totalVisitors) * 100) : 0,
			iconComponent: <BrowserIcon name={name} size="md" />,
			category: "browser",
		}));
};

export const TechnologyIcon = ({
	entry,
	size = "md",
}: {
	entry: TechnologyTableEntry;
	size?: "sm" | "md" | "lg";
}) => {
	if (entry.iconComponent) {
		return <>{entry.iconComponent}</>;
	}

	// Use unified icon components for better consistency
	if (entry.category === "browser") {
		return <BrowserIcon name={entry.name} size={size} />;
	}

	if (entry.category === "os") {
		return <OSIcon name={entry.name} size={size} />;
	}

	// Fallback for other categories or when no category is specified
	if (entry.icon) {
		const sizeMap = {
			sm: 12,
			md: 16,
			lg: 20,
		};
		const iconSize = sizeMap[size];

		return (
			<div
				className="relative shrink-0"
				style={{ width: iconSize, height: iconSize }}
			>
				<Image
					alt={entry.name}
					className="object-contain"
					fill
					src={entry.icon}
				/>
			</div>
		);
	}

	return <Globe className="size-4 text-muted-foreground" />;
};

// Percentage badge component
export const PercentageBadge = ({ percentage }: { percentage: number }) => {
	const getColorClass = (pct: number) => {
		if (pct >= 50) {
			return "bg-green-100 border border-green-800/50 green-angled-rectangle-gradient text-green-800 dark:bg-green-900/30 dark:text-green-400";
		}
		if (pct >= 25) {
			return "bg-blue-100 border border-blue-800/50 blue-angled-rectangle-gradient text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
		}
		if (pct >= 10) {
			return "bg-amber-100 border border-amber-800/40 amber-angled-rectangle-gradient text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
		}
		return "bg-accent-brighter border border-accent-foreground/30 badge-angled-rectangle-gradient text-accent-foreground";
	};

	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${getColorClass(percentage)}`}
		>
			{percentage}%
		</span>
	);
};
