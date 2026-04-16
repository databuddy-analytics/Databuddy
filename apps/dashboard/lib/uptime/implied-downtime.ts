function formatDurationSeconds(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) {
		return "0s";
	}
	if (seconds < 60) {
		return `${Math.round(seconds)}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round(seconds % 60);

	if (minutes < 60) {
		return remainingSeconds > 0
			? `${minutes}m ${remainingSeconds}s`
			: `${minutes}m`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Formats the measured downtime for a day.
 * Uses actual `downtimeSeconds` (computed from the gap between
 * each down-check and the next check) when available.
 */
export function formatDailyDowntime(downtimeSeconds: number): string {
	return formatDurationSeconds(downtimeSeconds);
}
