import {
	clear,
	flush,
	getAnonymousId,
	getSessionId,
	getTracker,
	getTrackingIds,
	getTrackingParams,
	isTrackerAvailable,
	track,
	trackError,
} from "@databuddy/sdk";

const setGlobalProperties = (properties: Record<string, unknown>) => {
	if (typeof window !== "undefined") {
		window.db?.setGlobalProperties(properties);
	}
};

const screenView = (properties?: Record<string, unknown>) => {
	if (typeof window !== "undefined") {
		window.db?.screenView(properties);
	}
};

export function useDatabuddy() {
	return {
		track,
		trackError,
		clear,
		flush,
		getTracker,
		isTrackerAvailable,
		getAnonymousId,
		getSessionId,
		getTrackingIds,
		getTrackingParams,
		setGlobalProperties,
		screenView,
	};
}

export type DatabuddyInstance = ReturnType<typeof useDatabuddy>;
