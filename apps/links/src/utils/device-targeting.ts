import type { CachedLink } from "@databuddy/redis";

type DeviceOS = "ios" | "android" | "other";

export function detectDeviceOS(userAgent: string | null): DeviceOS {
	if (!userAgent) {
		return "other";
	}
	const lower = userAgent.toLowerCase();

	if (
		lower.includes("iphone") ||
		lower.includes("ipad") ||
		lower.includes("ipod")
	) {
		return "ios";
	}
	if (lower.includes("android")) {
		return "android";
	}
	return "other";
}

export function getTargetUrl(
	link: CachedLink,
	userAgent: string | null
): string {
	const os = detectDeviceOS(userAgent);

	if (os === "ios" && link.iosUrl) {
		return link.iosUrl;
	}
	if (os === "android" && link.androidUrl) {
		return link.androidUrl;
	}

	return link.targetUrl;
}
