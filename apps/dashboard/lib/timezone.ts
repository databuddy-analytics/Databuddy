/**
 * Shared timezone utilities for dashboard components
 */

export const getUserTimezone = (): string => {
	try {
		const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return browserTz;
	} catch {
		return "UTC";
	}
};
