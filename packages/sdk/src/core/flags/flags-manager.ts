import { logger } from '../../logger';
import type {
	FlagResult,
	FlagState,
	FlagsConfig,
	FlagsManager,
	FlagsManagerOptions,
	StorageInterface,
} from './types';

export class CoreFlagsManager implements FlagsManager {
	private config: FlagsConfig;
	private storage?: StorageInterface;
	private onFlagsUpdate?: (flags: Record<string, FlagResult>) => void;
	private onConfigUpdate?: (config: FlagsConfig) => void;
	private memoryFlags: Record<string, FlagResult> = {};
	private pendingFlags: Set<string> = new Set();

	constructor(options: FlagsManagerOptions) {
		this.config = this.withDefaults(options.config);
		this.storage = options.storage;
		this.onFlagsUpdate = options.onFlagsUpdate;
		this.onConfigUpdate = options.onConfigUpdate;

		logger.setDebug(this.config.debug ?? false);
		logger.debug('CoreFlagsManager initialized with config:', {
			clientId: this.config.clientId,
			debug: this.config.debug,
			isPending: this.config.isPending,
			hasUser: !!this.config.user,
		});

		this.initialize();
	}

	private withDefaults(config: FlagsConfig): FlagsConfig {
		return {
			clientId: config.clientId,
			apiUrl: config.apiUrl ?? 'https://api.databuddy.cc',
			user: config.user,
			disabled: config.disabled ?? false,
			debug: config.debug ?? false,
			skipStorage: config.skipStorage ?? false,
			isPending: config.isPending,
			autoFetch: config.autoFetch !== false,
		};
	}

	private async initialize(): Promise<void> {
		if (!this.config.skipStorage && this.storage) {
			this.loadCachedFlags();
			this.storage.cleanupExpired();
		}

		if (this.config.autoFetch && !this.config.isPending) {
			await this.fetchAllFlags();
		}
	}

	private loadCachedFlags(): void {
		if (!this.storage || this.config.skipStorage) {
			return;
		}

		try {
			const cachedFlags = this.storage.getAll();
			if (Object.keys(cachedFlags).length > 0) {
				this.memoryFlags = cachedFlags as Record<string, FlagResult>;
				this.notifyFlagsUpdate();
				logger.debug('Loaded cached flags:', Object.keys(cachedFlags));
			}
		} catch (err) {
			logger.warn('Error loading cached flags:', err);
		}
	}

	async fetchAllFlags(): Promise<void> {
		if (this.config.isPending) {
			logger.debug('Session pending, skipping bulk fetch');
			return;
		}

		const params = new URLSearchParams();
		params.set('clientId', this.config.clientId);
		if (this.config.user?.userId) {
			params.set('userId', this.config.user.userId);
		}
		if (this.config.user?.email) {
			params.set('email', this.config.user.email);
		}
		if (this.config.user?.properties) {
			params.set('properties', JSON.stringify(this.config.user.properties));
		}

		const url = `${this.config.apiUrl}/public/v1/flags/bulk?${params.toString()}`;

		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const result = await response.json();

			logger.debug('Bulk fetch response:', result);

			if (result.flags) {
				this.memoryFlags = result.flags;
				this.notifyFlagsUpdate();

				if (!this.config.skipStorage && this.storage) {
					try {
						this.storage.setAll(result.flags);
						logger.debug('Bulk flags synced to cache');
					} catch (err) {
						logger.warn('Bulk storage error:', err);
					}
				}
			}
		} catch (err) {
			logger.error('Bulk fetch error:', err);
		}
	}

	async getFlag(key: string): Promise<FlagResult> {
		logger.debug(`Getting: ${key}`);

		if (this.config.isPending) {
			logger.debug(`Session pending for: ${key}`);
			return {
				enabled: false,
				value: false,
				payload: null,
				reason: 'SESSION_PENDING',
			};
		}

		if (this.memoryFlags[key]) {
			logger.debug(`Memory: ${key}`);
			return this.memoryFlags[key];
		}

		if (this.pendingFlags.has(key)) {
			logger.debug(`Pending: ${key}`);
			return {
				enabled: false,
				value: false,
				payload: null,
				reason: 'FETCHING',
			};
		}

		if (!this.config.skipStorage && this.storage) {
			try {
				const cached = await this.storage.get(key);
				if (cached) {
					logger.debug(`Cache: ${key}`);
					this.memoryFlags[key] = cached;
					this.notifyFlagsUpdate();
					return cached;
				}
			} catch (err) {
				logger.warn(`Storage error: ${key}`, err);
			}
		}

		return this.fetchFlag(key);
	}

	private async fetchFlag(key: string): Promise<FlagResult> {
		this.pendingFlags.add(key);

		const params = new URLSearchParams();
		params.set('key', key);
		params.set('clientId', this.config.clientId);
		if (this.config.user?.userId) {
			params.set('userId', this.config.user.userId);
		}
		if (this.config.user?.email) {
			params.set('email', this.config.user.email);
		}
		if (this.config.user?.properties) {
			params.set('properties', JSON.stringify(this.config.user.properties));
		}

		const url = `${this.config.apiUrl}/public/v1/flags/evaluate?${params.toString()}`;

		logger.debug(`Fetching: ${key}`);

		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const result: FlagResult = await response.json();

			logger.debug(`Response for ${key}:`, result);

			this.memoryFlags[key] = result;
			this.notifyFlagsUpdate();

			if (!this.config.skipStorage && this.storage) {
				try {
					this.storage.set(key, result);
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
			this.memoryFlags[key] = fallback;
			this.notifyFlagsUpdate();
			return fallback;
		} finally {
			this.pendingFlags.delete(key);
		}
	}

	isEnabled(key: string): FlagState {
		if (this.memoryFlags[key]) {
			return {
				enabled: this.memoryFlags[key].enabled,
				isLoading: false,
				isReady: true,
			};
		}
		if (this.pendingFlags.has(key)) {
			return {
				enabled: false,
				isLoading: true,
				isReady: false,
			};
		}
		// Trigger fetch but don't await
		this.getFlag(key);
		return {
			enabled: false,
			isLoading: true,
			isReady: false,
		};
	}

	refresh(forceClear = false): void {
		logger.debug('Refreshing', { forceClear });

		if (forceClear) {
			this.memoryFlags = {};
			this.notifyFlagsUpdate();
			if (!this.config.skipStorage && this.storage) {
				try {
					this.storage.clear();
					logger.debug('Storage cleared');
				} catch (err) {
					logger.warn('Storage clear error:', err);
				}
			}
		}

		this.fetchAllFlags();
	}

	updateUser(user: FlagsConfig['user']): void {
		this.config = { ...this.config, user };
		this.onConfigUpdate?.(this.config);
		this.refresh();
	}

	updateConfig(config: FlagsConfig): void {
		this.config = this.withDefaults(config);
		this.onConfigUpdate?.(this.config);

		if (!this.config.skipStorage && this.storage) {
			this.loadCachedFlags();
			this.storage.cleanupExpired();
		}

		if (this.config.autoFetch && !this.config.isPending) {
			this.fetchAllFlags();
		}
	}

	getMemoryFlags(): Record<string, FlagResult> {
		return { ...this.memoryFlags };
	}

	getPendingFlags(): Set<string> {
		return new Set(this.pendingFlags);
	}

	private notifyFlagsUpdate(): void {
		this.onFlagsUpdate?.(this.getMemoryFlags());
	}
}
