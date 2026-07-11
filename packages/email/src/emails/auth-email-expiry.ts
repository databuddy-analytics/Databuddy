export const AUTH_EMAIL_EXPIRY_SECONDS = {
	accountDeletion: 60 * 60,
	emailVerification: 24 * 60 * 60,
	invitation: 48 * 60 * 60,
	magicLink: 15 * 60,
	oneTimeCode: 10 * 60,
	passwordReset: 60 * 60,
} as const;

export const AUTH_EMAIL_EXPIRY_LABELS = {
	accountDeletion: "1 hour",
	emailVerification: "24 hours",
	invitation: "48 hours",
	magicLink: "15 minutes",
	oneTimeCode: "10 minutes",
	passwordReset: "1 hour",
} as const;
