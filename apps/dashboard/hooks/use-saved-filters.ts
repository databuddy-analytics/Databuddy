"use client";

import { filterOptions } from "@/lib/filter-options";
import { savedFiltersAtom, type SavedFilter } from "@/stores/jotai/filterAtoms";
import type { DynamicQueryFilter } from "@/types/api";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

export type { SavedFilter } from "@/stores/jotai/filterAtoms";

export interface SavedFilterError {
	message: string;
	type:
		| "storage_quota"
		| "invalid_data"
		| "duplicate_name"
		| "validation_error";
}

const STORAGE_KEY = "databuddy-saved-filters";
const MAX_FILTERS_PER_WEBSITE = 50;
const MAX_FILTER_NAME_LENGTH = 100;
const VALID_FILTER_FIELDS = new Set(
	filterOptions.map((option) => option.value as string)
);

function getStorageKey(websiteId: string): string {
	return `${STORAGE_KEY}-${websiteId}`;
}

function createSavedFilterId(): string {
	return `saved-filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function validationError(message: string): SavedFilterError {
	return { type: "validation_error", message };
}

function maxFiltersError(): SavedFilterError {
	return validationError(
		`Maximum of ${MAX_FILTERS_PER_WEBSITE} saved filters allowed per website`
	);
}

function isSavedFilter(filter: unknown): filter is SavedFilter {
	return (
		typeof filter === "object" &&
		filter !== null &&
		"id" in filter &&
		"name" in filter &&
		"filters" in filter &&
		"createdAt" in filter &&
		"updatedAt" in filter &&
		typeof filter.id === "string" &&
		typeof filter.name === "string" &&
		Array.isArray(filter.filters) &&
		typeof filter.createdAt === "string" &&
		typeof filter.updatedAt === "string"
	);
}

function isValidFilter(filter: DynamicQueryFilter): boolean {
	return Boolean(
		VALID_FILTER_FIELDS.has(filter.field) && filter.operator && filter.value
	);
}

function cleanSavedFilters(savedFilters: SavedFilter[]): SavedFilter[] {
	return savedFilters
		.map((savedFilter) => {
			const filters = savedFilter.filters.filter(isValidFilter);
			return filters.length > 0 ? { ...savedFilter, filters } : null;
		})
		.filter((filter): filter is SavedFilter => filter !== null);
}

function hasRemovedFilters(
	before: SavedFilter[],
	after: SavedFilter[]
): boolean {
	return (
		after.length !== before.length ||
		after.some(
			(filter, index) => filter.filters.length !== before[index]?.filters.length
		)
	);
}

function validateFilterName(
	name: string,
	savedFilters: SavedFilter[],
	excludeId?: string
): SavedFilterError | null {
	const trimmedName = name.trim();

	if (!trimmedName) {
		return validationError("Filter name is required");
	}
	if (trimmedName.length < 2) {
		return validationError("Filter name must be at least 2 characters");
	}
	if (trimmedName.length > MAX_FILTER_NAME_LENGTH) {
		return validationError(
			`Filter name must be less than ${MAX_FILTER_NAME_LENGTH} characters`
		);
	}
	if (
		savedFilters.some(
			(filter) =>
				filter.id !== excludeId &&
				filter.name.toLowerCase() === trimmedName.toLowerCase()
		)
	) {
		return {
			type: "duplicate_name",
			message: "A filter with this name already exists",
		};
	}

	return null;
}

function validateFilters(
	filters: DynamicQueryFilter[]
): SavedFilterError | null {
	if (!filters.length) {
		return validationError("At least one filter is required");
	}

	for (const filter of filters) {
		if (!VALID_FILTER_FIELDS.has(filter.field)) {
			return validationError(`Invalid filter field: ${filter.field}`);
		}
		if (!(filter.operator && filter.value)) {
			return validationError("All filters must have an operator and value");
		}
	}

	return null;
}

function loadFromStorage(websiteId: string): SavedFilter[] {
	if (typeof window === "undefined") {
		return [];
	}

	try {
		const stored = localStorage.getItem(getStorageKey(websiteId));
		const parsed = stored ? JSON.parse(stored) : [];
		return Array.isArray(parsed) ? parsed.filter(isSavedFilter) : [];
	} catch (error) {
		console.error("Failed to load saved filters:", error);
		return [];
	}
}

function persistToStorage(
	websiteId: string,
	savedFilters: SavedFilter[]
): { success: boolean; error?: SavedFilterError } {
	if (typeof window === "undefined") {
		return {
			success: false,
			error: { type: "storage_quota", message: "Not available server-side" },
		};
	}

	try {
		localStorage.setItem(
			getStorageKey(websiteId),
			JSON.stringify(savedFilters)
		);
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown storage error";
		return {
			success: false,
			error: {
				type: "storage_quota",
				message:
					message.includes("quota") || message.includes("QuotaExceededError")
						? "Storage quota exceeded. Try deleting some saved filters."
						: `Failed to save: ${message}`,
			},
		};
	}
}

function nextCopyName(name: string, savedFilters: SavedFilter[]): string {
	let copyName = `${name} (Copy)`;
	let copyIndex = 2;

	while (
		savedFilters.some(
			(filter) => filter.name.toLowerCase() === copyName.toLowerCase()
		)
	) {
		copyName = `${name} (Copy ${copyIndex})`;
		copyIndex++;
	}

	return copyName;
}

export function useSavedFilters(websiteId: string) {
	const [{ savedFilters, isLoading }, setAtom] = useAtom(savedFiltersAtom);
	const initializedRef = useRef<string | null>(null);

	useEffect(() => {
		if (initializedRef.current === websiteId) {
			return;
		}
		initializedRef.current = websiteId;
		setAtom({ websiteId, filters: loadFromStorage(websiteId) });
	}, [websiteId, setAtom]);

	const updateFilters = useCallback(
		(updater: (prev: SavedFilter[]) => SavedFilter[]) => {
			const next = updater(savedFilters);
			setAtom({ websiteId, filters: next });
			const result = persistToStorage(websiteId, next);
			if (!result.success && result.error) {
				toast.error(`Storage Error: ${result.error.message}`);
			}
		},
		[savedFilters, websiteId, setAtom]
	);

	useEffect(() => {
		if (isLoading || savedFilters.length === 0) {
			return;
		}

		const cleanedFilters = cleanSavedFilters(savedFilters);
		if (hasRemovedFilters(savedFilters, cleanedFilters)) {
			updateFilters(() => cleanedFilters);
			if (cleanedFilters.length < savedFilters.length) {
				toast.info("Some saved filters were removed due to invalid fields");
			}
		}
	}, [isLoading, savedFilters, updateFilters]);

	const validateFilterNameCallback = useCallback(
		(name: string, excludeId?: string): SavedFilterError | null =>
			validateFilterName(name, savedFilters, excludeId),
		[savedFilters]
	);

	const saveFilter = useCallback(
		(
			name: string,
			filters: DynamicQueryFilter[]
		): { success: boolean; data?: SavedFilter; error?: SavedFilterError } => {
			const nameError = validateFilterName(name, savedFilters);
			const filtersError = validateFilters(filters);
			if (nameError || filtersError) {
				return {
					success: false,
					error: nameError ?? filtersError ?? undefined,
				};
			}
			if (savedFilters.length >= MAX_FILTERS_PER_WEBSITE) {
				return { success: false, error: maxFiltersError() };
			}

			const now = new Date().toISOString();
			const newFilter: SavedFilter = {
				id: createSavedFilterId(),
				name: name.trim(),
				filters: [...filters],
				createdAt: now,
				updatedAt: now,
			};

			updateFilters((prev) => [...prev, newFilter]);
			toast.success(`Filter "${newFilter.name}" saved successfully`);
			return { success: true, data: newFilter };
		},
		[savedFilters, updateFilters]
	);

	const updateFilter = useCallback(
		(
			id: string,
			name: string,
			filters: DynamicQueryFilter[]
		): { success: boolean; data?: SavedFilter; error?: SavedFilterError } => {
			const existing = savedFilters.find((filter) => filter.id === id);
			if (!existing) {
				return { success: false, error: validationError("Filter not found") };
			}

			const nameError = validateFilterName(name, savedFilters, id);
			const filtersError = validateFilters(filters);
			if (nameError || filtersError) {
				return {
					success: false,
					error: nameError ?? filtersError ?? undefined,
				};
			}

			const updatedFilter: SavedFilter = {
				...existing,
				name: name.trim(),
				filters: [...filters],
				updatedAt: new Date().toISOString(),
			};

			updateFilters((prev) =>
				prev.map((filter) => (filter.id === id ? updatedFilter : filter))
			);
			toast.success(`Filter "${updatedFilter.name}" updated successfully`);
			return { success: true, data: updatedFilter };
		},
		[savedFilters, updateFilters]
	);

	const deleteFilter = useCallback(
		(id: string): { success: boolean; error?: SavedFilterError } => {
			const filterToDelete = savedFilters.find((filter) => filter.id === id);
			if (!filterToDelete) {
				return { success: false, error: validationError("Filter not found") };
			}

			updateFilters((prev) => prev.filter((filter) => filter.id !== id));
			toast.success(`Filter "${filterToDelete.name}" deleted successfully`);
			return { success: true };
		},
		[savedFilters, updateFilters]
	);

	const getFilter = useCallback(
		(id: string): SavedFilter | null =>
			savedFilters.find((filter) => filter.id === id) || null,
		[savedFilters]
	);

	const duplicateFilter = useCallback(
		(
			id: string
		): { success: boolean; data?: SavedFilter; error?: SavedFilterError } => {
			const existing = savedFilters.find((filter) => filter.id === id);
			if (!existing) {
				return { success: false, error: validationError("Filter not found") };
			}
			if (savedFilters.length >= MAX_FILTERS_PER_WEBSITE) {
				return { success: false, error: maxFiltersError() };
			}

			const now = new Date().toISOString();
			const duplicatedFilter: SavedFilter = {
				...existing,
				id: createSavedFilterId(),
				name: nextCopyName(existing.name, savedFilters),
				createdAt: now,
				updatedAt: now,
			};

			updateFilters((prev) => [...prev, duplicatedFilter]);
			toast.success(`Filter duplicated as "${duplicatedFilter.name}"`);
			return { success: true, data: duplicatedFilter };
		},
		[savedFilters, updateFilters]
	);

	const deleteAllFilters = useCallback(() => {
		updateFilters(() => []);
		toast.success("All saved filters deleted successfully");
	}, [updateFilters]);

	return {
		savedFilters,
		isLoading,
		saveFilter,
		updateFilter,
		deleteFilter,
		getFilter,
		duplicateFilter,
		deleteAllFilters,
		validateFilterName: validateFilterNameCallback,
	};
}
