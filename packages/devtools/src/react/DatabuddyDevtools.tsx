import { useEffect } from "react";
import { mountDevtools } from "../ui";

export interface DatabuddyDevtoolsProps {
	enabled?: boolean;
	keyboardShortcut?: boolean;
}

export function DatabuddyDevtools({
	enabled = true,
	keyboardShortcut = true,
}: DatabuddyDevtoolsProps) {
	useEffect(() => {
		if (!enabled) {
			return;
		}
		return mountDevtools({ keyboardShortcut });
	}, [enabled, keyboardShortcut]);

	return null;
}
