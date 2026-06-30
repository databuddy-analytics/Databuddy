import {
	BugIcon,
	CodeIcon as TerminalIcon,
	CodeIcon,
	DeviceMobileIcon as PhoneIcon,
	DeviceTabletIcon,
	FileTextIcon as FileCodeIcon,
	GlobeIcon as NetworkIcon,
	LaptopIcon,
	MonitorIcon,
} from "@databuddy/ui/icons";

const errorIconClass = "size-3.5 text-destructive";
const deviceIconClass = "size-3.5 text-muted-foreground";

export const getErrorTypeIcon = (type: string) => {
	const lowerType = type?.toLowerCase() ?? "";
	if (lowerType.includes("react")) {
		return <CodeIcon className={errorIconClass} />;
	}
	if (lowerType.includes("network")) {
		return <NetworkIcon className={errorIconClass} />;
	}
	if (lowerType.includes("script")) {
		return <FileCodeIcon className={errorIconClass} />;
	}
	if (lowerType.includes("syntax")) {
		return <TerminalIcon className={errorIconClass} />;
	}
	return <BugIcon className={errorIconClass} />;
};

export const getDeviceIcon = (deviceType: string) => {
	switch (deviceType?.toLowerCase()) {
		case "mobile":
			return <PhoneIcon className={deviceIconClass} />;
		case "tablet":
			return <DeviceTabletIcon className={deviceIconClass} />;
		case "desktop":
			return <LaptopIcon className={deviceIconClass} />;
		default:
			return <MonitorIcon className={deviceIconClass} />;
	}
};
