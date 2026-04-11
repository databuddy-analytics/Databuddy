const TRAILING_SLASHES_REGEX = /\/+$/;
const DATABUDDY_HOSTNAME_REGEX = /(?:^|\.)databuddy\.cc$/;

export function normalizeOrigin(value: string): string | null {
	const trimmed = value.trim().replace(TRAILING_SLASHES_REGEX, "");

	if (!trimmed) {
		return null;
	}

	try {
		return new URL(trimmed).origin;
	} catch {
		return null;
	}
}

export function parseOriginList(value?: string): string[] {
	if (!value) {
		return [];
	}

	return [
		...new Set(
			value
				.split(",")
				.map((origin) => normalizeOrigin(origin))
				.filter((origin): origin is string => Boolean(origin))
		),
	];
}

export function getClientAppAllowedOrigins(
	environment: Record<string, string | undefined> = process.env
): string[] {
	return parseOriginList(environment.CLIENT_APP_ALLOWED_ORIGINS);
}

export function isOriginInList(
	originHeader: string | null | undefined,
	allowedOrigins: string[]
): boolean {
	if (!originHeader || allowedOrigins.length === 0) {
		return false;
	}

	const normalizedOrigin = normalizeOrigin(originHeader);
	if (!normalizedOrigin) {
		return false;
	}

	return allowedOrigins.includes(normalizedOrigin);
}

export function isDatabuddyOrigin(
	originHeader: string | null | undefined
): boolean {
	if (!originHeader) {
		return false;
	}

	const normalizedOrigin = normalizeOrigin(originHeader);
	if (!normalizedOrigin) {
		return false;
	}

	try {
		return DATABUDDY_HOSTNAME_REGEX.test(new URL(normalizedOrigin).hostname);
	} catch {
		return false;
	}
}

export function isAllowedTrackerAssetOrigin(
	originHeader: string | null | undefined,
	allowedOrigins: string[]
): boolean {
	if (!originHeader) {
		return false;
	}

	if (allowedOrigins.length === 0) {
		return isDatabuddyOrigin(originHeader);
	}

	return isOriginInList(originHeader, allowedOrigins);
}
