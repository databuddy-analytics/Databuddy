import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to detect if we're running on the client side after hydration
 */
function useIsClient() {
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	return isClient;
}

/**
 * Custom hook for persisting state to localStorage with SSR compatibility.
 * Prevents hydration mismatches by using default values during SSR.
 */
export function usePersistentState<T>(
	key: string,
	defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
	const isClient = useIsClient();

	// Initialize state with localStorage value only on client, default on server
	const [state, setState] = useState<T>(() => {
		if (!isClient) {
			return defaultValue;
		}

		try {
			const item = window.localStorage.getItem(key);
			return item ? JSON.parse(item) : defaultValue;
		} catch (error) {
			console.error(`Error reading localStorage key "${key}":`, error);
			return defaultValue;
		}
	});

	// Sync with localStorage when client-side and key changes
	useEffect(() => {
		if (!isClient) {
			return;
		}

		try {
			const item = window.localStorage.getItem(key);
			if (item) {
				const parsedValue = JSON.parse(item);
				setState(parsedValue);
			}
		} catch (error) {
			console.error(`Error reading localStorage key "${key}":`, error);
		}
	}, [key, isClient]);

	const setPersistentState = useCallback(
		(value: T | ((prev: T) => T)) => {
			try {
				setState((prevState) => {
					// Allow function updates
					const valueToStore =
						value instanceof Function ? value(prevState) : value;

					// Only persist to localStorage on client side
					if (isClient && typeof window !== 'undefined') {
						window.localStorage.setItem(key, JSON.stringify(valueToStore));
					}

					return valueToStore;
				});
			} catch (error) {
				console.error(`Error setting localStorage key "${key}":`, error);
			}
		},
		[key, isClient]
	);

	return [state, setPersistentState];
}

/**
 * Specialized hook for accordion states in the sidebar navigation.
 * Manages multiple accordion sections with their expanded/collapsed states.
 */
export function useAccordionStates(storageKey = 'sidebar-accordion-states') {
	const [accordionStates, setAccordionStates] = usePersistentState<
		Record<string, boolean>
	>(storageKey, {});

	const toggleAccordion = useCallback(
		(sectionTitle: string, defaultState = true) => {
			setAccordionStates((prev) => {
				const currentState = prev[sectionTitle] ?? defaultState;
				return {
					...prev,
					[sectionTitle]: !currentState,
				};
			});
		},
		[setAccordionStates]
	);

	const getAccordionState = useCallback(
		(sectionTitle: string, defaultState = true) => {
			return accordionStates[sectionTitle] ?? defaultState;
		},
		[accordionStates]
	);

	const setAccordionState = useCallback(
		(sectionTitle: string, isExpanded: boolean) => {
			setAccordionStates((prev) => ({
				...prev,
				[sectionTitle]: isExpanded,
			}));
		},
		[setAccordionStates]
	);

	return {
		toggleAccordion,
		getAccordionState,
		setAccordionState,
	};
}
