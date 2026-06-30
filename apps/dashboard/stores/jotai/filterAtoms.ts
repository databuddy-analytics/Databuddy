import { dayjs, guessTimezone } from "@databuddy/ui";
import { atom } from "jotai";
import type { DynamicQueryFilter } from "./filter-types";
export type { DynamicQueryFilter } from "./filter-types";
import { RECOMMENDED_DEFAULTS } from "../../app/(main)/websites/[id]/_components/utils/tracking-defaults";
import {
	enableAllAdvancedTracking,
	enableAllBasicTracking,
	enableAllOptimization,
} from "../../app/(main)/websites/[id]/_components/utils/tracking-helpers";
import type { TrackingOptions } from "../../app/(main)/websites/[id]/_components/utils/types";

export interface DateRangeState {
	endDate: Date;
	startDate: Date;
}

const initialStartDate = dayjs().subtract(30, "day").toDate();
const initialEndDate = new Date();

export const dateRangeAtom = atom<DateRangeState>({
	startDate: initialStartDate,
	endDate: initialEndDate,
});

export const formattedDateRangeAtom = atom((get) => {
	const { startDate, endDate } = get(dateRangeAtom);
	return {
		startDate: dayjs(startDate).isValid()
			? dayjs(startDate).format("YYYY-MM-DD")
			: "",
		endDate: dayjs(endDate).isValid()
			? dayjs(endDate).format("YYYY-MM-DD")
			: "",
	};
});

export type TimeGranularity = "daily" | "hourly";

const MAX_HOURLY_DAYS = 7;
const AUTO_HOURLY_DAYS = 2;

export const timeGranularityAtom = atom<TimeGranularity>("daily");

export const setDateRangeAndAdjustGranularityAtom = atom(
	null,
	(_get, set, newRange: DateRangeState) => {
		set(dateRangeAtom, newRange);

		const rangeDays = dayjs(newRange.endDate).diff(newRange.startDate, "day");

		if (rangeDays > MAX_HOURLY_DAYS) {
			set(timeGranularityAtom, "daily");
		} else if (rangeDays <= AUTO_HOURLY_DAYS) {
			set(timeGranularityAtom, "hourly");
		}
	}
);

export const timezoneAtom = atom<string>(guessTimezone());

export type BasicFilterValue =
	| string[]
	| number[]
	| string
	| number
	| boolean
	| undefined;
export interface BasicFilters {
	[key: string]: BasicFilterValue;
}

export const basicFiltersAtom = atom<BasicFilters>({});

export type FilterOperator =
	| "is"
	| "isNot"
	| "contains"
	| "doesNotContain"
	| "startsWith"
	| "endsWith"
	| "greaterThan"
	| "lessThan"
	| "in"
	| "notIn"
	| "isSet"
	| "isNotSet";

export interface ComplexFilter {
	field: string;
	id: string;
	operator: FilterOperator;
	value?: string | number | boolean | Array<string | number>;
}

export const complexFiltersAtom = atom<ComplexFilter[]>([]);

export const setBasicFilterAtom = atom(
	null,
	(_get, set, { key, value }: { key: string; value: BasicFilterValue }) => {
		set(basicFiltersAtom, (prev) => {
			if (value === undefined) {
				const { [key]: _, ...rest } = prev;
				return rest;
			}
			return { ...prev, [key]: value };
		});
	}
);

export const clearBasicFilterAtom = atom(null, (_get, set, key?: string) => {
	if (key) {
		set(basicFiltersAtom, (prev) => {
			const { [key]: _, ...rest } = prev;
			return rest;
		});
	} else {
		set(basicFiltersAtom, {});
	}
});

export const upsertComplexFilterAtom = atom(
	null,
	(_get, set, filter: ComplexFilter) => {
		set(complexFiltersAtom, (prev) => {
			const existingIndex = prev.findIndex((f) => f.id === filter.id);
			if (existingIndex > -1) {
				const updatedFilters = [...prev];
				updatedFilters[existingIndex] = filter;
				return updatedFilters;
			}
			return [...prev, filter];
		});
	}
);

export const removeComplexFilterAtom = atom(
	null,
	(_get, set, filterId: string) => {
		set(complexFiltersAtom, (prev) => prev.filter((f) => f.id !== filterId));
	}
);

export const clearComplexFiltersAtom = atom(null, (_get, set) => {
	set(complexFiltersAtom, []);
});

export const clearAllFiltersAtom = atom(null, (_get, set) => {
	set(dateRangeAtom, { startDate: initialStartDate, endDate: initialEndDate });
	set(timeGranularityAtom, "daily");
	set(basicFiltersAtom, {});
	set(complexFiltersAtom, []);
});

export const activeFiltersForApiAtom = atom((get) => {
	const { startDate: fmtStartDate, endDate: fmtEndDate } = get(
		formattedDateRangeAtom
	);
	const granularityValue = get(timeGranularityAtom);
	const basicFiltersValue = get(basicFiltersAtom);
	const complexFiltersValue = get(complexFiltersAtom);
	const timezoneValue = get(timezoneAtom);

	const apiReadyBasicFilters: Record<
		string,
		string | number | boolean | undefined
	> = {};
	for (const key in basicFiltersValue) {
		if (Object.hasOwn(basicFiltersValue, key)) {
			const value = basicFiltersValue[key];
			if (Array.isArray(value)) {
				apiReadyBasicFilters[key] = value.join(",");
			} else {
				apiReadyBasicFilters[key] = value;
			}
		}
	}

	return {
		dateRange: { startDate: fmtStartDate, endDate: fmtEndDate },
		granularity: granularityValue,
		timezone: timezoneValue,
		basicFilters: apiReadyBasicFilters,
		complexFilters: complexFiltersValue,
	};
});

