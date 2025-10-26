import {
	CursorClickIcon,
	FileTextIcon,
	LightningIcon,
	SparkleIcon,
} from '@phosphor-icons/react';

export const getEventIconAndColor = (
	eventName: string,
	hasProperties: boolean
) => {
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

export const formatPropertyValue = (value: unknown): string => {
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
