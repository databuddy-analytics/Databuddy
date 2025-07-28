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

function parseResolution(screenResolution: string): Resolution | null {
	if (!screenResolution || typeof screenResolution !== 'string') {
		return null;
	}

	const parts = screenResolution.split('x');
	if (parts.length !== 2) {
		return null;
	}

	const widthStr = parts[0];
	const heightStr = parts[1];

	if (typeof widthStr !== 'string' || typeof heightStr !== 'string') {
		return null;
	}

	const width = Number.parseInt(widthStr, 10);
	const height = Number.parseInt(heightStr, 10);

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
	const { width, aspect } = resolution;

	if (width <= 400 && aspect >= 0.9 && aspect <= 1.1) {
		return 'watch';
	}
	if (width <= 800 && (aspect < 0.9 || (aspect >= 1.8 && aspect <= 2.5))) {
		return 'mobile';
	}
	if (width > 800 && width <= 1280 && aspect >= 1.1 && aspect <= 1.7) {
		return 'tablet';
	}
	if (width > 1280 && width <= 1920 && aspect >= 1.3 && aspect <= 1.8) {
		return 'laptop';
	}
	if (aspect > 2.0 && width > 1920) {
		return 'ultrawide';
	}
	if (width > 1920 && width <= 2560 && aspect >= 1.3 && aspect <= 2.0) {
		return 'desktop';
	}

	return 'unknown';
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
