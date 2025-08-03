import {
	Globe,
	HelpCircle,
	Laptop,
	Monitor,
	Smartphone,
	Tablet,
	Tv,
} from 'lucide-react';
import type React from 'react';

// Types
export interface DeviceTypeEntry {
	device_type: string;
	device_brand?: string;
	device_model?: string;
	visitors: number;
	pageviews?: number;
}

export interface BrowserVersionEntry {
	browser: string;
	version?: string;
	visitors: number;
	pageviews?: number;
	count?: number;
}

export interface TechnologyTableEntry {
	name: string;
	visitors: number;
	percentage: number;
	icon?: string;
	iconComponent?: React.ReactNode;
	category?: string;
}

// Enhanced device type icons with better styling
export const getDeviceTypeIcon = (
	deviceType: string,
	size: 'sm' | 'md' | 'lg' = 'md'
) => {
	const sizeClasses = {
		sm: 'h-3 w-3',
		md: 'h-4 w-4',
		lg: 'h-5 w-5',
	};

	const typeLower = deviceType.toLowerCase();
	const className = `${sizeClasses[size]}`;

	if (typeLower.includes('mobile') || typeLower.includes('phone')) {
		return (
			<Smartphone className={`${className} text-blue-600 dark:text-blue-400`} />
		);
	}
	if (typeLower.includes('tablet')) {
		return (
			<Tablet className={`${className} text-purple-600 dark:text-purple-400`} />
		);
	}
	if (typeLower.includes('desktop')) {
		return (
			<Monitor className={`${className} text-green-600 dark:text-green-400`} />
		);
	}
	if (typeLower.includes('laptop')) {
		return (
			<Laptop className={`${className} text-amber-600 dark:text-amber-400`} />
		);
	}
	if (typeLower.includes('tv')) {
		return <Tv className={`${className} text-red-600 dark:text-red-400`} />;
	}

	return <HelpCircle className={`${className} text-muted-foreground`} />;
};

// Enhanced browser icon mapping
export const getBrowserIcon = (browser: string): string => {
	const browserLower = browser.toLowerCase();

	const iconMap: Record<string, string> = {
		chrome: '/browsers/Chrome.svg',
		firefox: '/browsers/Firefox.svg',
		safari: '/browsers/Safari.svg',
		edge: '/browsers/Edge.svg',
		opera: '/browsers/Opera.svg',
		ie: '/browsers/IE.svg',
		'internet explorer': '/browsers/IE.svg',
		samsung: '/browsers/SamsungInternet.svg',
		yandex: '/browsers/Yandex.svg',
		ucbrowser: '/browsers/UCBrowser.svg',
		qq: '/browsers/QQ.webp',
		baidu: '/browsers/Baidu.svg',
		duckduckgo: '/browsers/DuckDuckGo.svg',
		brave: '/browsers/Brave.svg',
		vivaldi: '/browsers/Vivaldi.svg',
	};

	for (const [key, path] of Object.entries(iconMap)) {
		if (browserLower.includes(key)) {
			return path;
		}
	}

	return '/browsers/Chrome.svg';
};

// Enhanced OS icon mapping
export const getOSIcon = (os: string): string => {
	const osLower = os.toLowerCase();

	const iconMap: Record<string, string> = {
		windows: '/operating-systems/Windows.svg',
		mac: '/operating-systems/macOS.svg',
		darwin: '/operating-systems/macOS.svg',
		android: '/operating-systems/Android.svg',
		linux: '/operating-systems/Ubuntu.svg',
		ubuntu: '/operating-systems/Ubuntu.svg',
		chrome: '/operating-systems/Chrome.svg',
		harmony: '/operating-systems/HarmonyOS.svg',
		ios: '/operating-systems/Apple.svg',
	};

	for (const [key, path] of Object.entries(iconMap)) {
		if (osLower.includes(key)) {
			return path;
		}
	}

	return '/operating-systems/Ubuntu.svg';
};

export const processDeviceData = (
	deviceTypes: DeviceTypeEntry[]
): TechnologyTableEntry[] => {
	const deviceGroups: Record<string, number> = {};

	for (const item of deviceTypes) {
		const deviceType = item.device_type || 'Unknown';
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
			iconComponent: getDeviceTypeIcon(name, 'md'),
			category: 'device',
		}));
};

// Process browser data with percentages and enhanced icons
export const processBrowserData = (
	browserVersions: BrowserVersionEntry[]
): TechnologyTableEntry[] => {
	const browserGroups: Record<string, number> = {};

	for (const item of browserVersions) {
		let browserName = item.browser || 'Unknown';
		browserName = browserName
			.replace(/^Mobile\s+/, '')
			.replace(/\s+Mobile$/, '');
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
			icon: getBrowserIcon(name),
			category: 'browser',
		}));
};

// Enhanced icon component for tables
export const TechnologyIcon = ({
	entry,
	size = 'md',
}: {
	entry: TechnologyTableEntry;
	size?: 'sm' | 'md' | 'lg';
}) => {
	if (entry.iconComponent) {
		return <>{entry.iconComponent}</>;
	}

	if (entry.icon) {
		const sizeClasses = {
			sm: 'h-3 w-3',
			md: 'h-4 w-4',
			lg: 'h-5 w-5',
		};

		return (
			<img
				alt={entry.name}
				className={`${sizeClasses[size]} object-contain`}
				onError={(e) => {
					(e.target as HTMLImageElement).style.display = 'none';
				}}
				src={`${entry.icon}`}
			/>
		);
	}

	// For OS entries without icon, use getOSIcon
	if (entry.category === 'os') {
		const sizeClasses = {
			sm: 'h-3 w-3',
			md: 'h-4 w-4',
			lg: 'h-5 w-5',
		};
		return (
			<img
				alt={entry.name}
				className={`${sizeClasses[size]} object-contain`}
				src={getOSIcon(entry.name)}
			/>
		);
	}

	return <Globe className="h-4 w-4 text-muted-foreground" />;
};

// Percentage badge component
export const PercentageBadge = ({ percentage }: { percentage: number }) => {
	const getColorClass = (pct: number) => {
		if (pct >= 50) {
			return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
		}
		if (pct >= 25) {
			return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
		}
		if (pct >= 10) {
			return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
		}
		return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
	};

	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${getColorClass(percentage)}`}
		>
			{percentage}%
		</span>
	);
};
