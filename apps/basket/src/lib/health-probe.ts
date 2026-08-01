export const BASKET_HEALTH_PROBE_TIMEOUT_MS = 5000;

export class HealthProbeTimeoutError extends Error {
	readonly timeoutMs: number;

	constructor(timeoutMs: number) {
		super(`Dependency health probe exceeded ${timeoutMs}ms`);
		this.name = "HealthProbeTimeoutError";
		this.timeoutMs = timeoutMs;
	}
}

export function withHealthProbeDeadline<T>(
	probe: () => Promise<T>,
	timeoutMs = BASKET_HEALTH_PROBE_TIMEOUT_MS
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => {
			reject(new HealthProbeTimeoutError(timeoutMs));
		}, timeoutMs);
		timeout.unref?.();
	});

	return Promise.race([Promise.resolve().then(probe), deadline]).finally(() => {
		if (timeout) {
			clearTimeout(timeout);
		}
	});
}
