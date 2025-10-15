export interface FlagResult {
	enabled: boolean;
	value: boolean;
	payload: any;
	reason: string;
	flagId?: string;
	flagType?: 'boolean' | 'rollout';
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
	updateUser: (user: FlagsConfig['user']) => void;
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
	fetchAllFlags: () => Promise<void>;
	updateUser: (user: FlagsConfig['user']) => void;
	refresh: (forceClear?: boolean) => void;
	updateConfig: (config: FlagsConfig) => void;
	getMemoryFlags: () => Record<string, FlagResult>;
	getPendingFlags: () => Set<string>;
}
