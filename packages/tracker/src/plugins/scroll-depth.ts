import type { BaseTracker } from "../core/tracker";

export function initScrollDepthTracking(tracker: BaseTracker) {
	if (tracker.isServer()) {
		return;
	}

	window.addEventListener(
		"scroll",
		() => {
			const scrollHeight =
				document.documentElement.scrollHeight - window.innerHeight;
			if (scrollHeight <= 0) {
				tracker.maxScrollDepth = 100;
				return;
			}
			const currentScroll = window.scrollY;
			const scrollPercent = Math.min(
				100,
				Math.round((currentScroll / scrollHeight) * 100)
			);
			tracker.maxScrollDepth = Math.max(tracker.maxScrollDepth, scrollPercent);
		},
		{ passive: true }
	);
}
