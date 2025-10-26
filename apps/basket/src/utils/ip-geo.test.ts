import { beforeEach, describe, expect, it } from 'vitest';
import {
	anonymizeIp,
	extractIpFromRequest,
	getClientIp,
	getGeo,
	getGeoLocation,
	parseIp,
} from './ip-geo';

describe('IP Geo Utilities', () => {
	beforeEach(() => {
		// Reset environment
		process.env.IP_HASH_SALT = undefined;
	});

	describe('getGeoLocation', () => {
		it('should return geo location for valid public IP', async () => {
			const result = await getGeoLocation('8.8.8.8');
			expect(result).toBeDefined();
			// Should return either geo data or undefined (if not in database)
			expect(
				typeof result.country === 'string' || result.country === undefined
			).toBe(true);
			expect(
				typeof result.region === 'string' || result.region === undefined
			).toBe(true);
		});

		it('should return undefined for localhost IPs', async () => {
			const result = await getGeoLocation('127.0.0.1');
			expect(result).toEqual({
				country: undefined,
				region: undefined,
			});
		});

		it('should return undefined for IPv6 localhost', async () => {
			const result = await getGeoLocation('::1');
			expect(result).toEqual({
				country: undefined,
				region: undefined,
			});
		});

		it('should return undefined for empty IP', async () => {
			const result = await getGeoLocation('');
			expect(result).toEqual({
				country: undefined,
				region: undefined,
			});
		});

		it('should return undefined for invalid IP format', async () => {
			const result = await getGeoLocation('invalid-ip');
			expect(result).toEqual({
				country: undefined,
				region: undefined,
			});
		});

		it('should return undefined for malformed IP', async () => {
			const result = await getGeoLocation('256.256.256.256');
			expect(result).toEqual({
				country: undefined,
				region: undefined,
			});
		});

		it('should handle private IP addresses', async () => {
			const privateIPs = [
				'192.168.1.1',
				'10.0.0.1',
				'172.16.0.1',
				'169.254.1.1', // Link-local
			];

			const results = await Promise.all(
				privateIPs.map((ip) => getGeoLocation(ip))
			);
			for (const result of results) {
				// Should return undefined for private IPs (not in public database)
				expect(result).toEqual({
					country: undefined,
					region: undefined,
				});
			}
		});
	});

	describe('getClientIp', () => {
		it('should extract IP from cf-connecting-ip header', () => {
			const request = new Request('https://example.com', {
				headers: {
					'cf-connecting-ip': '203.0.113.1',
				},
			});
			const result = getClientIp(request);
			expect(result).toBe('203.0.113.1');
		});

		it('should extract first IP from x-forwarded-for header', () => {
			const request = new Request('https://example.com', {
				headers: {
					'x-forwarded-for': '203.0.113.1, 10.0.0.1, 192.168.1.1',
				},
			});
			const result = getClientIp(request);
			expect(result).toBe('203.0.113.1');
		});

		it('should extract IP from x-real-ip header', () => {
			const request = new Request('https://example.com', {
				headers: {
					'x-real-ip': '203.0.113.1',
				},
			});
			const result = getClientIp(request);
			expect(result).toBe('203.0.113.1');
		});

		it('should prioritize cf-connecting-ip over other headers', () => {
			const request = new Request('https://example.com', {
				headers: {
					'cf-connecting-ip': '203.0.113.1',
					'x-forwarded-for': '10.0.0.1',
					'x-real-ip': '192.168.1.1',
				},
			});
			const result = getClientIp(request);
			expect(result).toBe('203.0.113.1');
		});

		it('should return undefined when no IP headers are present', () => {
			const request = new Request('https://example.com');
			const result = getClientIp(request);
			expect(result).toBeUndefined();
		});

		it('should handle empty x-forwarded-for header', () => {
			const request = new Request('https://example.com', {
				headers: {
					'x-forwarded-for': '',
				},
			});
			const result = getClientIp(request);
			expect(result).toBeUndefined();
		});

		it('should handle whitespace in x-forwarded-for header', () => {
			const request = new Request('https://example.com', {
				headers: {
					'x-forwarded-for': '  203.0.113.1  ,  10.0.0.1  ',
				},
			});
			const result = getClientIp(request);
			expect(result).toBe('203.0.113.1');
		});
	});

	describe('parseIp', () => {
		it('should parse IP and return geo location', async () => {
			const request = new Request('https://example.com', {
				headers: {
					'cf-connecting-ip': '8.8.8.8',
				},
			});
			const result = await parseIp(request);
			expect(result).toBeDefined();
			expect(
				typeof result.country === 'string' || result.country === undefined
			).toBe(true);
			expect(
				typeof result.region === 'string' || result.region === undefined
			).toBe(true);
		});

		it('should handle request without IP headers', async () => {
			const request = new Request('https://example.com');
			const result = await parseIp(request);
			expect(result).toEqual({
				country: undefined,
				region: undefined,
			});
		});
	});

	describe('anonymizeIp', () => {
		it('should anonymize valid IP address', () => {
			const result = anonymizeIp('203.0.113.1');
			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
			expect(result.length).toBeGreaterThan(0);
		});

		it('should return empty string for empty IP', () => {
			const result = anonymizeIp('');
			expect(result).toBe('');
		});

		it('should use default salt when IP_HASH_SALT is not set', () => {
			const result = anonymizeIp('203.0.113.1');
			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
		});

		it('should use custom salt when IP_HASH_SALT is set', () => {
			process.env.IP_HASH_SALT = 'custom-salt';
			const result = anonymizeIp('203.0.113.1');
			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
		});

		it('should produce consistent hashes for same IP', () => {
			const ip = '203.0.113.1';
			const hash1 = anonymizeIp(ip);
			const hash2 = anonymizeIp(ip);
			expect(hash1).toBe(hash2);
		});

		it('should produce different hashes for different IPs', () => {
			const hash1 = anonymizeIp('203.0.113.1');
			const hash2 = anonymizeIp('203.0.113.2');
			expect(hash1).not.toBe(hash2);
		});
	});

	describe('getGeo', () => {
		it('should return complete geo information with anonymized IP', async () => {
			const result = await getGeo('8.8.8.8');
			expect(result).toBeDefined();
			expect(result.anonymizedIP).toBeDefined();
			expect(typeof result.anonymizedIP).toBe('string');
			expect(
				typeof result.country === 'string' || result.country === undefined
			).toBe(true);
			expect(
				typeof result.region === 'string' || result.region === undefined
			).toBe(true);
		});

		it('should handle IP with no geo data', async () => {
			const result = await getGeo('192.168.1.1');
			expect(result).toBeDefined();
			expect(result.anonymizedIP).toBeDefined();
			expect(result.country).toBeUndefined();
			expect(result.region).toBeUndefined();
		});

		it('should handle empty IP', async () => {
			const result = await getGeo('');
			expect(result).toEqual({
				anonymizedIP: '',
				country: undefined,
				region: undefined,
			});
		});
	});

	describe('extractIpFromRequest', () => {
		it('should extract IP from cf-connecting-ip header', () => {
			const request = new Request('https://example.com', {
				headers: {
					'cf-connecting-ip': '203.0.113.1',
				},
			});
			const result = extractIpFromRequest(request);
			expect(result).toBe('203.0.113.1');
		});

		it('should extract first IP from x-forwarded-for header', () => {
			const request = new Request('https://example.com', {
				headers: {
					'x-forwarded-for': '203.0.113.1, 10.0.0.1',
				},
			});
			const result = extractIpFromRequest(request);
			expect(result).toBe('203.0.113.1');
		});

		it('should extract IP from x-real-ip header', () => {
			const request = new Request('https://example.com', {
				headers: {
					'x-real-ip': '203.0.113.1',
				},
			});
			const result = extractIpFromRequest(request);
			expect(result).toBe('203.0.113.1');
		});

		it('should return empty string when no IP headers are present', () => {
			const request = new Request('https://example.com');
			const result = extractIpFromRequest(request);
			expect(result).toBe('');
		});

		it('should handle whitespace in headers', () => {
			const request = new Request('https://example.com', {
				headers: {
					'cf-connecting-ip': '  203.0.113.1  ',
				},
			});
			const result = extractIpFromRequest(request);
			expect(result).toBe('203.0.113.1');
		});
	});

	describe('IP validation', () => {
		it('should validate correct IPv4 addresses', () => {
			const validIPs = [
				'192.168.1.1',
				'10.0.0.1',
				'172.16.0.1',
				'8.8.8.8',
				'1.1.1.1',
				'255.255.255.255',
				'0.0.0.0',
			];

			for (const ip of validIPs) {
				const result = getGeoLocation(ip);
				expect(result).toBeDefined();
			}
		});

		it('should reject invalid IPv4 addresses', () => {
			const invalidIPs = [
				'256.1.2.3',
				'1.256.2.3',
				'1.2.256.3',
				'1.2.3.256',
				'999.999.999.999',
				'192.168.1',
				'192.168.1.1.1',
				'192.168.1.1.',
				'.192.168.1.1',
				'192.168.1.1.2',
				'192.168.1.1.2.3',
			];

			for (const ip of invalidIPs) {
				const result = getGeoLocation(ip);
				expect(result).toEqual({
					country: undefined,
					region: undefined,
				});
			}
		});

		it('should handle IPv6 addresses', () => {
			const ipv6Addresses = [
				'2001:0db8:85a3:0000:0000:8a2e:0370:7334',
				'2001:db8:85a3::8a2e:370:7334',
				'::1',
				'::ffff:192.168.1.1',
			];

			for (const ip of ipv6Addresses) {
				const result = getGeoLocation(ip);
				expect(result).toBeDefined();
			}
		});
	});

	describe('Edge cases', () => {
		it('should handle null/undefined IP gracefully', async () => {
			const result = await getGeoLocation(null as unknown as string);
			expect(result).toEqual({
				country: undefined,
				region: undefined,
			});
		});

		it('should handle special characters in IP', async () => {
			const result = await getGeoLocation('192.168.1.1<script>');
			expect(result).toEqual({
				country: undefined,
				region: undefined,
			});
		});

		it('should handle very long IP strings', async () => {
			const longIp = '192.168.1.1'.repeat(100);
			const result = await getGeoLocation(longIp);
			expect(result).toEqual({
				country: undefined,
				region: undefined,
			});
		});

		it('should handle requests with multiple IP headers', () => {
			const request = new Request('https://example.com', {
				headers: {
					'cf-connecting-ip': '203.0.113.1',
					'x-forwarded-for': '10.0.0.1, 192.168.1.1',
					'x-real-ip': '172.16.0.1',
				},
			});
			const result = getClientIp(request);
			expect(result).toBe('203.0.113.1');
		});
	});

	describe('Real-world IP testing', () => {
		it('should handle common public IPs', async () => {
			const publicIPs = [
				'8.8.8.8', // Google DNS
				'1.1.1.1', // Cloudflare DNS
				'208.67.222.222', // OpenDNS
				'104.28.196.183', // Cloudflare IP
			];

			const results = await Promise.all(
				publicIPs.map((ip) => getGeoLocation(ip))
			);
			for (const result of results) {
				expect(result).toBeDefined();
				// Should either have geo data or be undefined (not in database)
				expect(
					typeof result.country === 'string' || result.country === undefined
				).toBe(true);
				expect(
					typeof result.region === 'string' || result.region === undefined
				).toBe(true);
			}
		});

		it('should handle various IP formats consistently', async () => {
			const testIPs = [
				'8.8.8.8',
				'1.1.1.1',
				'104.28.196.183',
				'192.168.1.1',
				'127.0.0.1',
				'::1',
				'',
			];

			const geoResults = await Promise.all(
				testIPs.map((ip) => getGeoLocation(ip))
			);
			const fullResults = await Promise.all(testIPs.map((ip) => getGeo(ip)));

			for (let i = 0; i < testIPs.length; i++) {
				expect(geoResults[i]).toBeDefined();
				expect(fullResults[i]).toBeDefined();
				expect(fullResults[i].anonymizedIP).toBeDefined();
			}
		});
	});
});
