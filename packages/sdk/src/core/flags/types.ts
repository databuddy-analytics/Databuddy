export interface FlagResult {
	enabled: boolean;
	payload: Record<string, unknown> | null;
	reason: string;
	value: boolean | string | number;
	variant?: string;
}

export interface UserContext {
	email?: string;
	organizationId?: string;
	properties?: Record<string, unknown>;
	teamId?: string;
	userId?: string;
}

export interface FlagsConfig {
	apiUrl?: string;
	/** Auto-fetch all flags on init (default: true) */
	autoFetch?: boolean;
	/** Cache TTL in ms (default: 60000) */
	cacheTtl?: number;
	clientId: string;
	debug?: boolean;
	/** Default values by flag key */
	defaults?: Record<string, boolean | string | number>;
	disabled?: boolean;
	environment?: string;
	/** Defer evaluation until session resolves */
	isPending?: boolean;
	/** Skip persistent storage (browser only) */
	skipStorage?: boolean;
	/** Stale time in ms — revalidate in background after this (default: cacheTtl/2) */
	staleTime?: number;
	user?: UserContext;
}

export type FlagStatus = "loading" | "ready" | "error" | "pending";

export interface FlagState {
	loading: boolean;
	on: boolean;
	status: FlagStatus;
	value?: boolean | string | number;
	variant?: string;
}

export interface FlagsContext {
	fetchAllFlags: () => Promise<void>;
	fetchFlag: (key: string) => Promise<FlagResult>;
	getFlag: (key: string) => FlagState;
	getValue: <T extends boolean | string | number = boolean>(
		key: string,
		defaultValue?: T
	) => T;
	isOn: (key: string) => boolean;
	isReady: boolean;
	refresh: (forceClear?: boolean) => Promise<void>;
	updateUser: (user: UserContext) => void;
}

export interface FlagsSnapshot {
	flags: Record<string, FlagResult>;
	isReady: boolean;
}

export interface StorageInterface {
	clear(): void;
	getAll(): Record<string, FlagResult>;
	setAll(flags: Record<string, FlagResult>): void;
}

export interface FlagsManagerOptions {
	config: FlagsConfig;
	storage?: StorageInterface;
}

export interface FlagsManager {
	destroy(): void;
	fetchAllFlags(user?: UserContext): Promise<void>;
	getFlag(key: string, user?: UserContext): Promise<FlagResult>;
	getMemoryFlags(): Record<string, FlagResult>;
	getSnapshot(): FlagsSnapshot;
	getValue<T = boolean | string | number>(key: string, defaultValue?: T): T;
	isEnabled(key: string): FlagState;
	isReady(): boolean;
	refresh(forceClear?: boolean): Promise<void>;
	subscribe(callback: () => void): () => void;
	updateConfig(config: FlagsConfig): void;
	updateUser(user: UserContext): void;
}
