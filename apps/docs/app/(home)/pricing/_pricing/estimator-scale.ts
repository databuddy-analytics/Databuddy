const SLIDER_THRESHOLDS: number[] = [
	0, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000, 250_000_000,
];

const SLIDER_SEGMENT_PCT = 100 / (SLIDER_THRESHOLDS.length - 1);

const clamp = (value: number, min: number, max: number): number =>
	Math.min(Math.max(value, min), max);

export function eventsToSliderValue(events: number): number {
	const last = SLIDER_THRESHOLDS.at(-1) ?? 250_000_000;
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
	return (idx + segFrac) * SLIDER_SEGMENT_PCT;
}

export function sliderValueToEvents(percent: number): number {
	const p = clamp(percent, 0, 100);
	const maxIdx = SLIDER_THRESHOLDS.length - 2;
	const idx = Math.min(maxIdx, Math.floor(p / SLIDER_SEGMENT_PCT));
	const segStartPct = idx * SLIDER_SEGMENT_PCT;
	const segFrac = (p - segStartPct) / SLIDER_SEGMENT_PCT;
	const segStart = SLIDER_THRESHOLDS[idx];
	const segEnd = SLIDER_THRESHOLDS[idx + 1];
	return Math.round(segStart + segFrac * (segEnd - segStart));
}
