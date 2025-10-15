import { useEffect, useRef, useState } from 'react';

export function useFullScreen() {
	const [fullScreen, setFullScreen] = useState(false);
	const [hasMounted, setHasMounted] = useState(false);
	const lastFocusedElement = useRef<HTMLElement | null>(null);
	const modalRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setHasMounted(true);
	}, []);

	useEffect(() => {
		if (!fullScreen) {
			return;
		}

		lastFocusedElement.current = document.activeElement as HTMLElement;
		const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);

		if (focusable?.length) {
			focusable[0].focus();
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setFullScreen(false);
			}
			if (e.key === 'Tab' && focusable && focusable.length) {
				const first = focusable[0];
				const last = Array.from(focusable).at(-1);
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last?.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			lastFocusedElement.current?.focus();
		};
	}, [fullScreen]);

	return {
		fullScreen,
		setFullScreen,
		hasMounted,
		modalRef,
	};
}
