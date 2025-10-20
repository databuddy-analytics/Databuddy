'use client';

import {
	DesktopIcon,
	DeviceMobileIcon,
	DeviceTabletIcon,
	LaptopIcon,
	MonitorIcon,
	QuestionIcon,
	WatchIcon,
} from '@phosphor-icons/react';

const deviceTypeIconMap: Record<string, React.ElementType> = {
	mobile: DeviceMobileIcon,
	tablet: DeviceTabletIcon,
	laptop: LaptopIcon,
	desktop: DesktopIcon,
	ultrawide: MonitorIcon,
	watch: WatchIcon,
	unknown: QuestionIcon,
};

const deviceTypeColorMap: Record<string, string> = {
	mobile: 'text-blue-500',
	tablet: 'text-teal-500',
	laptop: 'text-purple-500',
	desktop: 'text-green-500',
	ultrawide: 'text-pink-500',
	watch: 'text-yellow-500',
	unknown: 'text-gray-400',
};

interface DeviceTypeCellProps {
	device_type: string;
}

export function DeviceTypeCell({ device_type }: DeviceTypeCellProps) {
	const Icon = deviceTypeIconMap[device_type] || QuestionIcon;
	const colorClass =
		deviceTypeColorMap[device_type] || deviceTypeColorMap.unknown;

	return (
		<div className="flex items-center gap-3">
			<Icon
				className={colorClass}
				size={20}
				style={{ minWidth: 20, minHeight: 20 }}
				weight="duotone"
			/>
			<span className="font-medium">
				{device_type.charAt(0).toUpperCase() + device_type.slice(1)}
			</span>
		</div>
	);
}
