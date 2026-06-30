import {
	addImportsDir,
	addPlugin,
	addTypeTemplate,
	createResolver,
	defineNuxtModule,
	logger,
} from "@nuxt/kit";
import type { FlagsConfig } from "@databuddy/sdk/vue";

export interface ModuleOptions {
	apiUrl?: string;
	clientId?: string;
	debug?: boolean;
	disabled?: boolean;
	enableBatching?: boolean;
	enableRetries?: boolean;
	flags?: FlagsConfig;
	ignoreBotDetection?: boolean;
	maskPatterns?: string[];
	samplingRate?: number;
	scriptUrl?: string;
	skipPatterns?: string[];
	trackAttributes?: boolean;
	trackErrors?: boolean;
	trackHashChanges?: boolean;
	trackInteractions?: boolean;
	trackOutgoingLinks?: boolean;
	trackPerformance?: boolean;
	trackWebVitals?: boolean;
	usePixel?: boolean;
}

declare module "nuxt/schema" {
	interface PublicRuntimeConfig {
		databuddy: ModuleOptions;
	}
}

export default defineNuxtModule<ModuleOptions>({
	meta: {
		name: "@databuddy/nuxt",
		configKey: "databuddy",
		compatibility: { nuxt: ">=3" },
	},
	defaults: {},
	setup(options, nuxt) {
		const resolver = createResolver(import.meta.url);

		const clientId =
			options.clientId ||
			process.env.NUXT_PUBLIC_DATABUDDY_CLIENT_ID ||
			process.env.VITE_DATABUDDY_CLIENT_ID;

		if (!(clientId || options.disabled)) {
			logger.warn(
				"[@databuddy/nuxt] No clientId found. Set `databuddy.clientId` in nuxt.config.ts or provide the `NUXT_PUBLIC_DATABUDDY_CLIENT_ID` environment variable."
			);
		}

		nuxt.options.runtimeConfig.public.databuddy = {
			...options,
			clientId,
			// Inherit the top-level clientId into flags config so users don't repeat it.
			// A flags-specific clientId takes priority if explicitly set.
			flags: options.flags
				? { ...options.flags, clientId: options.flags.clientId ?? clientId }
				: undefined,
		};

		// Preconnect to the CDN so the tracker script loads as fast as possible.
		// This runs server-side and appears in the initial HTML — zero plugin overhead.
		if (!options.disabled) {
			let cdnOrigin = "https://cdn.databuddy.cc";
			if (options.scriptUrl) {
				try {
					cdnOrigin = new URL(options.scriptUrl).origin;
				} catch {
					logger.warn(
						`[@databuddy/nuxt] Invalid scriptUrl "${options.scriptUrl}" — falling back to default CDN.`
					);
				}
			}

			nuxt.options.app.head.link = [
				...(nuxt.options.app.head.link ?? []),
				{ rel: "dns-prefetch", href: cdnOrigin },
				{ rel: "preconnect", href: cdnOrigin },
			];
		}

		// Single client-only plugin — script injection, SPA tracking, flags
		addPlugin({
			src: resolver.resolve("./runtime/plugin.client"),
			mode: "client",
		});

		// Auto-import all composables from the composables directory
		addImportsDir(resolver.resolve("./runtime/composables"));

		// TypeScript augmentation: $databuddy on NuxtApp and Vue component instances
		addTypeTemplate({
			filename: "types/databuddy.d.ts",
			getContents: () => `
import type {
  clear,
  flush,
  getAnonymousId,
  getSessionId,
  getTracker,
  getTrackingIds,
  getTrackingParams,
  isTrackerAvailable,
  track,
  trackError,
} from '@databuddy/sdk'

interface DatabuddyInstance {
  track: typeof track
  trackError: typeof trackError
  clear: typeof clear
  flush: typeof flush
  getTracker: typeof getTracker
  isTrackerAvailable: typeof isTrackerAvailable
  getAnonymousId: typeof getAnonymousId
  getSessionId: typeof getSessionId
  getTrackingIds: typeof getTrackingIds
  getTrackingParams: typeof getTrackingParams
  setGlobalProperties: (properties: Record<string, unknown>) => void
  screenView: (properties?: Record<string, unknown>) => void
}

declare module '#app' {
  interface NuxtApp {
    $databuddy: DatabuddyInstance
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $databuddy: DatabuddyInstance
  }
}

export {}
`,
		});
	},
});
