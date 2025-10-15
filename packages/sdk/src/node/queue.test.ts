import { describe, expect, it } from 'bun:test';
import { EventQueue } from './queue';

describe('EventQueue', () => {
	describe('initialization', () => {
		it('should create empty queue', () => {
			const queue = new EventQueue(10);
			expect(queue.size()).toBe(0);
			expect(queue.isEmpty()).toBe(true);
		});

		it('should accept max size', () => {
			const queue = new EventQueue(100);
			expect(queue.size()).toBe(0);
		});
	});

	describe('add', () => {
		it('should add events to queue', () => {
			const queue = new EventQueue(10);
			const event = {
				type: 'custom' as const,
				name: 'test_event',
			};

			const shouldFlush = queue.add(event);
			
			expect(queue.size()).toBe(1);
			expect(shouldFlush).toBe(false);
		});

		it('should return true when max size is reached', () => {
			const queue = new EventQueue(3);
			
			queue.add({ type: 'custom' as const, name: 'event1' });
			queue.add({ type: 'custom' as const, name: 'event2' });
			const shouldFlush = queue.add({ type: 'custom' as const, name: 'event3' });
			
			expect(shouldFlush).toBe(true);
			expect(queue.size()).toBe(3);
		});

		it('should handle multiple events', () => {
			const queue = new EventQueue(10);
			
			for (let i = 0; i < 5; i++) {
				queue.add({ type: 'custom' as const, name: `event${i}` });
			}
			
			expect(queue.size()).toBe(5);
		});
	});

	describe('getAll', () => {
		it('should return all events', () => {
			const queue = new EventQueue(10);
			const events = [
				{ type: 'custom' as const, name: 'event1' },
				{ type: 'custom' as const, name: 'event2' },
				{ type: 'custom' as const, name: 'event3' },
			];

			for (const event of events) {
				queue.add(event);
			}

			const result = queue.getAll();
			
			expect(result).toHaveLength(3);
			expect(result[0].name).toBe('event1');
			expect(result[1].name).toBe('event2');
			expect(result[2].name).toBe('event3');
		});

		it('should return copy of events', () => {
			const queue = new EventQueue(10);
			queue.add({ type: 'custom' as const, name: 'event1' });
			
			const result1 = queue.getAll();
			const result2 = queue.getAll();
			
			expect(result1).not.toBe(result2);
			expect(result1).toEqual(result2);
		});

		it('should return empty array for empty queue', () => {
			const queue = new EventQueue(10);
			const result = queue.getAll();
			
			expect(result).toEqual([]);
		});
	});

	describe('clear', () => {
		it('should clear all events', () => {
			const queue = new EventQueue(10);
			
			queue.add({ type: 'custom' as const, name: 'event1' });
			queue.add({ type: 'custom' as const, name: 'event2' });
			
			expect(queue.size()).toBe(2);
			
			queue.clear();
			
			expect(queue.size()).toBe(0);
			expect(queue.isEmpty()).toBe(true);
		});

		it('should be safe to clear empty queue', () => {
			const queue = new EventQueue(10);
			queue.clear();
			
			expect(queue.size()).toBe(0);
			expect(queue.isEmpty()).toBe(true);
		});
	});

	describe('size', () => {
		it('should return correct size', () => {
			const queue = new EventQueue(10);
			
			expect(queue.size()).toBe(0);
			
			queue.add({ type: 'custom' as const, name: 'event1' });
			expect(queue.size()).toBe(1);
			
			queue.add({ type: 'custom' as const, name: 'event2' });
			expect(queue.size()).toBe(2);
			
			queue.clear();
			expect(queue.size()).toBe(0);
		});
	});

	describe('isEmpty', () => {
		it('should return true for empty queue', () => {
			const queue = new EventQueue(10);
			expect(queue.isEmpty()).toBe(true);
		});

		it('should return false for non-empty queue', () => {
			const queue = new EventQueue(10);
			queue.add({ type: 'custom' as const, name: 'event1' });
			
			expect(queue.isEmpty()).toBe(false);
		});

		it('should return true after clearing', () => {
			const queue = new EventQueue(10);
			queue.add({ type: 'custom' as const, name: 'event1' });
			queue.clear();
			
			expect(queue.isEmpty()).toBe(true);
		});
	});

	describe('max size behavior', () => {
		it('should signal flush at max size', () => {
			const queue = new EventQueue(2);
			
			const shouldFlush1 = queue.add({ type: 'custom' as const, name: 'event1' });
			expect(shouldFlush1).toBe(false);
			
			const shouldFlush2 = queue.add({ type: 'custom' as const, name: 'event2' });
			expect(shouldFlush2).toBe(true);
		});

		it('should continue accepting events after max size', () => {
			const queue = new EventQueue(2);
			
			queue.add({ type: 'custom' as const, name: 'event1' });
			queue.add({ type: 'custom' as const, name: 'event2' });
			queue.add({ type: 'custom' as const, name: 'event3' });
			
			expect(queue.size()).toBe(3);
		});

		it('should handle edge case of max size 1', () => {
			const queue = new EventQueue(1);
			
			const shouldFlush = queue.add({ type: 'custom' as const, name: 'event1' });
			
			expect(shouldFlush).toBe(true);
			expect(queue.size()).toBe(1);
		});
	});

	describe('event data integrity', () => {
		it('should preserve event properties', () => {
			const queue = new EventQueue(10);
			const event = {
				type: 'custom' as const,
				name: 'test_event',
				eventId: 'evt_123',
				anonymousId: 'anon_456',
				sessionId: 'sess_789',
				timestamp: 1234567890,
				properties: { foo: 'bar', count: 42 },
			};

			queue.add(event);
			const result = queue.getAll();
			
			expect(result[0]).toEqual(event);
		});

		it('should handle null values', () => {
			const queue = new EventQueue(10);
			const event = {
				type: 'custom' as const,
				name: 'test_event',
				anonymousId: null,
				sessionId: null,
				timestamp: null,
				properties: null,
			};

			queue.add(event);
			const result = queue.getAll();
			
			expect(result[0]).toEqual(event);
		});
	});
});

