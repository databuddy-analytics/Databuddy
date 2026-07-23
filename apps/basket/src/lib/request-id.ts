const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function sanitizeRequestId(value: string | null): string | null {
	const requestId = value?.trim();
	return requestId && REQUEST_ID_PATTERN.test(requestId) ? requestId : null;
}