export const selectBasicFilterValueAtom = (key: string) =>
	atom<BasicFilterValue>((get) => get(basicFiltersAtom)[key]);

export const selectComplexFilterByIdAtom = (id: string) =>
	atom<ComplexFilter | undefined>((get) =>
		get(complexFiltersAtom).find((filter) => filter.id === id)
	);

export const hasActiveSubFiltersAtom = atom((get) => {
	const basic = get(basicFiltersAtom);
	const complex = get(complexFiltersAtom);
	return Object.keys(basic).length > 0 || complex.length > 0;
});

export const isAnalyticsRefreshingAtom = atom(false);

const dynamicQueryFiltersBaseAtom = atom<{
	websiteId: string | null;
	filters: DynamicQueryFilter[];
}>({ websiteId: null, filters: [] });

export const currentFilterWebsiteIdAtom = atom<string | null>(null);

export const dynamicQueryFiltersAtom = atom(
	(get) => {
		const { websiteId, filters } = get(dynamicQueryFiltersBaseAtom);
		const currentWebsiteId = get(currentFilterWebsiteIdAtom);
		if (currentWebsiteId && websiteId && currentWebsiteId !== websiteId) {
			return [];
		}
		return filters;
	},
	(get, set, newFilters: DynamicQueryFilter[]) => {
		const currentWebsiteId = get(currentFilterWebsiteIdAtom);
		set(dynamicQueryFiltersBaseAtom, {
			websiteId: currentWebsiteId,
			filters: newFilters,
		});
	}
);

export const addDynamicFilterAtom = atom(
	null,
	(get, set, filter: DynamicQueryFilter) => {
		const prev = get(dynamicQueryFiltersAtom);
		const isDuplicate = prev.some(
			(existing) =>
				existing.field === filter.field &&
				existing.value === filter.value &&
				existing.operator === filter.operator
		);

		if (!isDuplicate) {
			set(dynamicQueryFiltersAtom, [...prev, filter]);
		}
	}
);

export const removeDynamicFilterAtom = atom(
	null,
	(get, set, filter: Partial<DynamicQueryFilter>) => {
		const prev = get(dynamicQueryFiltersAtom);
		set(
			dynamicQueryFiltersAtom,
			prev.filter(
				(existing) =>
					!(
						existing.field === filter.field &&
						existing.value === filter.value &&
						existing.operator === filter.operator
					)
			)
		);
	}
);

export const clearDynamicFiltersAtom = atom(null, (_get, set) => {
	set(dynamicQueryFiltersAtom, []);
});

export type EditingSavedFilter = {
	id: string;
	name: string;
	originalFilters: DynamicQueryFilter[];
} | null;

export const editingSavedFilterAtom = atom<EditingSavedFilter>(null);

export interface SavedFilter {
	createdAt: string;
	filters: DynamicQueryFilter[];
	id: string;
	name: string;
	updatedAt: string;
}

const savedFiltersBaseAtom = atom<{
	websiteId: string | null;
	filters: SavedFilter[];
	loaded: boolean;
}>({ websiteId: null, filters: [], loaded: false });

export const savedFiltersAtom = atom(
	(get) => {
		const { filters, loaded } = get(savedFiltersBaseAtom);
		return { savedFilters: filters, isLoading: !loaded };
	},
	(_get, set, update: { websiteId: string; filters: SavedFilter[] }) => {
		set(savedFiltersBaseAtom, {
			websiteId: update.websiteId,
			filters: update.filters,
			loaded: true,
		});
	}
);

export const trackingOptionsAtom = atom<TrackingOptions>(RECOMMENDED_DEFAULTS);

export const setTrackingOptionsAtom = atom(
	null,
	(_get, set, newOptions: TrackingOptions) => {
		set(trackingOptionsAtom, newOptions);
	}
);

export const toggleTrackingOptionAtom = atom(
	null,
	(get, set, option: keyof TrackingOptions) => {
		const current = get(trackingOptionsAtom);
		set(trackingOptionsAtom, {
			...current,
			[option]: !current[option],
		});
	}
);

export const resetTrackingOptionsAtom = atom(null, (_get, set) => {
	set(trackingOptionsAtom, RECOMMENDED_DEFAULTS);
});

export const enableAllBasicTrackingAtom = atom(null, (get, set) => {
	const current = get(trackingOptionsAtom);
	set(trackingOptionsAtom, enableAllBasicTracking(current));
});

export const enableAllAdvancedTrackingAtom = atom(null, (get, set) => {
	const current = get(trackingOptionsAtom);
	set(trackingOptionsAtom, enableAllAdvancedTracking(current));
});

export const enableAllOptimizationAtom = atom(null, (get, set) => {
	const current = get(trackingOptionsAtom);
	set(trackingOptionsAtom, enableAllOptimization(current));
});
