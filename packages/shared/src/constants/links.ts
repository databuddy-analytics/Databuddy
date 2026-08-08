export const LINK_SLUG_REGEX = /^[A-Za-z0-9_-]+$/;
export const PUBLIC_LINK_SLUG_REGEX = /^[A-Za-z0-9_-]{3,50}$/;

export function isHttpUrl(value: string | null | undefined): value is string {
	if (!value) {
		return false;
	}

	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}
