import type { FlagResult, StorageInterface } from "./types";

const isBrowser =
	typeof window !== "undefined" && typeof localStorage !== "undefined";

const STORAGE_KEY = "db-flags";
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

interface StoredBlob {
	flags: Record<string, FlagResult>;
	savedAt: number;
}

export class BrowserFlagStorage implements StorageInterface {
	private readonly ttl: number;

	constructor(ttl = DEFAULT_TTL) {
		this.ttl = ttl;
	}

	getAll(): Record<string, FlagResult> {
		if (!isBrowser) {
			return {};
		}
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				return {};
			}
			const blob = JSON.parse(raw) as StoredBlob;
			if (Date.now() - blob.savedAt > this.ttl) {
				localStorage.removeItem(STORAGE_KEY);
				return {};
			}
			return blob.flags && typeof blob.flags === "object" ? blob.flags : {};
		} catch {
			return {};
		}
	}

	setAll(flags: Record<string, FlagResult>): void {
		if (!isBrowser) {
			return;
		}
		try {
			const blob: StoredBlob = { flags, savedAt: Date.now() };
			localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
		} catch {
			// localStorage full or blocked
		}
	}

	clear(): void {
		if (!isBrowser) {
			return;
		}
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// localStorage blocked
		}
	}
}
