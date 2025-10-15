import { atom, createStore, Provider, useAtom } from 'jotai';
import type { ReactNode } from 'react';
import { createElement, useEffect, useRef } from 'react';
import type { FlagResult, FlagState, FlagsConfig } from '../../core/flags';
import { BrowserFlagStorage, CoreFlagsManager } from '../../core/flags';
import { logger } from '../../logger';

const flagsStore = createStore();

const managerAtom = atom<CoreFlagsManager | null>(null);
const memoryFlagsAtom = atom<Record<string, FlagResult>>({});

export interface FlagsProviderProps extends FlagsConfig {
	children: ReactNode;
}

export function FlagsProvider({ children, ...config }: FlagsProviderProps) {
	const managerRef = useRef<CoreFlagsManager | null>(null);

	useEffect(() => {
		// Create storage instance only if not skipping storage
		const storage = config.skipStorage ? undefined : new BrowserFlagStorage();

		// Create new manager instance
		const manager = new CoreFlagsManager({
			config,
			storage,
			onFlagsUpdate: (flags) => {
				flagsStore.set(memoryFlagsAtom, flags);
			},
		});

		managerRef.current = manager;
		flagsStore.set(managerAtom, manager);

		// Cleanup function
		return () => {
			managerRef.current = null;
			flagsStore.set(managerAtom, null);
		};
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

	// Update manager config when props change
	useEffect(() => {
		if (managerRef.current) {
			managerRef.current.updateConfig(config);
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

	return createElement(Provider, { store: flagsStore }, children);
}

export function useFlags() {
	const [manager] = useAtom(managerAtom, { store: flagsStore });
	const [memoryFlags] = useAtom(memoryFlagsAtom, {
		store: flagsStore,
	});

	logger.debug('useFlags called with manager:', {
		hasManager: !!manager,
		memoryFlagsCount: Object.keys(memoryFlags).length,
		memoryFlags: Object.keys(memoryFlags),
	});

	const isEnabled = (key: string): FlagState => {
		if (!manager) {
			return {
				enabled: false,
				isLoading: false,
				isReady: false,
			};
		}
		return manager.isEnabled(key);
	};

	const fetchAllFlags = () => {
		if (!manager) {
			logger.warn('No manager for bulk fetch');
			return;
		}
		return manager.fetchAllFlags();
	};

	const updateUser = (user: FlagsConfig['user']) => {
		if (!manager) {
			logger.warn('No manager for user update');
			return;
		}
		manager.updateUser(user);
	};

	const refresh = (forceClear = false): void => {
		if (!manager) {
			logger.warn('No manager for refresh');
			return;
		}
		manager.refresh(forceClear);
	};

	return {
		isEnabled,
		fetchAllFlags,
		updateUser,
		refresh,
	};
}
