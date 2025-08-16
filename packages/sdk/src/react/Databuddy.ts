import { useEffect } from 'react';
import type { DatabuddyConfig } from '../core/types';
import { createScript, isScriptInjected } from '../core/script';

/**
 * <Databuddy /> component for Next.js/React apps
 * Injects the databuddy.js script with all config as data attributes
 * Usage: <Databuddy clientId="..." trackScreenViews trackPerformance ... />
 */
export function Databuddy(props: DatabuddyConfig) {
	useEffect(() => {
		if (props.disabled || isScriptInjected()) {
			return;
		}

		const script = createScript(props);

		document.head.appendChild(script);

		return () => {
			script.remove();
		};
	}, [props]);

	return null;
}
