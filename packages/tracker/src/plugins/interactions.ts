import type { BaseTracker } from "../core/tracker";

export function initInteractionTracking(tracker: BaseTracker) {
	if (tracker.isServer()) {
		return;
	}

	const interactionEvents = [
		"mousedown",
		"keydown",
		"scroll",
		"touchstart",
		"click",
		"keypress",
		"mousemove",
	];

	for (const eventType of interactionEvents) {
		window.addEventListener(
			eventType,
			() => {
				tracker.interactionCount += 1;
			},
			{ passive: true }
		);
	}
}
