export type DeviceType =
	| "mobile"
	| "tablet"
	| "laptop"
	| "desktop"
	| "ultrawide"
	| "watch"
	| "unknown";

export const COMMON_RESOLUTION_DEVICE_TYPE: Record<string, DeviceType> = {
	// Mobile
	"896x414": "mobile",
	"844x390": "mobile",
	"932x430": "mobile",
	"800x360": "mobile",
	"780x360": "mobile",
	"736x414": "mobile",
	"667x375": "mobile",
	"640x360": "mobile",
	"568x320": "mobile",
	// Tablets (aspect ratio < 1.5, squarish screens)
	"1366x1024": "tablet",
	"1180x820": "tablet",
	"1024x768": "tablet",
	// Laptops (widescreen ratios: 16:9 = 1.78, 16:10 = 1.6)
	"1280x800": "laptop",
	"1280x720": "laptop",
	"1366x768": "laptop",
	"1440x900": "laptop",
	"1536x864": "laptop",
	// Desktop
	"1920x1080": "desktop",
	"2560x1440": "desktop",
	"3840x2160": "desktop",
	// Ultrawide
	"3440x1440": "ultrawide",
	"3840x1600": "ultrawide",
	"5120x1440": "ultrawide",
};

interface Resolution {
	height: number;
	width: number;
}

function parseResolution(input: string): Resolution | null {
	if (!input) {
		return null;
	}

	const normalized = input
		.trim()
		.replace(/[X×✕\s]/gi, "x")
		.toLowerCase();
	const parts = normalized.split("x");

	if (parts.length !== 2) {
		return null;
	}

	const width = Number.parseInt(parts[0] ?? "", 10);
	const height = Number.parseInt(parts[1] ?? "", 10);

	if (
		width <= 0 ||
		height <= 0 ||
		Number.isNaN(width) ||
		Number.isNaN(height)
	) {
		return null;
	}

	return { width, height };
}

function classifyResolution(w: number, h: number): DeviceType {
	const longSide = Math.max(w, h);
	const shortSide = Math.min(w, h);
	const aspect = longSide / shortSide;
	const key = `${longSide}x${shortSide}`;

	if (COMMON_RESOLUTION_DEVICE_TYPE[key]) {
		return COMMON_RESOLUTION_DEVICE_TYPE[key];
	}

	if (longSide <= 400 && aspect >= 0.85 && aspect <= 1.15) {
		return "watch";
	}
	if (aspect >= 2.0 && longSide >= 2560) {
		return "ultrawide";
	}
	if (shortSide <= 480) {
		return "mobile";
	}
	if (aspect >= 1.5 && longSide >= 1100 && shortSide > 480) {
		return "laptop";
	}
	if (shortSide <= 1024 && aspect < 1.5) {
		return "tablet";
	}
	if (longSide <= 1920) {
		return "laptop";
	}

	return "desktop";
}

export function mapScreenResolutionToDeviceType(
	screenResolution: string
): DeviceType {
	const res = parseResolution(screenResolution);
	return res ? classifyResolution(res.width, res.height) : "unknown";
}
