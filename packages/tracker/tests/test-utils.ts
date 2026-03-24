import type { Request } from "@playwright/test";

/**
 * Finds a matching event in a request payload, handling both
 * individual events and batched arrays sent to /batch.
 */
export function findEvent(
	req: Request,
	predicate: (event: Record<string, unknown>) => boolean
): Record<string, unknown> | undefined {
	if (!req.url().includes("basket.databuddy.cc")) {
		return undefined;
	}
	try {
		const data = req.postDataJSON();
		if (Array.isArray(data)) {
			return data.find(predicate);
		}
		return predicate(data) ? data : undefined;
	} catch {
		return undefined;
	}
}

export function hasEvent(
	req: Request,
	predicate: (event: Record<string, unknown>) => boolean
): boolean {
	return !!findEvent(req, predicate);
}

/**
 * Counts events matching a predicate across individual and batched payloads.
 */
export function countEvents(
	req: Request,
	predicate: (event: Record<string, unknown>) => boolean
): number {
	if (!req.url().includes("basket.databuddy.cc")) {
		return 0;
	}
	try {
		const data = req.postDataJSON();
		if (Array.isArray(data)) {
			return data.filter(predicate).length;
		}
		return predicate(data) ? 1 : 0;
	} catch {
		return 0;
	}
}
