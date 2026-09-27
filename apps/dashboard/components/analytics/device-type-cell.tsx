"use client";

import {
	DesktopIcon,
	DeviceMobileIcon,
	DeviceTabletIcon,
	GameControllerIcon,
	GlobeSimpleIcon,
	LaptopIcon,
	QuestionIcon,
	TelevisionIcon,
} from "@databuddy/ui/icons";

const deviceTypeIconMap: Record<string, React.ElementType> = {
	desktop: DesktopIcon,
	mobile: DeviceMobileIcon,
	tablet: DeviceTabletIcon,
	laptop: LaptopIcon,
	smarttv: TelevisionIcon,
	console: GameControllerIcon,
	xr: GlobeSimpleIcon,
	embedded: LaptopIcon,
};

const deviceTypeColorMap: Record<string, string> = {
	desktop: "text-green-500",
	mobile: "text-blue-500",
	tablet: "text-teal-500",
	laptop: "text-purple-500",
	smarttv: "text-orange-500",
	console: "text-pink-500",
	xr: "text-indigo-500",
	embedded: "text-gray-500",
};

interface DeviceTypeCellProps {
	device_type: string;
}

export function DeviceTypeCell({ device_type }: DeviceTypeCellProps) {
	const key = (device_type ?? "").toLowerCase();
	const Icon = deviceTypeIconMap[key] || QuestionIcon;
	const colorClass = deviceTypeColorMap[key] || "text-gray-400";

	return (
		<div className="flex items-center gap-3">
			<Icon
				className={colorClass}
				size={20}
				style={{ minWidth: 20, minHeight: 20 }}
			/>
			<span className="font-medium">{device_type ?? "Unknown"}</span>
		</div>
	);
}
