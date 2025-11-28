import { BaseTracker } from "./core/tracker";
import { getTrackerConfig, isOptedOut } from "./core/utils";
import { initWebVitalsTracking } from "./plugins/vitals";

function initializeVitals() {
	if (typeof window === "undefined") {
		return;
	}
	if (isOptedOut()) {
		return;
	}

	const config = getTrackerConfig();
	if (config.clientId) {
		const tracker = new BaseTracker({
			...config,
			trackWebVitals: true,
		});
		initWebVitalsTracking(tracker);
	}
}

if (typeof window !== "undefined") {
	initializeVitals();
}
