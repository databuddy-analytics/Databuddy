'use client';

import { useEffect } from 'react';
import pkg from '../package.json' with { type: 'json' };
import type { DatabuddyConfig } from './types';

/**
 * <Databuddy /> component for Next.js/React apps
 * Injects the databuddy.js script with all config as data attributes
 * Usage: <Databuddy clientId="..." trackScreenViews trackPerformance ... />
 */
export function Databuddy(props: DatabuddyConfig) {
	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}
		if (props.disabled) {
			return;
		}
		if (document.querySelector('script[data-databuddy-injected]')) {
			return;
		}
		const script = document.createElement('script');
		script.src = props.scriptUrl || 'https://cdn.databuddy.cc/databuddy.js';
		script.async = true;
		script.crossOrigin = 'anonymous';
		script.setAttribute('data-databuddy-injected', 'true');
		// Always set sdkVersion from package.json unless explicitly overridden
		const sdkVersion = props.sdkVersion || pkg.version;
		script.setAttribute('data-sdk-version', sdkVersion);
		for (const [key, value] of Object.entries(props)) {
			if (value !== undefined && key !== 'sdkVersion') {
				const dataKey = `data-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
				// Convert booleans and numbers to string for HTML attributes
				if (typeof value === 'boolean') {
					script.setAttribute(dataKey, value ? 'true' : 'false');
				} else if (typeof value === 'number') {
					script.setAttribute(dataKey, value.toString());
				} else {
					script.setAttribute(dataKey, String(value));
				}
			}
		}
		document.head.appendChild(script);
		return () => {
			script.remove();
		};
	}, [props]);
	return null;
}

export default Databuddy;
