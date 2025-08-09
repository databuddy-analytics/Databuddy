export const SLIDER_THRESHOLDS: number[] = [
	0, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000,
];

export const clamp = (value: number, min: number, max: number): number =>
	Math.min(Math.max(value, min), max);

export function eventsToSliderValue(events: number): number {
	const last = SLIDER_THRESHOLDS.at(-1) ?? 100_000_000;
	const clamped = clamp(events, SLIDER_THRESHOLDS[0], last);
	let idx = 0;
	for (let i = 0; i < SLIDER_THRESHOLDS.length - 1; i++) {
		if (
			clamped >= SLIDER_THRESHOLDS[i] &&
			clamped <= SLIDER_THRESHOLDS[i + 1]
		) {
			idx = i;
			break;
		}
	}
	const segStart = SLIDER_THRESHOLDS[idx];
	const segEnd = SLIDER_THRESHOLDS[idx + 1];
	const segFrac =
		segEnd === segStart ? 0 : (clamped - segStart) / (segEnd - segStart);
	return idx * 20 + segFrac * 20;
}

export function sliderValueToEvents(percent: number): number {
	const p = clamp(percent, 0, 100);
	const idx = Math.min(4, Math.floor(p / 20));
	const segStartPct = idx * 20;
	const segFrac = (p - segStartPct) / 20;
	const segStart = SLIDER_THRESHOLDS[idx];
	const segEnd = SLIDER_THRESHOLDS[idx + 1];
	return Math.round(segStart + segFrac * (segEnd - segStart));
}
