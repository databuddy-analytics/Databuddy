import { createScript, isScriptInjected } from "@/core/script";
import type { DatabuddyConfig } from "@/core/types";
import { detectClientId } from "@/utils";

/**
 * <Databuddy /> component for Next.js/React apps
 * Injects the databuddy.js script with all config as data attributes
 * Usage: <Databuddy clientId="..." trackScreenViews trackPerformance ... />
 * Or simply: <Databuddy /> (auto-detects clientId from environment variables)
 */
export function Databuddy(props: DatabuddyConfig) {
	const clientId = detectClientId(props.clientId);

	if (!clientId) {
		if (typeof window !== "undefined" && !props.disabled && props.debug) {
			console.warn(
				"Databuddy: No client ID found. Please provide clientId prop or set NEXT_PUBLIC_DATABUDDY_CLIENT_ID environment variable."
			);
		}
		return null;
	}

	if (typeof window !== "undefined" && !props.disabled && !isScriptInjected()) {
		const script = createScript({ ...props, clientId });
		document.head.appendChild(script);
	}

	return null;
}
