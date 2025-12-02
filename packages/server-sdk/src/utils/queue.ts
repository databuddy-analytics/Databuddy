import type { InternalEvent } from "../types";

/**
 * Event queue with max size limit
 * Returns true from add() when queue reaches max capacity
 */
export class EventQueue {
	private queue: InternalEvent[] = [];
	private readonly maxSize: number;

	constructor(maxSize: number) {
		this.maxSize = maxSize;
	}

	/**
	 * Add an event to the queue
	 * @returns true if queue has reached max capacity (overflow signal)
	 */
	add(event: InternalEvent): boolean {
		this.queue.push(event);
		return this.queue.length >= this.maxSize;
	}

	/**
	 * Get all events (shallow copy)
	 */
	getAll(): InternalEvent[] {
		return [...this.queue];
	}

	/**
	 * Clear all events from queue
	 */
	clear(): void {
		this.queue = [];
	}

	/**
	 * Get current queue size
	 */
	size(): number {
		return this.queue.length;
	}

	/**
	 * Check if queue is empty
	 */
	isEmpty(): boolean {
		return this.queue.length === 0;
	}

	/**
	 * Peek at the first event without removing
	 */
	peek(): InternalEvent | undefined {
		return this.queue[0];
	}

	/**
	 * Get the max size of the queue
	 */
	getMaxSize(): number {
		return this.maxSize;
	}
}
