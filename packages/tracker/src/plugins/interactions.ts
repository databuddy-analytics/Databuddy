import type { BaseTracker } from "../core/tracker";

export function initInteractionTracking(tracker: BaseTracker): () => void {
	if (tracker.isServer()) {
		return () => {};
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

	const handler = () => {
		tracker.interactionCount += 1;
	};

	for (const eventType of interactionEvents) {
		window.addEventListener(eventType, handler, { passive: true });
	}

	return () => {
		for (const eventType of interactionEvents) {
			window.removeEventListener(eventType, handler);
		}
	};
}
