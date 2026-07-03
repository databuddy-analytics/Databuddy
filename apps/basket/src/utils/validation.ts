export const VALIDATION_LIMITS = {
	STRING_MAX_LENGTH: 2048,
	SHORT_STRING_MAX_LENGTH: 255,
	SESSION_ID_MAX_LENGTH: 128,
	SERVICE_MAX_LENGTH: 128,
	ENVIRONMENT_MAX_LENGTH: 128,
	VERSION_MAX_LENGTH: 64,
	HOST_MAX_LENGTH: 512,
	REGION_MAX_LENGTH: 64,
	INSTANCE_ID_MAX_LENGTH: 128,
	TRACE_ID_MAX_LENGTH: 128,
	SPAN_ID_MAX_LENGTH: 128,
	PARENT_SPAN_ID_MAX_LENGTH: 128,
	STATUS_MESSAGE_MAX_LENGTH: 2048,
	REQUEST_ID_MAX_LENGTH: 128,
	CORRELATION_ID_MAX_LENGTH: 128,
	USER_ID_MAX_LENGTH: 128,
	TENANT_ID_MAX_LENGTH: 128,
	NAME_MAX_LENGTH: 128,
	BATCH_MAX_SIZE: 100,
	PAYLOAD_MAX_SIZE: 1024 * 1024, // 1MB
	BATCH_PAYLOAD_MAX_SIZE: 5 * 1024 * 1024, // 5MB
	UTM_MAX_LENGTH: 512,
	LANGUAGE_MAX_LENGTH: 35, // RFC 5646 max length
	TIMEZONE_MAX_LENGTH: 64,
	PATH_MAX_LENGTH: 2048,
	TEXT_MAX_LENGTH: 2048,
	EVENT_ID_MAX_LENGTH: 512,
} as const;

export function sanitizeString(input: unknown, maxLength?: number): string {
	if (typeof input !== "string") {
		return "";
	}

	const actualMaxLength = maxLength ?? VALIDATION_LIMITS.STRING_MAX_LENGTH;

	let result = input
		.trim()
		.slice(0, actualMaxLength)
		.split("")
		.filter((char) => {
			const code = char.charCodeAt(0);
			return !(
				code <= 8 ||
				code === 11 ||
				code === 12 ||
				(code >= 14 && code <= 31) ||
				code === 127
			);
		})
		.join("");

	// Strip HTML tags repeatedly to defeat stacked-tag bypasses (e.g. `<scr<script>ipt>`)
	let prev: string;
	do {
		prev = result;
		result = result.replace(/<[^>]*>/g, "");
	} while (result !== prev);

	return result.replace(/[<>'"&]/g, "").replace(/\s+/g, " ");
}

const SENSITIVE_QUERY_PARAMS = new Set([
	"password",
	"passwd",
	"pwd",
	"pass",
	"new_password",
	"old_password",
	"confirm_password",
	"password_confirmation",
	"secret",
	"client_secret",
	"token",
	"access_token",
	"refresh_token",
	"id_token",
	"auth_token",
	"session_token",
	"auth",
	"authorization",
	"api_key",
	"apikey",
	"api-key",
	"otp",
	"pin",
	"mfa_code",
	"verification_code",
	"credit_card",
	"card_number",
	"cvv",
	"ssn",
	"email",
	"e-mail",
	"phone",
	"tel",
	"username",
]);

const REDACTED_VALUE = "REDACTED";

function redactParams(query: string): string {
	const params = new URLSearchParams(query);
	let changed = false;
	for (const key of [...params.keys()]) {
		if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
			params.set(key, REDACTED_VALUE);
			changed = true;
		}
	}
	return changed ? params.toString() : query;
}

export function redactSensitiveQueryParams(input: string): string {
	const hashIndex = input.indexOf("#");
	const beforeHash = hashIndex === -1 ? input : input.slice(0, hashIndex);
	const queryIndex = beforeHash.indexOf("?");

	let result =
		queryIndex === -1
			? beforeHash
			: `${beforeHash.slice(0, queryIndex)}?${redactParams(beforeHash.slice(queryIndex + 1))}`;
	if (hashIndex !== -1) {
		result += `#${redactParams(input.slice(hashIndex + 1))}`;
	}
	return result;
}

export function sanitizeUrl(input: unknown, maxLength?: number): string {
	if (typeof input !== "string") {
		return "";
	}
	return sanitizeString(redactSensitiveQueryParams(input), maxLength);
}

const sessionIdRegex = /^[a-zA-Z0-9_-]+$/;

export function validateSessionId(sessionId: unknown): string {
	if (typeof sessionId !== "string") {
		return "";
	}

	const sanitized = sanitizeString(
		sessionId,
		VALIDATION_LIMITS.SESSION_ID_MAX_LENGTH
	);

	if (!sessionIdRegex.test(sanitized)) {
		return "";
	}

	return sanitized;
}

export function validateNumeric(
	value: unknown,
	min = 0,
	max = Number.MAX_SAFE_INTEGER
): number | null {
	if (
		typeof value === "number" &&
		!Number.isNaN(value) &&
		Number.isFinite(value)
	) {
		const rounded = Math.round(value);
		return rounded >= min && rounded <= max ? rounded : null;
	}
	if (typeof value === "string") {
		const parsed = Number.parseFloat(value);
		if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
			const rounded = Math.round(parsed);
			return rounded >= min && rounded <= max ? rounded : null;
		}
	}
	return null;
}

export function validatePayloadSize(
	data: unknown,
	maxSize = VALIDATION_LIMITS.PAYLOAD_MAX_SIZE
): boolean {
	try {
		const serialized = JSON.stringify(data);
		return serialized.length <= maxSize;
	} catch {
		return false;
	}
}

export function validatePerformanceMetric(value: unknown): number | undefined {
	const result = validateNumeric(value, 0, 300_000);
	return result === null ? undefined : result;
}
