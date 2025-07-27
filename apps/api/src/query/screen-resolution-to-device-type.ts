// Utility to map screen resolution to device type

export type DeviceType =
	| 'mobile'
	| 'tablet'
	| 'laptop'
	| 'desktop'
	| 'ultrawide'
	| 'watch'
	| 'unknown';

/**
 * Maps a screen resolution string (e.g., '375x812') to a device type.
 * Uses width, height, and aspect ratio for more accurate mapping.
 * @param screenResolution - The screen resolution string in 'widthxheight' format.
 * @returns DeviceType
 */
export function mapScreenResolutionToDeviceType(
	screenResolution: string
): DeviceType {
	if (!screenResolution || typeof screenResolution !== 'string') {
		return 'unknown';
	}
	const parts = screenResolution.split('x');
	if (
		parts.length !== 2 ||
		typeof parts[0] !== 'string' ||
		typeof parts[1] !== 'string'
	) {
		return 'unknown';
	}
	const width = Number.parseInt(parts[0], 10);
	const height = Number.parseInt(parts[1], 10);
	if (Number.isNaN(width) || Number.isNaN(height)) {
		return 'unknown';
	}
	const aspect = width > 0 && height > 0 ? width / height : 0;

	// Watches: very small screens
	if (width <= 400 && height <= 400) {
		return 'watch';
	}

	// Mobiles: small width, portrait aspect
	if (width <= 800 && aspect < 1.1) {
		return 'mobile';
	}

	// Tablets: medium width, aspect ratio between 1.1 and 1.7
	if (width > 800 && width <= 1280 && aspect >= 1.1 && aspect <= 1.7) {
		return 'tablet';
	}

	// Laptops: width up to 1920, aspect ratio typical for laptops
	if (width > 1280 && width <= 1920 && aspect >= 1.3 && aspect <= 1.8) {
		return 'laptop';
	}

	// Ultrawide: very wide aspect ratio
	if (aspect > 2.0 && width > 1920) {
		return 'ultrawide';
	}

	// Desktops: width up to 2560, aspect ratio typical for desktops
	if (width > 1920 && width <= 2560 && aspect >= 1.3 && aspect <= 2.0) {
		return 'desktop';
	}

	return 'unknown';
}
