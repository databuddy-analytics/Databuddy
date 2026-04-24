import { BrowserFlagStorage } from "@/core/flags/browser-storage";
import { BrowserFlagsManager } from "@/core/flags/flags-manager";
import type {
	FlagResult,
	FlagState,
	FlagStatus,
	FlagsConfig,
	FlagsContext,
	UserContext,
} from "@/core/flags/types";
import { logger } from "@/logger";
import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
	type ReactNode,
} from "react";

const FlagsReactContext = createContext<FlagsContext | null>(null);

export interface FlagsProviderProps extends FlagsConfig {
	children: ReactNode;
}

function toFlagState(
	result: FlagResult | undefined,
	isLoading: boolean,
	isPending: boolean
): FlagState {
	if (isPending) {
		return { on: false, status: "pending", loading: true };
	}
	if (isLoading || !result) {
		return { on: false, status: "loading", loading: true };
	}
	const status: FlagStatus = result.reason === "ERROR" ? "error" : "ready";
	return {
		on: result.enabled,
		status,
		loading: false,
		value: result.value,
		variant: result.variant,
	};
}

export function FlagsProvider({ children, ...config }: FlagsProviderProps) {
	const manager = useMemo(() => {
		const storage = config.skipStorage ? undefined : new BrowserFlagStorage();
		return new BrowserFlagsManager({ config, storage });
	}, [config.clientId]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		const w = window as unknown as {
			__databuddyFlags?: BrowserFlagsManager;
		};
		w.__databuddyFlags = manager;
		return () => {
			if (w.__databuddyFlags === manager) {
				w.__databuddyFlags = undefined;
			}
		};
	}, [manager]);

	const prevConfigRef = useRef(config);
	useEffect(() => {
		const prev = prevConfigRef.current;
		const changed =
			prev.apiUrl !== config.apiUrl ||
			prev.autoFetch !== config.autoFetch ||
			prev.cacheTtl !== config.cacheTtl ||
			prev.debug !== config.debug ||
			prev.defaults !== config.defaults ||
			prev.disabled !== config.disabled ||
			prev.environment !== config.environment ||
			prev.isPending !== config.isPending ||
			prev.skipStorage !== config.skipStorage ||
			prev.staleTime !== config.staleTime ||
			prev.user?.userId !== config.user?.userId ||
			prev.user?.email !== config.user?.email ||
			prev.user?.organizationId !== config.user?.organizationId ||
			prev.user?.teamId !== config.user?.teamId ||
			prev.user?.properties !== config.user?.properties;

		if (changed) {
			prevConfigRef.current = config;
			manager.updateConfig(config);
		}
	}, [manager, config]);

	useEffect(() => () => manager.destroy(), [manager]);

	const store = useSyncExternalStore(
		manager.subscribe,
		manager.getSnapshot,
		manager.getSnapshot
	);

	const contextValue = useMemo<FlagsContext>(
		() => ({
			getFlag: (key: string): FlagState => {
				const result = store.flags[key];
				const managerState = manager.isEnabled(key);
				return toFlagState(
					result,
					managerState.loading,
					config.isPending ?? false
				);
			},

			isOn: (key: string): boolean => {
				const result = store.flags[key];
				if (result) {
					return result.enabled;
				}
				return manager.isEnabled(key).on;
			},

			getValue: <T extends boolean | string | number>(
				key: string,
				defaultValue?: T
			): T => {
				const result = store.flags[key];
				if (result) {
					return result.value as T;
				}
				return manager.getValue(key, defaultValue);
			},

			fetchFlag: (key: string) => manager.getFlag(key),
			fetchAllFlags: () => manager.fetchAllFlags(),
			updateUser: (user: UserContext) => manager.updateUser(user),
			refresh: (forceClear = false) => manager.refresh(forceClear),
			isReady: store.isReady,
		}),
		[manager, store, config.isPending]
	);

	return (
		<FlagsReactContext.Provider value={contextValue}>
			{children}
		</FlagsReactContext.Provider>
	);
}

export function useFlags(): FlagsContext {
	const context = useContext(FlagsReactContext);
	if (!context) {
		logger.warn("useFlags called outside FlagsProvider");
		return {
			getFlag: () => toFlagState(undefined, false, false),
			isOn: () => false,
			getValue: <T extends boolean | string | number = boolean>(
				_key: string,
				defaultValue?: T
			) => (defaultValue ?? false) as T,
			fetchFlag: async () => ({
				enabled: false,
				value: false,
				payload: null,
				reason: "NO_PROVIDER",
			}),
			fetchAllFlags: async () => {},
			updateUser: () => {},
			refresh: async () => {},
			isReady: false,
		};
	}
	return context;
}

/**
 * @example
 * const flag = useFlag("my-feature");
 * if (flag.loading) return <Skeleton />;
 * return flag.on ? <NewFeature /> : <OldFeature />;
 */
export function useFlag(key: string): FlagState {
	const { getFlag } = useFlags();
	return getFlag(key);
}
