import { atom, createStore, Provider, useAtom } from 'jotai';
import type { ReactNode } from 'react';
import { createElement, useEffect } from 'react';
import { logger } from '../../logger';
import { flagStorage } from './flag-storage';
import type { FlagResult, FlagState, FlagsConfig } from './types';

const flagsStore = createStore();

const configAtom = atom<FlagsConfig | null>(null);
const memoryFlagsAtom = atom<Record<string, FlagResult>>({});
const pendingFlagsAtom = atom<Set<string>>(new Set<string>());

export interface FlagsProviderProps extends FlagsConfig {
	children: ReactNode;
}

export function FlagsProvider({ children, ...config }: FlagsProviderProps) {
	const debug = config.debug ?? false;
	logger.setDebug(debug);
	logger.debug('Provider rendering with config:', {
		clientId: config.clientId,
		debug,
		isPending: config.isPending,
		hasUser: !!config.user,
	});

	useEffect(() => {
		const configWithDefaults = {
			clientId: config.clientId,
			apiUrl: config.apiUrl ?? 'https://api.databuddy.cc',
			user: config.user,
			disabled: config.disabled ?? false,
			debug,
			skipStorage: config.skipStorage ?? false,
			isPending: config.isPending,
			autoFetch: config.autoFetch !== false,
		};

		flagsStore.set(configAtom, configWithDefaults);

		logger.debug('Config set on store', {
			clientId: config.clientId,
			apiUrl: configWithDefaults.apiUrl,
			user: config.user,
			isPending: config.isPending,
			skipStorage: config.skipStorage ?? false,
		});

		if (!(config.skipStorage ?? false)) {
			loadCachedFlagsImmediate(configWithDefaults);
			flagStorage.cleanupExpired();
		}
	}, [
		config.clientId,
		config.apiUrl,
		config.user?.userId,
		config.user?.email,
		config.disabled,
		config.debug,
		config.skipStorage,
		config.isPending,
		config.autoFetch,
	]);

	const loadCachedFlagsImmediate = (config: FlagsConfig) => {
		if (config.skipStorage) {
			return;
		}

		try {
			const cachedFlags = flagStorage.getAll();
			if (Object.keys(cachedFlags).length > 0) {
				flagsStore.set(
					memoryFlagsAtom,
					cachedFlags as Record<string, FlagResult>
				);
				logger.debug('Loaded cached flags:', Object.keys(cachedFlags));
			}
		} catch (err) {
			logger.warn('Error loading cached flags:', err);
		}
	};

	return createElement(Provider, { store: flagsStore }, children);
}

