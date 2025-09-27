import { version } from '../../package.json';
import type { DatabuddyConfig } from './types';

const INJECTED_SCRIPT_ATTRIBUTE = 'data-databuddy-injected';

export function isScriptInjected() {
	return !!document.querySelector(`script[${INJECTED_SCRIPT_ATTRIBUTE}]`);
}

export function createScript({
	scriptUrl,
	sdkVersion,
	...props
}: DatabuddyConfig) {
	const script = document.createElement('script');

	script.src = scriptUrl || 'https://cdn.databuddy.cc/databuddy.js';
	script.async = true;
	script.crossOrigin = 'anonymous';
	script.setAttribute(INJECTED_SCRIPT_ATTRIBUTE, 'true');
	script.setAttribute('data-sdk-version', sdkVersion || version);

	for (const [key, value] of Object.entries(props)) {
		const dataKey = `data-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;

		if (Array.isArray(value) || (value && typeof value === 'object')) {
			script.setAttribute(dataKey, JSON.stringify(value));
		} else {
			script.setAttribute(dataKey, String(value));
		}
	}

	return script;
}
