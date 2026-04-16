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
