import { track } from"@databuddy/sdk";
import { useEffect, useRef } from"react";
import { useSonner } from"sonner";

export function useToastTracking() {
	const { toasts } = useSonner();
	const tracked = useRef(new Set<string | number>());

	useEffect(() => {
		for (const toast of toasts) {
			if (!tracked.current.has(toast.id)) {
				tracked.current.add(toast.id);
				track("toast_shown", {
					type: toast.type, // success, error, warning, info
					message: toast.title,
				});
			}
		}
	}, [toasts]);
}
