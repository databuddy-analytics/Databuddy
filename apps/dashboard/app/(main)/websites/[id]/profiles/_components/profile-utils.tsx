import { GlobeIcon } from '@phosphor-icons/react';
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
	if (!country || country === 'Unknown') {
		return <GlobeIcon className="h-4 w-4 text-muted-foreground" />;
	}

	return (
		<img
			alt={`${country} flag`}
			className="h-4 w-5 rounded-sm object-cover"
			height={20}
			src={`https://flagcdn.com/w40/${country.toLowerCase()}.png`}
			width={20}
		/>
	);
};

export const formatDuration = (seconds: number): string => {
	if (!seconds || seconds < 60) {
		return `${Math.round(seconds || 0)}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round(seconds % 60);

	if (minutes < 60) {
		return remainingSeconds > 0
			? `${minutes}m ${remainingSeconds}s`
			: `${minutes}m`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};
