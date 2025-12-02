/**
 * Deduplication cache interface
 * Implementations must be async to support Redis backend
 */
export interface DeduplicationCache {
	/**
	 * Check if event ID exists and add if not
	 * @returns true if duplicate (ID already exists), false if new
	 */
	isDuplicate(eventId: string): Promise<boolean>;

	/**
	 * Explicitly add an event ID to the cache
	 */
	add(eventId: string): Promise<void>;

	/**
	 * Remove an event ID from the cache
	 */
	remove(eventId: string): Promise<void>;

	/**
	 * Clear all entries from the cache
	 */
	clear(): Promise<void>;

	/**
	 * Get current cache size
	 */
	size(): Promise<number>;

	/**
	 * Cleanup and close the cache
	 */
	close(): Promise<void>;
}
