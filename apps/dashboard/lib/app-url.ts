export const APP_URL =
	process.env.NEXT_PUBLIC_APP_URL || "https://app.databuddy.cc";

export function getStatusPageUrl(slug: string): string {
	return `${APP_URL}/status/${slug}`;
}
