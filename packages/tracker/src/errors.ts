import { BaseTracker } from "./core/tracker";
import { getTrackerConfig, isOptedOut } from "./core/utils";
import { initErrorTracking } from "./plugins/errors";

function initializeErrors() {
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
			trackErrors: true,
		});
		initErrorTracking(tracker);
	}
}

if (typeof window !== "undefined") {
	initializeErrors();
}
