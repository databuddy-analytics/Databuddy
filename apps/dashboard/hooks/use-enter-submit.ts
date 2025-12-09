"use client";

import { type RefObject, useRef } from "react";

export interface UseEnterSubmitProps {
	formRef: RefObject<HTMLFormElement>;
	onKeyDown: (
		event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
	) => void;
}

export function useEnterSubmit(): UseEnterSubmitProps {
	const formRef = useRef<HTMLFormElement>(null);

	const handleKeyDown = (
		event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
	): void => {
		if (
			event.key === "Enter" &&
			!event.shiftKey &&
			!event.nativeEvent.isComposing
		) {
			formRef.current?.requestSubmit();
			event.preventDefault();
		}
	};

	return { formRef, onKeyDown: handleKeyDown };
}
