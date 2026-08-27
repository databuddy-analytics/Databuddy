import { atom } from "jotai";
import type { DynamicQueryFilter } from "./filter-types";
export type { DynamicQueryFilter } from "./filter-types";
import { RECOMMENDED_DEFAULTS } from "../../app/(main)/websites/[id]/_components/utils/tracking-defaults";
import type { TrackingOptions } from "../../app/(main)/websites/[id]/_components/utils/types";

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
