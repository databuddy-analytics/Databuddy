export type DeviceType =
	| 'mobile'
	| 'tablet'
	| 'laptop'
	| 'desktop'
	| 'ultrawide'
	| 'watch'
	| 'unknown';

interface Resolution {
	width: number;
	height: number;
	aspect: number;
}

// Orientation-agnostic key (longSide x shortSide)
const makeKey = (w: number, h: number) => {
	const longSide = Math.max(w, h);
	const shortSide = Math.min(w, h);
	return `${longSide}x${shortSide}`;
};

// Curated common resolutions mapped to device types (orientation-agnostic)
// Keep this list intentionally small to avoid bloat while covering popular cases
const COMMON_RESOLUTION_DEVICE_TYPE: Record<string, DeviceType> = {
	// Mobile (portrait long x short)
	'896x414': 'mobile', // iPhone XR/11
	'844x390': 'mobile', // iPhone 12/13/14
	'932x430': 'mobile', // iPhone 14/15 Pro Max
	'800x360': 'mobile', // Many Android
	'780x360': 'mobile',
	'736x414': 'mobile',
	'667x375': 'mobile',
	'640x360': 'mobile',
	'568x320': 'mobile',

	// Tablets
	'1366x1024': 'tablet', // iPad Pro (CSS logical)
	'1280x800': 'tablet',
	'1180x820': 'tablet', // iPad Air
	'1024x768': 'tablet',
	'1280x720': 'tablet',

	// Laptops (common)
	'1366x768': 'laptop',
	'1440x900': 'laptop',
	'1536x864': 'laptop',

	// Desktop (16:9 standard)
	'1920x1080': 'desktop',
	'2560x1440': 'desktop',
	'3840x2160': 'desktop', // 4K UHD

	// Ultrawide
	'3440x1440': 'ultrawide',
	'3840x1600': 'ultrawide',
	'5120x1440': 'ultrawide',
};

function parseResolution(screenResolution: string): Resolution | null {
	if (!screenResolution || typeof screenResolution !== 'string') {
		return null;
	}

	// Normalize: trim, remove spaces, unify delimiter to 'x'
	const normalized = screenResolution
		.trim()
		.replace(/\s+/g, '')
		.replace(/[X×✕]/gi, 'x')
		.toLowerCase();

	const parts = normalized.split('x');
	if (parts.length !== 2) {
		return null;
	}

	const width = Number.parseInt(parts[0] || '', 10);
	const height = Number.parseInt(parts[1] || '', 10);

	if (
		Number.isNaN(width) ||
		Number.isNaN(height) ||
		width <= 0 ||
		height <= 0
	) {
		return null;
	}

	return { width, height, aspect: width / height };
}

function determineDeviceType(resolution: Resolution): DeviceType {
	const w = Math.max(resolution.width, resolution.height);
	const h = Math.min(resolution.width, resolution.height);
	const aspect = w / h;

	// Exact/common matches first
	const key = makeKey(w, h);
	if (COMMON_RESOLUTION_DEVICE_TYPE[key]) {
		return COMMON_RESOLUTION_DEVICE_TYPE[key];
	}

	// Watches: very small and near-square
	if (w <= 400 && aspect >= 0.85 && aspect <= 1.15) {
		return 'watch';
	}

	// Ultrawide: very wide aspect and sufficiently large
	if (aspect >= 2.0 && w >= 2560) {
		return 'ultrawide';
	}

	// Heuristics based primarily on the short side (portrait CSS width proxy)
	if (h <= 480) {
		return 'mobile';
	}
	if (h <= 900) {
		return 'tablet';
	}

	// Above tablet short-side: distinguish laptop vs desktop by long side
	if (w <= 1600) {
		return 'laptop';
	}
	if (w <= 3000) {
		return 'desktop';
	}

	// Very large (e.g., 4k+) default to desktop
	return 'desktop';
}

/**
 * Maps a screen resolution string (e.g., '375x812') to a device type.
 * Uses width, height, and aspect ratio for more accurate mapping.
 * @param screenResolution - The screen resolution string in 'widthxheight' format.
 * @returns DeviceType
 */
export function mapScreenResolutionToDeviceType(
	screenResolution: string
): DeviceType {
	const resolution = parseResolution(screenResolution);
	return resolution ? determineDeviceType(resolution) : 'unknown';
}
