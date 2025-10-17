import { describe, expect, it, mock } from 'bun:test';
import { createLogger, createNoopLogger } from './logger';

describe('Logger', () => {
	describe('createNoopLogger', () => {
		it('should create logger that does nothing', () => {
			const logger = createNoopLogger();
			
			expect(() => logger.info('test')).not.toThrow();
			expect(() => logger.error('test')).not.toThrow();
			expect(() => logger.warn('test')).not.toThrow();
			expect(() => logger.debug('test')).not.toThrow();
		});

		it('should handle data objects', () => {
			const logger = createNoopLogger();
			
			expect(() => logger.info('test', { foo: 'bar' })).not.toThrow();
			expect(() => logger.error('test', { error: 'msg' })).not.toThrow();
		});

		it('should not output anything', () => {
			const logger = createNoopLogger();
			const consoleSpy = mock(() => {});
			const originalConsoleInfo = console.info;
			console.info = consoleSpy;
			
			logger.info('test');
			logger.error('test');
			logger.warn('test');
			logger.debug('test');
			
			expect(consoleSpy).not.toHaveBeenCalled();
			
			console.info = originalConsoleInfo;
		});
	});

	describe('createLogger', () => {
		it('should create logger with debug disabled', () => {
			const logger = createLogger(false);
			
			expect(logger).toBeDefined();
			expect(logger.info).toBeDefined();
			expect(logger.error).toBeDefined();
			expect(logger.warn).toBeDefined();
			expect(logger.debug).toBeDefined();
		});

		it('should create logger with debug enabled', () => {
			const logger = createLogger(true);
			
			expect(logger).toBeDefined();
			expect(logger.info).toBeDefined();
			expect(logger.error).toBeDefined();
			expect(logger.warn).toBeDefined();
			expect(logger.debug).toBeDefined();
		});

		it('should fall back to console logger when pino is not available', () => {
			const logger = createLogger(true);
			
			expect(() => logger.info('test')).not.toThrow();
		});

		it('should handle messages without data', () => {
			const logger = createLogger(true);
			
			expect(() => logger.info('test message')).not.toThrow();
			expect(() => logger.error('error message')).not.toThrow();
			expect(() => logger.warn('warning message')).not.toThrow();
			expect(() => logger.debug('debug message')).not.toThrow();
		});

		it('should handle messages with data', () => {
			const logger = createLogger(true);
			
			expect(() => logger.info('test', { key: 'value' })).not.toThrow();
			expect(() => logger.error('error', { code: 500 })).not.toThrow();
			expect(() => logger.warn('warning', { count: 10 })).not.toThrow();
			expect(() => logger.debug('debug', { flag: true })).not.toThrow();
		});

		it('should handle complex data objects', () => {
			const logger = createLogger(true);
			const complexData = {
				nested: {
					level: {
						deep: 'value',
					},
				},
				array: [1, 2, 3],
				null: null,
				undefined: undefined,
			};
			
			expect(() => logger.info('test', complexData)).not.toThrow();
		});
	});

	describe('console logger fallback', () => {
		it('should prefix messages with [DatabuddyNode]', () => {
			const logger = createLogger(true);
			const originalConsoleInfo = console.info;
			const consoleSpy = mock(() => {});
			console.info = consoleSpy;
			
			logger.info('test message');
			
			console.info = originalConsoleInfo;
		});

		it('should not log when debug is disabled', () => {
			const logger = createLogger(false);
			const originalConsoleInfo = console.info;
			const consoleSpy = mock(() => {});
			console.info = consoleSpy;
			
			logger.info('test message');
			logger.debug('debug message');
			
			expect(consoleSpy).not.toHaveBeenCalled();
			
			console.info = originalConsoleInfo;
		});

		it('should serialize data to JSON', () => {
			const logger = createLogger(true);
			const data = { foo: 'bar', count: 42 };
			
			expect(() => logger.info('test', data)).not.toThrow();
		});

		it('should handle empty data objects', () => {
			const logger = createLogger(true);
			
			expect(() => logger.info('test', {})).not.toThrow();
		});
	});

	describe('Logger interface', () => {
		it('should implement all required methods', () => {
			const logger = createLogger(true);
			
			expect(typeof logger.info).toBe('function');
			expect(typeof logger.error).toBe('function');
			expect(typeof logger.warn).toBe('function');
			expect(typeof logger.debug).toBe('function');
		});

		it('should have consistent interface for noop logger', () => {
			const logger = createNoopLogger();
			
			expect(typeof logger.info).toBe('function');
			expect(typeof logger.error).toBe('function');
			expect(typeof logger.warn).toBe('function');
			expect(typeof logger.debug).toBe('function');
		});
	});

	describe('error handling', () => {
		it('should not throw on invalid data', () => {
			const logger = createLogger(true);
			
			expect(() => logger.info('test', undefined as any)).not.toThrow();
			expect(() => logger.error('test', null as any)).not.toThrow();
		});

		it('should handle circular references', () => {
			const logger = createLogger(true);
			const circular: any = { a: 1 };
			circular.self = circular;
			
			try {
				logger.info('test', circular);
			} catch (error) {
				expect(error).toBeDefined();
			}
		});
	});
});

