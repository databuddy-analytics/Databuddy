export interface FlagResult {
	enabled: boolean;
	value: boolean | string | number;
	payload: Record<string, unknown> | null;
	reason: string;
	flagId?: string;
	flagType?: "boolean" | "rollout" | "multivariant";
	variant?: string;
}

export interface FlagsConfig {
	/** Client ID for flag evaluation */
	clientId: string;
	apiUrl?: string;
	user?: {
		userId?: string;
		email?: string;
		properties?: Record<string, unknown>;
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
	environment?: string;
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
	get(key: string): FlagResult | null;
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
	updateUser: (user: FlagsConfig["user"]) => void;
	refresh: (forceClear?: boolean) => void;
	updateConfig: (config: FlagsConfig) => void;
	getMemoryFlags: () => Record<string, FlagResult>;
	getPendingFlags: () => Set<string>;
}
