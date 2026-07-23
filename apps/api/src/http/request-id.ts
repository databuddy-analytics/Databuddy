const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const requestIds = new WeakMap<Request, string>();

function createRequestId(): string {
	return `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function getRequestId(request?: Request): string {
	if (!request) {
		return createRequestId();
	}

	const existing = requestIds.get(request);
	if (existing) {
		return existing;
	}

	const supplied = request.headers.get("x-request-id")?.trim();
	const requestId =
		supplied && REQUEST_ID_PATTERN.test(supplied)
			? supplied
			: createRequestId();
	requestIds.set(request, requestId);
	return requestId;
}
