import { useEffect, useState } from "react";

/**
 * Hook that monitors whether a given media query matches the current viewport
 * @param query The media query to check, e.g. "(max-width: 768px)"
 * @returns Boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
	// Default to false (needed for SSR)
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		// Check if window exists (for SSR)
		if (typeof window !== "undefined") {
			const mediaQuery = window.matchMedia(query);

			// Set initial state
			setMatches(mediaQuery.matches);

			// Define event listener
			const onChange = () => setMatches(mediaQuery.matches);

			// Add event listener
			mediaQuery.addEventListener("change", onChange);

			// Clean up event listener
			return () => mediaQuery.removeEventListener("change", onChange);
		}

		// Return default value during SSR
		return;
	}, [query]);

	return matches;
}

export default useMediaQuery;
