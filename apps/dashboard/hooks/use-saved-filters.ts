"use client";

import { filterOptions } from "@databuddy/shared/lists/filters";
import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
	type SavedFilter,
	savedFiltersAtom,
} from "@/stores/jotai/filterAtoms";

export type { SavedFilter };

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

function getStorageKey(websiteId: string): string {
	return `${STORAGE_KEY}-${websiteId}`;
}

function loadFromStorage(websiteId: string): SavedFilter[] {
	if (typeof window === "undefined") {
		return [];
	}

	try {
		const stored = localStorage.getItem(getStorageKey(websiteId));
		if (!stored) {
			return [];
		}

		const parsed = JSON.parse(stored);
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.filter(
			(filter: unknown): filter is SavedFilter =>
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
		const data = JSON.stringify(savedFilters);
		localStorage.setItem(getStorageKey(websiteId), data);
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown storage error";
		if (message.includes("quota") || message.includes("QuotaExceededError")) {
			return {
				success: false,
				error: {
					type: "storage_quota",
					message: "Storage quota exceeded. Try deleting some saved filters.",
				},
			};
		}
		return {
			success: false,
			error: {
				type: "storage_quota",
				message: `Failed to save: ${message}`,
			},
		};
	}
}

export function useSavedFilters(websiteId: string) {
	const [{ savedFilters, isLoading }, setAtom] = useAtom(savedFiltersAtom);
	const initializedRef = useRef<string | null>(null);

	useEffect(() => {
		if (initializedRef.current === websiteId) {
			return;
		}
		initializedRef.current = websiteId;
		const filters = loadFromStorage(websiteId);
		setAtom({ websiteId, filters });
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

		const validFieldValues = new Set(
			filterOptions.map((option) => option.value as string)
		);

		const cleanedFilters = savedFilters
			.map((savedFilter) => {
				const validFilters = savedFilter.filters.filter(
					(filter) =>
						validFieldValues.has(filter.field) &&
						filter.operator &&
						filter.value
				);

				return validFilters.length > 0
					? { ...savedFilter, filters: validFilters }
					: null;
			})
			.filter(Boolean) as SavedFilter[];

		if (
			cleanedFilters.length !== savedFilters.length ||
			cleanedFilters.some(
				(cleaned, index) =>
					cleaned.filters.length !== savedFilters[index]?.filters.length
			)
		) {
			updateFilters(() => cleanedFilters);
			if (cleanedFilters.length < savedFilters.length) {
				toast.info("Some saved filters were removed due to invalid fields");
			}
		}
	}, [isLoading, savedFilters, updateFilters]);

	const validateFilterName = useCallback(
		(name: string, excludeId?: string): SavedFilterError | null => {
			const trimmedName = name.trim();

			if (!trimmedName) {
				return { type: "validation_error", message: "Filter name is required" };
			}

			if (trimmedName.length < 2) {
				return {
					type: "validation_error",
					message: "Filter name must be at least 2 characters",
				};
			}

			if (trimmedName.length > MAX_FILTER_NAME_LENGTH) {
				return {
					type: "validation_error",
					message: `Filter name must be less than ${MAX_FILTER_NAME_LENGTH} characters`,
				};
			}

			const isDuplicate = savedFilters.some(
				(filter) =>
					filter.id !== excludeId &&
					filter.name.toLowerCase() === trimmedName.toLowerCase()
			);

			if (isDuplicate) {
				return {
					type: "duplicate_name",
					message: "A filter with this name already exists",
				};
			}

			return null;
		},
		[savedFilters]
	);

	const validateFilters = useCallback(
		(filters: DynamicQueryFilter[]): SavedFilterError | null => {
			if (!filters.length) {
				return {
					type: "validation_error",
					message: "At least one filter is required",
				};
			}

			const validFieldValues = new Set(
				filterOptions.map((option) => option.value as string)
			);

			for (const filter of filters) {
				if (!validFieldValues.has(filter.field)) {
					return {
						type: "validation_error",
						message: `Invalid filter field: ${filter.field}`,
					};
				}

				if (!(filter.operator && filter.value)) {
					return {
						type: "validation_error",
						message: "All filters must have an operator and value",
					};
				}
			}

			return null;
		},
		[]
	);

	const saveFilter = useCallback(
		(
			name: string,
			filters: DynamicQueryFilter[]
		): { success: boolean; data?: SavedFilter; error?: SavedFilterError } => {
			const nameError = validateFilterName(name);
			if (nameError) {
				return { success: false, error: nameError };
			}

			const filtersError = validateFilters(filters);
			if (filtersError) {
				return { success: false, error: filtersError };
			}

			if (savedFilters.length >= MAX_FILTERS_PER_WEBSITE) {
				return {
					success: false,
					error: {
						type: "validation_error",
						message: `Maximum of ${MAX_FILTERS_PER_WEBSITE} saved filters allowed per website`,
					},
				};
			}

			const newFilter: SavedFilter = {
				id: `saved-filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				name: name.trim(),
				filters: [...filters],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			updateFilters((prev) => [...prev, newFilter]);
			toast.success(`Filter "${newFilter.name}" saved successfully`);
			return { success: true, data: newFilter };
		},
		[savedFilters, validateFilterName, validateFilters, updateFilters]
	);

	const updateFilter = useCallback(
		(
			id: string,
			name: string,
			filters: DynamicQueryFilter[]
		): { success: boolean; data?: SavedFilter; error?: SavedFilterError } => {
			const existing = savedFilters.find((f) => f.id === id);
			if (!existing) {
				return {
					success: false,
					error: { type: "validation_error", message: "Filter not found" },
				};
			}

			const updatedFilter: SavedFilter = {
				...existing,
				name: name.trim(),
				filters: [...filters],
				updatedAt: new Date().toISOString(),
			};

			updateFilters((prev) =>
				prev.map((f) => (f.id === id ? updatedFilter : f))
			);
			toast.success(`Filter "${updatedFilter.name}" updated successfully`);
			return { success: true, data: updatedFilter };
		},
		[savedFilters, updateFilters]
	);

	const deleteFilter = useCallback(
		(id: string): { success: boolean; error?: SavedFilterError } => {
			const filterToDelete = savedFilters.find((f) => f.id === id);
			if (!filterToDelete) {
				return {
					success: false,
					error: { type: "validation_error", message: "Filter not found" },
				};
			}

			updateFilters((prev) => prev.filter((f) => f.id !== id));
			toast.success(`Filter "${filterToDelete.name}" deleted successfully`);
			return { success: true };
		},
		[savedFilters, updateFilters]
	);

	const getFilter = useCallback(
		(id: string): SavedFilter | null =>
			savedFilters.find((f) => f.id === id) || null,
		[savedFilters]
	);

	const duplicateFilter = useCallback(
		(
			id: string
		): { success: boolean; data?: SavedFilter; error?: SavedFilterError } => {
			const existing = savedFilters.find((f) => f.id === id);
			if (!existing) {
				return {
					success: false,
					error: { type: "validation_error", message: "Filter not found" },
				};
			}

			if (savedFilters.length >= MAX_FILTERS_PER_WEBSITE) {
				return {
					success: false,
					error: {
						type: "validation_error",
						message: `Maximum of ${MAX_FILTERS_PER_WEBSITE} saved filters allowed per website`,
					},
				};
			}

			let copyName = `${existing.name} (Copy)`;
			let copyIndex = 2;

			while (
				savedFilters.some(
					(filter) => filter.name.toLowerCase() === copyName.toLowerCase()
				)
			) {
				copyName = `${existing.name} (Copy ${copyIndex})`;
				copyIndex++;
			}

			const duplicatedFilter: SavedFilter = {
				...existing,
				id: `saved-filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				name: copyName,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
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
		validateFilterName,
	};
}
