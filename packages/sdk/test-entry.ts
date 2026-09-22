/**
 * Browser entry point for Playwright E2E tests.
 * Bundles the SDK and exposes internals on `window.__SDK__` for test access.
 */

import { BrowserFlagStorage } from "./src/core/flags/browser-storage";
import { BrowserFlagsManager } from "./src/core/flags/flags-manager";
import {
	DEFAULT_RESULT,
	fetchAllFlags,
	fetchFlags,
	getCacheKey,
	RequestBatcher,
} from "./src/core/flags/shared";
import type { FlagResult } from "./src/core/flags/types";
import { createScript, isScriptInjected } from "./src/core/script";
import {
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
} from "./src/core/tracker";
import { detectClientId } from "./src/utils";

function createCacheEntry(result: FlagResult, ttl: number, staleTime?: number) {
	const now = Date.now();
	return {
		result,
		staleAt: now + (staleTime ?? ttl / 2),
		expiresAt: now + ttl,
	};
}

function isCacheValid(entry: { expiresAt: number } | undefined): boolean {
	if (!entry) {
		return false;
	}
	return Date.now() <= entry.expiresAt;
}

function isCacheStale(entry: { staleAt: number }): boolean {
	return Date.now() > entry.staleAt;
}

declare global {
	interface Window {
		__SDK__: typeof sdkExports;
	}
}

const sdkExports = {
	BrowserFlagsManager,
	BrowserFlagStorage,
	getCacheKey,
	DEFAULT_RESULT,
	RequestBatcher,
	createCacheEntry,
	isCacheValid,
	isCacheStale,
	fetchFlags,
	fetchAllFlags,
	track,
	clear,
	flush,
	getAnonymousId,
	getSessionId,
	getTrackingIds,
	getTrackingParams,
	isTrackerAvailable,
	getTracker,
	trackError,
	createScript,
	isScriptInjected,
	detectClientId,
};

window.__SDK__ = sdkExports;
