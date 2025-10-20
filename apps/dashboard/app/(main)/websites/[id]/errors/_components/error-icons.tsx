import {
	BugIcon,
	CodeIcon,
	FileCodeIcon,
	LaptopIcon,
	MonitorIcon,
	NetworkIcon,
	PhoneIcon,
	TableIcon,
	TerminalIcon,
} from '@phosphor-icons/react';

// Get icon for error type
export const getErrorTypeIcon = (type: string) => {
	if (!type) {
		return <BugIcon className="h-3.5 w-3.5 text-primary" weight="duotone" />;
	}

	const lowerType = type.toLowerCase();
	if (lowerType.includes('react')) {
		return <CodeIcon className="h-3.5 w-3.5 text-primary" weight="duotone" />;
	}
	if (lowerType.includes('network')) {
		return (
			<NetworkIcon className="h-3.5 w-3.5 text-primary" weight="duotone" />
		);
	}
	if (lowerType.includes('script')) {
		return (
			<FileCodeIcon className="h-3.5 w-3.5 text-primary" weight="duotone" />
		);
	}
	if (lowerType.includes('syntax')) {
		return (
			<TerminalIcon className="h-3.5 w-3.5 text-primary" weight="duotone" />
		);
	}
	return <BugIcon className="h-3.5 w-3.5 text-primary" weight="duotone" />;
};

// Get device icon
export const getDeviceIcon = (deviceType: string) => {
	if (!deviceType) {
		return (
			<MonitorIcon className="h-3.5 w-3.5 text-chart-2" weight="duotone" />
		);
	}

	switch (deviceType.toLowerCase()) {
		case 'mobile':
			return (
				<PhoneIcon className="h-3.5 w-3.5 text-chart-2" weight="duotone" />
			);
		case 'tablet':
			return (
				<TableIcon className="h-3.5 w-3.5 text-chart-2" weight="duotone" />
			);
		case 'desktop':
			return (
				<LaptopIcon className="h-3.5 w-3.5 text-chart-2" weight="duotone" />
			);
		default:
			return (
				<MonitorIcon className="h-3.5 w-3.5 text-chart-2" weight="duotone" />
			);
	}
};
