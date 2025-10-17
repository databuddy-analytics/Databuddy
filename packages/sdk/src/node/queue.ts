import type { BatchEventInput } from './types';

export class EventQueue {
	private queue: BatchEventInput[] = [];
	private maxSize: number;

	constructor(maxSize: number) {
		this.maxSize = maxSize;
	}

	add(event: BatchEventInput): boolean {
		this.queue.push(event);
		return this.queue.length >= this.maxSize;
	}

	getAll(): BatchEventInput[] {
		return [...this.queue];
	}

	clear(): void {
		this.queue = [];
	}

	size(): number {
		return this.queue.length;
	}

	isEmpty(): boolean {
		return this.queue.length === 0;
	}
}

