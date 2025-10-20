import type { StorageInterface } from './types';

export class BrowserFlagStorage implements StorageInterface {
	private ttl = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

	get(key: string) {
		return this.getFromLocalStorage(key);
	}

	set(key: string, value: unknown) {
		this.setToLocalStorage(key, value);
	}

	getAll(): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		const now = Date.now();

		const keys = Object.keys(localStorage).filter((key) =>
			key.startsWith('db-flag-')
		);

		for (const key of keys) {
			const flagKey = key.replace('db-flag-', '');
			try {
				const item = localStorage.getItem(key);
				if (item) {
					const parsed = JSON.parse(item);
					if (parsed.expiresAt && now > parsed.expiresAt) {
						localStorage.removeItem(key);
					} else {
						result[flagKey] = parsed.value || parsed; // Support both new and old format
					}
				}
			} catch {}
		}
		return result;
	}

	clear(): void {
		const keys = Object.keys(localStorage).filter((key) =>
			key.startsWith('db-flag-')
		);
		for (const key of keys) {
			localStorage.removeItem(key);
		}
	}

	private getFromLocalStorage(key: string): any {
		try {
			const item = localStorage.getItem(`db-flag-${key}`);
			if (!item) {
				return null;
			}

			const parsed = JSON.parse(item);

			if (parsed.expiresAt) {
				if (this.isExpired(parsed.expiresAt)) {
					localStorage.removeItem(`db-flag-${key}`);
					return null;
				}
				return parsed.value;
			}

			return parsed;
		} catch {
			return null;
		}
	}

	private setToLocalStorage(key: string, value: unknown): void {
		try {
			const item = {
				value,
				timestamp: Date.now(),
				expiresAt: Date.now() + this.ttl,
			};
			localStorage.setItem(`db-flag-${key}`, JSON.stringify(item));
		} catch {}
	}

	private isExpired(expiresAt?: number): boolean {
		if (!expiresAt) {
			return false;
		}
		return Date.now() > expiresAt;
	}

	delete(key: string): void {
		localStorage.removeItem(`db-flag-${key}`);
	}

	deleteMultiple(keys: string[]): void {
		for (const key of keys) {
			localStorage.removeItem(`db-flag-${key}`);
		}
	}

	setAll(flags: Record<string, unknown>): void {
		const currentFlags = this.getAll();
		const currentKeys = Object.keys(currentFlags);
		const newKeys = Object.keys(flags);

		const removedKeys = currentKeys.filter((key) => !newKeys.includes(key));

		if (removedKeys.length > 0) {
			this.deleteMultiple(removedKeys);
		}

		for (const [key, value] of Object.entries(flags)) {
			this.set(key, value);
		}
	}

	cleanupExpired(): void {
		const now = Date.now();
		const keys = Object.keys(localStorage).filter((key) =>
			key.startsWith('db-flag-')
		);

		for (const key of keys) {
			try {
				const item = localStorage.getItem(key);
				if (item) {
					const parsed = JSON.parse(item);
					if (parsed.expiresAt && now > parsed.expiresAt) {
						localStorage.removeItem(key);
					}
				}
			} catch {
				localStorage.removeItem(key);
			}
		}
	}
}
