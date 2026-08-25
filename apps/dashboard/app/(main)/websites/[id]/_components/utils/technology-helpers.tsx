import {
	DesktopIcon,
	DeviceMobileIcon,
	DeviceTabletIcon,
	LaptopIcon,
	QuestionIcon,
	TelevisionIcon,
} from "@databuddy/ui/icons";

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
			<QuestionIcon className={`${sizeClasses[size]} text-muted-foreground`} />
		);
	}

	const typeLower = deviceType.toLowerCase();
	const className = `${sizeClasses[size]}`;

	if (typeLower.includes("mobile") || typeLower.includes("phone")) {
		return (
			<DeviceMobileIcon
				className={`${className} text-blue-600 dark:text-blue-400`}
			/>
		);
	}
	if (typeLower.includes("tablet")) {
		return (
			<DeviceTabletIcon
				className={`${className} text-purple-600 dark:text-purple-400`}
			/>
		);
	}
	if (typeLower.includes("desktop")) {
		return (
			<DesktopIcon
				className={`${className} text-green-600 dark:text-green-400`}
			/>
		);
	}
	if (typeLower.includes("laptop")) {
		return (
			<LaptopIcon
				className={`${className} text-amber-600 dark:text-amber-400`}
			/>
		);
	}
	if (typeLower.includes("tv")) {
		return (
			<TelevisionIcon
				className={`${className} text-red-600 dark:text-red-400`}
			/>
		);
	}

	return <QuestionIcon className={`${className} text-muted-foreground`} />;
};
