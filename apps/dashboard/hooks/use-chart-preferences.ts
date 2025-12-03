import type {
	ChartStepType,
	ChartType,
} from "@/components/analytics/stat-card";
import { usePersistentState } from "@/hooks/use-persistent-state";

const CHART_PREFERENCES_STORAGE_KEY = "databuddy-chart-preferences";

/**
 * Chart location identifiers - where charts appear in the app
 */
export type ChartLocation =
	| "overview-stats" // Small stat cards on the overview tab (visitors, pageviews, etc.)
	| "overview-main" // Large main chart on the overview tab
	| "funnels" // Funnel analytics stat cards
	| "retention" // Retention analytics stat cards
	| "website-list"; // Mini charts on the websites list page

export const CHART_LOCATIONS: ChartLocation[] = [
	"overview-stats",
	"overview-main",
	"funnels",
	"retention",
	"website-list",
];

export const CHART_LOCATION_LABELS: Record<ChartLocation, string> = {
	"overview-stats": "Overview Stats",
	"overview-main": "Overview Chart",
	funnels: "Funnel Stats",
	retention: "Retention Stats",
	"website-list": "Website List",
};

export const CHART_LOCATION_DESCRIPTIONS: Record<ChartLocation, string> = {
	"overview-stats": "Small stat cards showing visitors, pageviews, etc.",
	"overview-main": "Large main chart on the overview tab",
	funnels: "Stat cards in the funnel analytics section",
	retention: "Stat cards in the retention analytics section",
	"website-list": "Mini charts on the websites list page",
};

function isValidChartType(value: unknown): value is ChartType {
	return (
		typeof value === "string" &&
		(value === "bar" || value === "line" || value === "area")
	);
}

function isValidStepType(value: unknown): value is ChartStepType {
	return (
		typeof value === "string" &&
		(value === "monotone" ||
			value === "linear" ||
			value === "step" ||
			value === "stepBefore" ||
			value === "stepAfter")
	);
}

type LocationPreferences = {
	chartType: ChartType;
	chartStepType: ChartStepType;
};

type AllPreferences = Partial<Record<ChartLocation, LocationPreferences>>;

function isValidPreferences(value: unknown): value is AllPreferences {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	return Object.entries(value).every(([key, val]) => {
		if (!CHART_LOCATIONS.includes(key as ChartLocation)) {
			return false;
		}
		if (typeof val !== "object" || val === null) {
			return false;
		}
		return (
			isValidChartType(val.chartType) && isValidStepType(val.chartStepType)
		);
	});
}

const getDefaultPreferences = (): AllPreferences => {
	const defaults: AllPreferences = {};
	for (const location of CHART_LOCATIONS) {
		defaults[location] = {
			chartType: "area",
			chartStepType: "monotone",
		};
	}
	return defaults;
};

/**
 * Hook to get chart preferences for a specific location
 */
export function useChartPreferences(location: ChartLocation) {
	const [storedPreferences] = usePersistentState<AllPreferences>(
		CHART_PREFERENCES_STORAGE_KEY,
		getDefaultPreferences()
	);

	const allPreferences = isValidPreferences(storedPreferences)
		? storedPreferences
		: getDefaultPreferences();

	const locationPrefs = allPreferences[location] ?? {
		chartType: "area" as ChartType,
		chartStepType: "monotone" as ChartStepType,
	};

	return {
		chartType: locationPrefs.chartType,
		chartStepType: locationPrefs.chartStepType,
	};
}

/**
 * Hook to get and update all chart preferences (for settings page)
 */
export function useAllChartPreferences() {
	const [storedPreferences, setStoredPreferences] =
		usePersistentState<AllPreferences>(
			CHART_PREFERENCES_STORAGE_KEY,
			getDefaultPreferences()
		);

	const allPreferences = isValidPreferences(storedPreferences)
		? storedPreferences
		: getDefaultPreferences();

	const updateLocationPreferences = (
		location: ChartLocation,
		preferences: Partial<LocationPreferences>
	) => {
		setStoredPreferences((prev) => {
			const current = isValidPreferences(prev) ? prev : getDefaultPreferences();
			return {
				...current,
				[location]: {
					...current[location],
					...preferences,
				},
			};
		});
	};

	const updateAllPreferences = (preferences: Partial<LocationPreferences>) => {
		setStoredPreferences((prev) => {
			const current = isValidPreferences(prev) ? prev : getDefaultPreferences();
			const updated: AllPreferences = {};
			for (const location of CHART_LOCATIONS) {
				const currentLocation = current[location] ?? {
					chartType: "area" as ChartType,
					chartStepType: "monotone" as ChartStepType,
				};
				updated[location] = {
					chartType: preferences.chartType ?? currentLocation.chartType,
					chartStepType:
						preferences.chartStepType ?? currentLocation.chartStepType,
				};
			}
			return updated;
		});
	};

	return {
		preferences: allPreferences,
		updateLocationPreferences,
		updateAllPreferences,
	};
}