export function useFlags() {
	const [config] = useAtom(configAtom, { store: flagsStore });
	const [memoryFlags, setMemoryFlags] = useAtom(memoryFlagsAtom, {
		store: flagsStore,
	});
	const [pendingFlags, setPendingFlags] = useAtom(pendingFlagsAtom, {
		store: flagsStore,
	});

	logger.debug('useFlags called with config:', {
		hasConfig: !!config,
		clientId: config?.clientId,
		isPending: config?.isPending,
		debug: config?.debug,
		skipStorage: config?.skipStorage,
		memoryFlagsCount: Object.keys(memoryFlags).length,
		memoryFlags: Object.keys(memoryFlags),
	});

	const fetchAllFlags = async (): Promise<void> => {
		if (!config) {
			logger.warn('No config for bulk fetch');
			return;
		}

		if (config.isPending) {
			logger.debug('Session pending, skipping bulk fetch');
			return;
		}

		const params = new URLSearchParams();
		params.set('clientId', config.clientId);
		if (config.user?.userId) {
			params.set('userId', config.user.userId);
		}
		if (config.user?.email) {
			params.set('email', config.user.email);
		}
		if (config.user?.properties) {
			params.set('properties', JSON.stringify(config.user.properties));
		}

		const url = `${config.apiUrl}/public/v1/flags/bulk?${params.toString()}`;

		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const result = await response.json();

			logger.debug('Bulk fetch response:', result);

			if (result.flags) {
				setMemoryFlags(result.flags);

				if (!config.skipStorage) {
					try {
						flagStorage.setAll(result.flags);
						logger.debug('Bulk flags synced to cache');
					} catch (err) {
						logger.warn('Bulk storage error:', err);
					}
				}
			}
		} catch (err) {
			logger.error('Bulk fetch error:', err);
		}
	};

	const fetchFlag = async (key: string): Promise<FlagResult> => {
		if (!config) {
			logger.warn(`No config for flag: ${key}`);
			return {
				enabled: false,
				value: false,
				payload: null,
				reason: 'NO_CONFIG',
			};
		}

		setPendingFlags((prev: Set<string>) => new Set([...prev, key]));

		const params = new URLSearchParams();
		params.set('key', key);
		params.set('clientId', config.clientId);
		if (config.user?.userId) {
			params.set('userId', config.user.userId);
		}
		if (config.user?.email) {
			params.set('email', config.user.email);
		}
		if (config.user?.properties) {
			params.set('properties', JSON.stringify(config.user.properties));
		}

		const url = `${config.apiUrl}/public/v1/flags/evaluate?${params.toString()}`;

		logger.debug(`Fetching: ${key}`);

		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const result: FlagResult = await response.json();

			logger.debug(`Response for ${key}:`, result);

			setMemoryFlags((prev) => ({ ...prev, [key]: result }));

			if (!config.skipStorage) {
				try {
					flagStorage.set(key, result);
					logger.debug(`Cached: ${key}`);
				} catch (err) {
					logger.warn(`Cache error: ${key}`, err);
				}
			}

			return result;
		} catch (err) {
			logger.error(`Fetch error: ${key}`, err);

			const fallback = {
				enabled: false,
				value: false,
				payload: null,
				reason: 'ERROR',
			};
			setMemoryFlags((prev) => ({ ...prev, [key]: fallback }));
			return fallback;
		} finally {
			setPendingFlags((prev: Set<string>) => {
				const newSet = new Set(prev);
				newSet.delete(key);
				return newSet;
			});
		}
	};

	const getFlag = async (key: string): Promise<FlagResult> => {
		logger.debug(`Getting: ${key}`);

		if (config?.isPending) {
			logger.debug(`Session pending for: ${key}`);
			return {
				enabled: false,
				value: false,
				payload: null,
				reason: 'SESSION_PENDING',
			};
		}

		if (memoryFlags[key]) {
			logger.debug(`Memory: ${key}`);
			return memoryFlags[key];
		}

		if (pendingFlags.has(key)) {
			logger.debug(`Pending: ${key}`);
			return {
				enabled: false,
				value: false,
				payload: null,
				reason: 'FETCHING',
			};
		}

		if (!config?.skipStorage) {
			try {
				const cached = await flagStorage.get(key);
				if (cached) {
					logger.debug(`Cache: ${key}`);
					setMemoryFlags((prev) => ({ ...prev, [key]: cached }));
					return cached;
				}
			} catch (err) {
				logger.warn(`Storage error: ${key}`, err);
			}
		}

		return fetchFlag(key);
	};

	const isEnabled = (key: string): FlagState => {
		if (memoryFlags[key]) {
			return {
				enabled: memoryFlags[key].enabled,
				isLoading: false,
				isReady: true,
			};
		}
		if (pendingFlags.has(key)) {
			return {
				enabled: false,
				isLoading: true,
				isReady: false,
			};
		}
		getFlag(key);
		return {
			enabled: false,
			isLoading: true,
			isReady: false,
		};
	};

	const refresh = (forceClear = false): void => {
		logger.debug('Refreshing', { forceClear });

		if (forceClear) {
			setMemoryFlags({});
			if (!config?.skipStorage) {
				try {
					flagStorage.clear();
					logger.debug('Storage cleared');
				} catch (err) {
					logger.warn('Storage clear error:', err);
				}
			}
		}

		fetchAllFlags();
	};

	const updateUser = (user: FlagsConfig['user']) => {
		if (config) {
			flagsStore.set(configAtom, { ...config, user });
			refresh();
		}
	};

	useEffect(() => {
		if (config && !config.isPending && config.autoFetch !== false) {
			logger.debug('Auto-fetching');
			fetchAllFlags();
		}
	}, [
		config?.clientId,
		config?.user?.userId,
		config?.user?.email,
		config?.isPending,
		config?.autoFetch,
	]);

	return {
		isEnabled,
		fetchAllFlags,
		updateUser,
		refresh,
	};
}
