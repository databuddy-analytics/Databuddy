import { ACTUAL_LIBRARY_DEFAULTS } from './tracking-defaults';
import type { TrackingOptions } from './types';

/**
 * Generate HTML script tag for tracking
 */
export function generateScriptTag(
	websiteId: string,
	trackingOptions: TrackingOptions
): string {
	const isLocalhost = process.env.NODE_ENV === 'development';
	const scriptUrl = isLocalhost
		? 'http://localhost:3000/databuddy.js'
		: 'https://cdn.databuddy.cc/databuddy.js';
	const _apiUrl = isLocalhost
		? 'http://localhost:4000'
		: 'https://basket.databuddy.cc';

	const options = Object.entries(trackingOptions)
		.filter(([key, value]) => {
			const actualDefault =
				ACTUAL_LIBRARY_DEFAULTS[key as keyof TrackingOptions];
			if (value === actualDefault) {
				return false;
			}
			if (typeof value === 'boolean' && !value && !actualDefault) {
				return false;
			}
			return true;
		})
		.map(
			([key, value]) =>
				`data-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}="${value}"`
		)
		.join('\n    ');

	const optionsLine = options ? `    ${options}\n` : '';

	return `<script
    src="${scriptUrl}"
    data-client-id="${websiteId}"
${optionsLine}    crossorigin="anonymous"
    async
  ></script>`;
}

/**
 * Generate full NPM code example with import and usage
 */
export function generateNpmCode(
	websiteId: string,
	trackingOptions: TrackingOptions
): string {
	const meaningfulProps = Object.entries(trackingOptions)
		.filter(([key, value]) => {
			const actualDefault =
				ACTUAL_LIBRARY_DEFAULTS[key as keyof TrackingOptions];
			if (value === actualDefault) {
				return false;
			}
			if (typeof value === 'boolean' && !value && !actualDefault) {
				return false;
			}
			return true;
		})
		.map(([key, value]) => {
			if (typeof value === 'boolean') {
				return `        ${key}={${value}}`;
			}
			if (typeof value === 'string') {
				return `        ${key}="${value}"`;
			}
			return `        ${key}={${value}}`;
		});

	const propsString =
		meaningfulProps.length > 0 ? `\n${meaningfulProps.join('\n')}\n      ` : '';

	return `import { Databuddy } from '@databuddy/sdk';

function AppLayout({ children }) {
  return (
    <>
      {children}
      <Databuddy
        clientId="${websiteId}"${propsString}/>
    </>
  );
}`;
}

/**
 * Generate just the NPM component code (for copying)
 */
export function generateNpmComponentCode(
	websiteId: string,
	trackingOptions: TrackingOptions
): string {
	const meaningfulProps = Object.entries(trackingOptions)
		.filter(([key, value]) => {
			const actualDefault =
				ACTUAL_LIBRARY_DEFAULTS[key as keyof TrackingOptions];
			if (value === actualDefault) {
				return false;
			}
			if (typeof value === 'boolean' && !value && !actualDefault) {
				return false;
			}
			return true;
		})
		.map(([key, value]) => {
			if (typeof value === 'boolean') {
				return `  ${key}={${value}}`;
			}
			if (typeof value === 'string') {
				return `  ${key}="${value}"`;
			}
			return `  ${key}={${value}}`;
		});

	const propsString =
		meaningfulProps.length > 0 ? `\n${meaningfulProps.join('\n')}\n` : '';

	return `<Databuddy
  clientId="${websiteId}"${propsString}/>`;
}
