export const AUTH_EMAIL_EXPIRY_SECONDS = {
	accountDeletion: 60 * 60,
	emailVerification: 24 * 60 * 60,
	invitation: 48 * 60 * 60,
	magicLink: 15 * 60,
	oneTimeCode: 10 * 60,
	passwordReset: 60 * 60,
} as const;

function expiryLabel(totalSeconds: number): string {
	const units = [
		[60 * 60, "hour"],
		[60, "minute"],
		[1, "second"],
	] as const;
	for (const [unitSeconds, unit] of units) {
		if (totalSeconds % unitSeconds === 0) {
			const value = totalSeconds / unitSeconds;
			return `${value} ${unit}${value === 1 ? "" : "s"}`;
		}
	}
	return `${totalSeconds} seconds`;
}

export const AUTH_EMAIL_EXPIRY_LABELS = Object.freeze(
	Object.fromEntries(
		Object.entries(AUTH_EMAIL_EXPIRY_SECONDS).map(([key, seconds]) => [
			key,
			expiryLabel(seconds),
		])
	)
) as Readonly<Record<keyof typeof AUTH_EMAIL_EXPIRY_SECONDS, string>>;
