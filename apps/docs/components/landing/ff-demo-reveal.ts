"use client";

import { useEffect, useRef, useState } from "react";

/**
 * IntersectionObserver for feature-flag demos: fires once when ~20% visible,
 * with rootMargin so animation starts slightly before full viewport entry.
 */
export function useFfDemoReveal() {
	const ref = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry?.isIntersecting || el.dataset.animated === "true") {
					return;
				}
				el.dataset.animated = "true";
				setVisible(true);
			},
			{ threshold: 0.2, rootMargin: "0px 0px -60px 0px" }
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return { ref, visible };
}
