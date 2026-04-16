import type { BaseTracker } from "../core/tracker";
import { updateMaxScrollDepth } from "./scroll-depth-math";

export function initScrollDepthTracking(tracker: BaseTracker): () => void {
	if (tracker.isServer()) {
		return () => {};
	}

	const handler = () => {
		tracker.maxScrollDepth = updateMaxScrollDepth(
			tracker.maxScrollDepth,
			window.scrollY,
			document.documentElement.scrollHeight,
			window.innerHeight
		);
	};

	window.addEventListener("scroll", handler, { passive: true });

	return () => {
		window.removeEventListener("scroll", handler);
	};
}
