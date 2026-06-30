const VERIFICATION_EMAIL_KEY = "databuddy:verification-email";
const VERIFICATION_EMAIL_TTL_MS = 10 * 60 * 1000;

interface StoredVerificationEmail {
	createdAt: number;
	email: string;
}

function parseStoredVerificationEmail(
	raw: string
): StoredVerificationEmail | null {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object") {
			const record = parsed as Record<string, unknown>;
			if (
				typeof record.email === "string" &&
				typeof record.createdAt === "number"
			) {
				return { email: record.email, createdAt: record.createdAt };
			}
		}
	} catch {
		// Legacy entries were plain strings; ignore them so old emails are not reused.
	}
	return null;
}

export function storeVerificationEmail(email: string): void {
	try {
		sessionStorage.setItem(
			VERIFICATION_EMAIL_KEY,
			JSON.stringify({ email, createdAt: Date.now() })
		);
	} catch {
		// Storage can be disabled; navigation should still continue.
	}
}

export function readVerificationEmail(): string {
	try {
		const raw = sessionStorage.getItem(VERIFICATION_EMAIL_KEY);
		if (!raw) {
			return "";
		}

		const stored = parseStoredVerificationEmail(raw);
		const isFresh =
			stored && Date.now() - stored.createdAt <= VERIFICATION_EMAIL_TTL_MS;
		if (isFresh) {
			return stored.email;
		}

		sessionStorage.removeItem(VERIFICATION_EMAIL_KEY);
	} catch {
		// Storage can be disabled; callers fall back to an empty email.
	}
	return "";
}
