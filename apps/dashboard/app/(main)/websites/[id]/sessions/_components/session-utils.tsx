import {
	CursorClickIcon,
	FileTextIcon,
	GlobeIcon,
	LightningIcon,
	SparkleIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import {
	getBrowserIcon,
	getDeviceTypeIcon,
	getOSIcon,
} from '../../_components/utils/technology-helpers';

export const getDefaultDateRange = () => {
	const today = new Date();
	const thirtyDaysAgo = new Date(today);
	thirtyDaysAgo.setDate(today.getDate() - 30);
	return {
		start_date: thirtyDaysAgo.toISOString().split('T')[0],
		end_date: today.toISOString().split('T')[0],
		granularity: 'daily' as 'hourly' | 'daily',
	};
};

export const getDeviceIcon = (device: string) => {
	return getDeviceTypeIcon(device, 'md');
};

export const getBrowserIconComponent = (browser: string) => {
	const iconPath = getBrowserIcon(browser);
	return (
		<img
			alt={browser}
			className="h-4 w-4 object-contain"
			onError={(e) => {
				(e.target as HTMLImageElement).style.display = 'none';
			}}
			src={iconPath}
		/>
	);
};

export const getOSIconComponent = (os: string) => {
	const iconPath = getOSIcon(os);
	return (
		<img
			alt={os}
			className="h-4 w-4 object-contain"
			onError={(e) => {
				(e.target as HTMLImageElement).style.display = 'none';
			}}
			src={iconPath}
		/>
	);
};

export const getCountryFlag = (country: string) => {
	if (!country || country === 'Unknown' || country === '') {
		return <GlobeIcon className="h-4 w-4 text-muted-foreground" />;
	}

	return (
		<img
			alt={`${country} flag`}
			className="h-4 w-6"
			height={20}
			src={`https://flagcdn.com/w40/${country.toLowerCase()}.png`}
			width={20}
		/>
	);
};

export const getEventIconAndColor = (
	eventName: string,
	hasError: boolean,
	hasProperties: boolean
) => {
	if (hasError) {
		return {
			icon: <WarningIcon className="h-4 w-4" />,
			color: 'text-destructive',
			bgColor: 'bg-destructive/10',
			borderColor: 'border-destructive/20',
			badgeColor: 'bg-destructive/10 text-destructive border-destructive/20',
		};
	}

	if (hasProperties) {
		return {
			icon: <SparkleIcon className="h-4 w-4" />,
			color: 'text-accent-foreground',
			bgColor: 'bg-accent/20',
			borderColor: 'border-accent',
			badgeColor: 'bg-accent text-accent-foreground border-accent',
		};
	}

	switch (eventName) {
		case 'screen_view':
		case 'page_view':
			return {
				icon: <FileTextIcon className="h-4 w-4" />,
				color: 'text-primary',
				bgColor: 'bg-primary/10',
				borderColor: 'border-primary/20',
				badgeColor: 'bg-primary/10 text-primary border-primary/20',
			};
		case 'click':
		case 'player-page-tab':
			return {
				icon: <CursorClickIcon className="h-4 w-4" />,
				color: 'text-secondary-foreground',
				bgColor: 'bg-secondary/50',
				borderColor: 'border-secondary',
				badgeColor: 'bg-secondary text-secondary-foreground border-secondary',
			};
		default:
			return {
				icon: <LightningIcon className="h-4 w-4" />,
				color: 'text-muted-foreground',
				bgColor: 'bg-muted/30',
				borderColor: 'border-muted',
				badgeColor: 'bg-muted text-muted-foreground border-muted',
			};
	}
};

export const cleanUrl = (url: string) => {
	if (!url) {
		return '';
	}
	try {
		const urlObj = new URL(url);
		let path = urlObj.pathname;
		if (path.length > 1 && path.endsWith('/')) {
			path = path.slice(0, -1);
		}
		return path + urlObj.search;
	} catch {
		let cleanPath = url.startsWith('/') ? url : `/${url}`;
		if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
			cleanPath = cleanPath.slice(0, -1);
		}
		return cleanPath;
	}
};

export const getDisplayPath = (path: string) => {
	if (!path || path === '/') {
		return '/';
	}
	const cleanPath = cleanUrl(path);
	if (cleanPath.length > 40) {
		const parts = cleanPath.split('/').filter(Boolean);
		if (parts.length > 2) {
			return `/${parts[0]}/.../${parts.at(-1)}`;
		}
	}
	return cleanPath;
};

export const formatPropertyValue = (value: any): string => {
	if (value === null || value === undefined) {
		return 'null';
	}
	if (typeof value === 'boolean') {
		return value.toString();
	}
	if (typeof value === 'number') {
		return value.toString();
	}
	if (typeof value === 'string') {
		return value;
	}
	return JSON.stringify(value);
};
