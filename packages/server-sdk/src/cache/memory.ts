import type { DeduplicationCache } from "./interface";

/**
 * Node in the doubly-linked list for LRU ordering
 */
interface LRUNode {
	key: string;
	prev: LRUNode | null;
	next: LRUNode | null;
	expiresAt: number;
}

/**
 * True LRU (Least Recently Used) cache implementation
 * Uses a doubly-linked list + Map for O(1) operations
 *
 * This fixes the bug in the old SDK which used Set (FIFO, not LRU)
 */
export class MemoryLRUCache implements DeduplicationCache {
	private readonly maxSize: number;
	private readonly ttlMs: number;
	private readonly cache: Map<string, LRUNode> = new Map();
	private head: LRUNode | null = null;
	private tail: LRUNode | null = null;
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor(maxSize: number = 10000, ttlSeconds: number = 3600) {
		this.maxSize = maxSize;
		this.ttlMs = ttlSeconds * 1000;

		// Cleanup expired entries every minute
		this.cleanupInterval = setInterval(() => {
			this.cleanupExpired();
		}, 60000);
	}

	/**
	 * Check if event ID is duplicate and add if not
	 * Moves existing entries to front (true LRU behavior)
	 */
	async isDuplicate(eventId: string): Promise<boolean> {
		const node = this.cache.get(eventId);

		if (node) {
			// Check if expired
			if (Date.now() > node.expiresAt) {
				this.removeNode(node);
				// Not a duplicate, add as new
				await this.add(eventId);
				return false;
			}
			// Move to front on access (true LRU)
			this.moveToFront(node);
			return true;
		}

		// Not found, add new entry
		await this.add(eventId);
		return false;
	}

	/**
	 * Add an event ID to the cache
	 */
	async add(eventId: string): Promise<void> {
		// If already exists, update expiry and move to front
		if (this.cache.has(eventId)) {
			const node = this.cache.get(eventId)!;
			node.expiresAt = Date.now() + this.ttlMs;
			this.moveToFront(node);
			return;
		}

		// Evict if at capacity
		if (this.cache.size >= this.maxSize) {
			this.evictLRU();
		}

		// Create new node at front
		const node: LRUNode = {
			key: eventId,
			prev: null,
			next: this.head,
			expiresAt: Date.now() + this.ttlMs,
		};

		if (this.head) {
			this.head.prev = node;
		}
		this.head = node;

		if (!this.tail) {
			this.tail = node;
		}

		this.cache.set(eventId, node);
	}

	/**
	 * Remove an event ID from the cache
	 */
	async remove(eventId: string): Promise<void> {
		const node = this.cache.get(eventId);
		if (node) {
			this.removeNode(node);
		}
	}

	/**
	 * Clear all entries
	 */
	async clear(): Promise<void> {
		this.cache.clear();
		this.head = null;
		this.tail = null;
	}

	/**
	 * Get current cache size
	 */
	async size(): Promise<number> {
		return this.cache.size;
	}

	/**
	 * Cleanup and close the cache
	 */
	async close(): Promise<void> {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		await this.clear();
	}

	/**
	 * Move a node to the front of the list
	 */
	private moveToFront(node: LRUNode): void {
		if (node === this.head) {
			return; // Already at front
		}

		// Remove from current position
		if (node.prev) {
			node.prev.next = node.next;
		}
		if (node.next) {
			node.next.prev = node.prev;
		}
		if (node === this.tail) {
			this.tail = node.prev;
		}

		// Move to front
		node.prev = null;
		node.next = this.head;
		if (this.head) {
			this.head.prev = node;
		}
		this.head = node;
	}

	/**
	 * Evict the least recently used entry (tail)
	 */
	private evictLRU(): void {
		if (this.tail) {
			this.removeNode(this.tail);
		}
	}

	/**
	 * Remove a node from the list and cache
	 */
	private removeNode(node: LRUNode): void {
		// Update linked list
		if (node.prev) {
			node.prev.next = node.next;
		}
		if (node.next) {
			node.next.prev = node.prev;
		}

		// Update head/tail references
		if (node === this.head) {
			this.head = node.next;
		}
		if (node === this.tail) {
			this.tail = node.prev;
		}

		// Remove from map
		this.cache.delete(node.key);
	}

	/**
	 * Cleanup expired entries
	 */
	private cleanupExpired(): void {
		const now = Date.now();
		const toRemove: LRUNode[] = [];

		// Find expired entries
		for (const node of this.cache.values()) {
			if (now > node.expiresAt) {
				toRemove.push(node);
			}
		}

		// Remove them
		for (const node of toRemove) {
			this.removeNode(node);
		}
	}
}
