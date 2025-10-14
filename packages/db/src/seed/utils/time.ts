import type { Faker } from './faker';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface RecentDateOptions {
	days?: number;
	minOffsetMs?: number;
	maxOffsetMs?: number;
}

/**
 * Return a timestamp relative to the supplied anchor date.
 */
export function recentDateMs(
	faker: Faker,
	anchor: Date,
	options: RecentDateOptions = {}
): number {
	const { days = 30, minOffsetMs = 0, maxOffsetMs } = options;
	const maxOffset = maxOffsetMs ?? days * DAY_IN_MS;
	const offset = faker.number.int({
		min: Math.max(0, minOffsetMs),
		max: Math.max(minOffsetMs, maxOffset),
	});

	return anchor.getTime() - offset;
}

export function addMs(timestamp: number, ms: number): number {
	return timestamp + ms;
}

export function addMinutes(timestamp: number, minutes: number): number {
	return addMs(timestamp, minutes * 60 * 1000);
}

export function addSeconds(timestamp: number, seconds: number): number {
	return addMs(timestamp, seconds * 1000);
}
