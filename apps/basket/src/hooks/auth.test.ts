import { describe, expect, it } from 'vitest';
import { logger } from '../lib/logger';
import {
	isLocalhost,
	isSubdomain,
	isValidDomainFormat,
	isValidOrigin,
	isValidOriginSecure,
	normalizeDomain,
} from './auth';

describe('Auth Hooks', () => {
	describe('normalizeDomain', () => {
		it.each([
			['https://www.example.com', 'example.com'],
			['http://example.com:8080', 'example.com'],
			['www.example.com', 'example.com'],
			['example.com', 'example.com'],
		])('should normalize %s to %s', (input, expected) => {
			expect(normalizeDomain(input)).toBe(expected);
		});

		it('should throw an error for invalid domain formats', () => {
			expect(() => normalizeDomain('invalid-.com')).toThrow();
		});
	});

	describe('isSubdomain', () => {
		it('should return true for valid subdomains', () => {
			expect(isSubdomain('sub.example.com', 'example.com')).toBe(true);
		});

		it('should return false for the same domain', () => {
			expect(isSubdomain('example.com', 'example.com')).toBe(false);
		});

		it('should return false for different domains', () => {
			expect(isSubdomain('another.com', 'example.com')).toBe(false);
		});
	});

	describe('isValidDomainFormat', () => {
		it.each(['example.com', 'sub.domain.co.uk', '123.com'])(
			'should return true for valid domain: %s',
			(domain) => {
				expect(isValidDomainFormat(domain)).toBe(true);
			}
		);

		it.each(['-example.com', 'example.com-', 'ex..ample.com', ''])(
			'should return false for invalid domain: %s',
			(domain) => {
				expect(isValidDomainFormat(domain)).toBe(false);
			}
		);
	});

	describe('isValidOrigin', () => {
		it('should return true for an empty origin header', () => {
			expect(isValidOrigin('', 'example.com')).toBe(true);
			expect(isValidOrigin(' ', 'example.com')).toBe(true);
		});

		it('should return false for an empty allowed domain', () => {
			expect(isValidOrigin('https://test.com', '')).toBe(false);
			expect(logger.warn).toHaveBeenCalledWith(
				'[isValidOrigin] No allowed domain provided'
			);
		});

		it('should return true for exact domain match', () => {
			expect(isValidOrigin('https://example.com', 'example.com')).toBe(true);
		});

		it('should return true for subdomain match', () => {
			expect(isValidOrigin('https://sub.example.com', 'example.com')).toBe(
				true
			);
		});

		it('should handle www prefix correctly', () => {
			expect(isValidOrigin('https://www.example.com', 'example.com')).toBe(
				true
			);
			expect(isValidOrigin('https://example.com', 'www.example.com')).toBe(
				true
			);
		});

		it('should handle localhost correctly', () => {
			expect(isValidOrigin('http://localhost:3000', 'localhost')).toBe(true);
		});

		it('should return false for different domains', () => {
			expect(isValidOrigin('https://another.com', 'example.com')).toBe(false);
		});

		it('should return false for invalid origin URL and log an error', () => {
			expect(isValidOrigin('invalid-url', 'example.com')).toBe(false);
			expect(logger.error).toHaveBeenCalled();
		});
	});

	describe('isValidOriginSecure', () => {
		it('should return false if HTTPS is required and protocol is HTTP', () => {
			expect(
				isValidOriginSecure('http://example.com', 'example.com', {
					requireHttps: true,
				})
			).toBe(false);
		});

		it('should return true for localhost if allowed', () => {
			expect(
				isValidOriginSecure('http://localhost:3000', 'example.com', {
					allowLocalhost: true,
				})
			).toBe(true);
		});

		it('should return false for localhost if not allowed', () => {
			expect(
				isValidOriginSecure('http://localhost:3000', 'example.com', {
					allowLocalhost: false,
				})
			).toBe(false);
		});

		it('should block specified subdomains', () => {
			expect(
				isValidOriginSecure('https://blocked.example.com', 'example.com', {
					blockedSubdomains: ['blocked'],
				})
			).toBe(false);
		});

		it('should allow only specified subdomains', () => {
			expect(
				isValidOriginSecure('https://allowed.example.com', 'example.com', {
					allowedSubdomains: ['allowed'],
				})
			).toBe(true);
			expect(
				isValidOriginSecure('https://another.example.com', 'example.com', {
					allowedSubdomains: ['allowed'],
				})
			).toBe(false);
		});
	});

	describe('isLocalhost', () => {
		it.each([
			'localhost',
			'127.0.0.1',
			'::1',
			'0.0.0.0',
			'127.1.2.3',
			'192.168.1.1',
			'10.0.0.1',
			'172.16.0.1',
		])('should return true for %s', (host) => {
			expect(isLocalhost(host)).toBe(true);
		});

		it.each(['example.com', '1.1.1.1', '172.32.0.1'])(
			'should return false for %s',
			(host) => {
				expect(isLocalhost(host)).toBe(false);
			}
		);
	});
});
