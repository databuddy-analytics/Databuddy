import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		if (typeof window !== "undefined") {
			const mediaQuery = window.matchMedia(query);

			setMatches(mediaQuery.matches);

			const onChange = () => setMatches(mediaQuery.matches);

			mediaQuery.addEventListener("change", onChange);

			return () => mediaQuery.removeEventListener("change", onChange);
		}

		return;
	}, [query]);

	return matches;
}
