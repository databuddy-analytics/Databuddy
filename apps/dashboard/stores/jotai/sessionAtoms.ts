import { atom } from "jotai";
import { atomWithReset, RESET } from "jotai/utils";
import {
	dynamicQueryFiltersAtom,
	formattedDateRangeAtom,
	timeGranularityAtom,
} from "./filterAtoms";

const filterDependencyAtom = atom((get) => ({
	dateRange: get(formattedDateRangeAtom),
	granularity: get(timeGranularityAtom),
	filters: get(dynamicQueryFiltersAtom),
}));

export const expandedSessionIdAtom = atomWithReset<string | null>(null);

export const sessionPageAtom = atomWithReset<Record<string, number>>({});

export const getSessionPageAtom = (websiteId: string) =>
	atom(
		(get) => {
			// Subscribe to filter changes so consumers re-read page 1 when they change.
			get(filterDependencyAtom);
			return get(sessionPageAtom)[websiteId] || 1;
		},
		(get, set, page: number | typeof RESET) => {
			if (page === RESET) {
				set(sessionPageAtom, RESET);
				return;
			}
			const current = get(sessionPageAtom);
			set(sessionPageAtom, { ...current, [websiteId]: page });
		}
	);

export const autoResetSessionStateAtom = atom(
	(get) => get(filterDependencyAtom),
	(_get, set) => {
		set(expandedSessionIdAtom, RESET);
		set(sessionPageAtom, RESET);
	}
);
