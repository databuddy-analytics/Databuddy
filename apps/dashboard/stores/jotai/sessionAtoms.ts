import { atom } from 'jotai';
import { atomWithReset, RESET } from 'jotai/utils';
import {
	dynamicQueryFiltersAtom,
	formattedDateRangeAtom,
	timeGranularityAtom,
} from './filterAtoms';

// Create a dependency atom that changes when filters/date range change
const filterDependencyAtom = atom((get) => ({
	dateRange: get(formattedDateRangeAtom),
	granularity: get(timeGranularityAtom),
	filters: get(dynamicQueryFiltersAtom),
}));

// Session UI state atoms that reset when filters change
export const expandedSessionIdAtom = atomWithReset<string | null>(null);

// Session pagination atoms (per website) that reset when filters change
export const sessionPageAtom = atomWithReset<Record<string, number>>({});

// Derived atom to get/set page for specific website
export const getSessionPageAtom = (websiteId: string) =>
	atom(
		(get) => {
			// This will cause the atom to reset when filters change
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

// Auto-reset atoms when filters change
export const autoResetSessionStateAtom = atom(
	(get) => get(filterDependencyAtom),
	(_get, set) => {
		// Reset all session state when filters change
		set(expandedSessionIdAtom, RESET);
		set(sessionPageAtom, RESET);
	}
);
