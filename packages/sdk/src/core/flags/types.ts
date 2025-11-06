export type FlagVariantValue = boolean | string | number | object;

export interface FlagResult {
	enabled: boolean;
	/** Variant value - can be boolean, string, number, or object */
	value: FlagVariantValue;
	payload: any;
	reason: string;
	flagId?: string;
	flagType?: "boolean" | "multivariant" | "rollout";
	/** Selected variant name (for multivariant flags) */
	variantName?: string;
	/** Dependencies that affected this evaluation */
	dependencies?: string[];
}

export interface FlagsConfig {
	/** Client ID for flag evaluation */
	clientId: string;
	apiUrl?: string;
	user?: {
		userId?: string;
		email?: string;
		properties?: Record<string, any>;
	};
	/** Environment context (dev, staging, production, etc.) */
	environment?: string;
	disabled?: boolean;
	/** Enable debug logging */
	debug?: boolean;
	/** Skip persistent storage */
	skipStorage?: boolean;
	/** Whether session is loading */
	isPending?: boolean;
	/** Automatically fetch all flags on initialization (default: true) */
	autoFetch?: boolean;
}

export interface FlagState {
	enabled: boolean;
	isLoading: boolean;
	isReady: boolean;
}

export interface FlagsContext {
	isEnabled: (key: string) => FlagState;
	fetchAllFlags: () => Promise<void>;
	updateUser: (user: FlagsConfig["user"]) => void;
	refresh: (forceClear?: boolean) => Promise<void>;
}

export interface StorageInterface {
	get(key: string): any;
	set(key: string, value: unknown): void;
	getAll(): Record<string, unknown>;
	clear(): void;
	setAll(flags: Record<string, unknown>): void;
	cleanupExpired(): void;
}

export interface FlagsManagerOptions {
	config: FlagsConfig;
	storage?: StorageInterface;
	onFlagsUpdate?: (flags: Record<string, FlagResult>) => void;
	onConfigUpdate?: (config: FlagsConfig) => void;
}

export interface FlagsManager {
	getFlag: (key: string) => Promise<FlagResult>;
	isEnabled: (key: string) => FlagState;
	/** Get variant value for a flag */
	getVariant: <T = FlagVariantValue>(key: string) => Promise<T | null>;
	fetchAllFlags: () => Promise<void>;
	updateUser: (user: FlagsConfig["user"]) => void;
	refresh: (forceClear?: boolean) => void;
	updateConfig: (config: FlagsConfig) => void;
	getMemoryFlags: () => Record<string, FlagResult>;
	getPendingFlags: () => Set<string>;
}
