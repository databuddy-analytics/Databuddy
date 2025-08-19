import { createScript, isScriptInjected } from '../core/script';
import type { DatabuddyConfig } from '../core/types';

/**
 * <Databuddy /> component for Next.js/React apps
 * Injects the databuddy.js script with all config as data attributes
 * Usage: <Databuddy clientId="..." trackScreenViews trackPerformance ... />
 */
export function Databuddy(props: DatabuddyConfig) {
	// Only inject script on client-side and if not already injected
	if (typeof window !== 'undefined' && !props.disabled && !isScriptInjected()) {
		const script = createScript(props);
		document.head.appendChild(script);
	}

	return null;
}
