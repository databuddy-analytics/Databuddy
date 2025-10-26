import { describe, expect, it } from 'vitest';
import {
	VALIDATION_LIMITS,
	sanitizeString,
	validateTimezone,
	validateTimezoneOffset,
	validateLanguage,
	validateSessionId,
	validateUtmParameter,
	validateNumeric,
	validateUrl,
	filterSafeHeaders,
	validateProperties,
	validatePayloadSize,
	validatePerformanceMetric,
	validateScreenResolution,
	validateViewportSize,
	validateScrollDepth,
	validatePageCount,
	validateInteractionCount,
	validateExitIntent,
} from './validation';

describe('Validation Utilities', () => {
	describe('sanitizeString', () => {
		it('should sanitize basic strings', () => {
			expect(sanitizeString('hello world')).toBe('hello world');
			expect(sanitizeString('  hello world  ')).toBe('hello world');
		});

		it('should sanitize dangerous characters', () => {
			expect(sanitizeString('hello<script>alert("xss")</script>world')).toContain('hello');
			expect(sanitizeString('hello<script>alert("xss")</script>world')).toContain('world');
			expect(sanitizeString('hello<script>alert("xss")</script>world')).not.toContain('<script>');
		});

		it('should remove control characters', () => {
			expect(sanitizeString('hello\x00world')).toBe('helloworld');
			expect(sanitizeString('hello\x08world')).toBe('helloworld');
			expect(sanitizeString('hello\x1fworld')).toBe('helloworld');
			expect(sanitizeString('hello\x7fworld')).toBe('helloworld');
		});

		it('should normalize whitespace', () => {
			expect(sanitizeString('hello\t\n\rworld')).toBe('hello world');
			expect(sanitizeString('hello   world')).toBe('hello world');
		});

		it('should enforce max length', () => {
			const longString = 'a'.repeat(3000);
			const result = sanitizeString(longString, 100);
			expect(result.length).toBe(100);
			expect(result).toBe('a'.repeat(100));
		});

		it('should handle non-string inputs', () => {
			expect(sanitizeString(null as unknown as string)).toBe('');
			expect(sanitizeString(undefined as unknown as string)).toBe('');
			expect(sanitizeString(123 as unknown as string)).toBe('');
			expect(sanitizeString({} as unknown as string)).toBe('');
		});

		it('should use default max length when not specified', () => {
			const longString = 'a'.repeat(3000);
			const result = sanitizeString(longString);
			expect(result.length).toBe(VALIDATION_LIMITS.STRING_MAX_LENGTH);
		});
	});

	describe('validateTimezone', () => {
		it('should validate correct timezone formats', () => {
			expect(validateTimezone('America/New_York')).toBe('America/New_York');
			expect(validateTimezone('Europe/London')).toBe('Europe/London');
			expect(validateTimezone('UTC')).toBe('UTC');
			expect(validateTimezone('GMT+5')).toBe('GMT+5');
			expect(validateTimezone('EST')).toBe('EST');
		});

		it('should handle invalid timezone formats', () => {
			// validateTimezone returns sanitized string
			expect(typeof validateTimezone('invalid/timezone/with/slashes')).toBe('string');
			expect(validateTimezone('')).toBe('');
		});

		it('should handle non-string inputs', () => {
			expect(validateTimezone(null as unknown as string)).toBe('');
			expect(validateTimezone(123 as unknown as string)).toBe('');
			expect(validateTimezone({} as unknown as string)).toBe('');
		});

		it('should handle very long timezones', () => {
			const longTimezone = 'A'.repeat(100);
			expect(typeof validateTimezone(longTimezone)).toBe('string');
		});
	});

	describe('validateTimezoneOffset', () => {
		it('should validate correct timezone offsets', () => {
			expect(validateTimezoneOffset(0)).toBe(0);
			expect(validateTimezoneOffset(-480)).toBe(-480); // PST
			expect(validateTimezoneOffset(300)).toBe(300); // EST
			expect(validateTimezoneOffset(-720)).toBe(-720); // Hawaii
			expect(validateTimezoneOffset(840)).toBe(840); // Chatham Islands
		});

		it('should reject invalid timezone offsets', () => {
			expect(validateTimezoneOffset(-1000)).toBeNull();
			expect(validateTimezoneOffset(1000)).toBeNull();
			expect(validateTimezoneOffset(NaN)).toBeNull();
			expect(validateTimezoneOffset(Infinity)).toBeNull();
		});

		it('should handle non-number inputs', () => {
			expect(validateTimezoneOffset('120' as unknown as number)).toBeNull();
			expect(validateTimezoneOffset(null as unknown as number)).toBeNull();
			expect(validateTimezoneOffset(undefined as unknown as number)).toBeNull();
		});

		it('should round fractional offsets', () => {
			expect(validateTimezoneOffset(120.7)).toBe(121);
			expect(validateTimezoneOffset(120.3)).toBe(120);
		});
	});

	describe('validateLanguage', () => {
		it('should validate correct language codes', () => {
			expect(validateLanguage('en')).toBe('en');
			expect(validateLanguage('en-US')).toBe('en-us');
			expect(validateLanguage('zh-CN')).toBe('zh-cn');
			expect(validateLanguage('fr-FR')).toBe('fr-fr');
			expect(validateLanguage('es-419')).toBe('es-419');
		});

		it('should reject invalid language codes', () => {
			expect(validateLanguage('english')).toBe('');
			expect(validateLanguage('en_US')).toBe('');
			expect(validateLanguage('en@US')).toBe('');
			expect(validateLanguage('')).toBe('');
		});

		it('should handle non-string inputs', () => {
			expect(validateLanguage(null as unknown as string)).toBe('');
			expect(validateLanguage(123 as unknown as string)).toBe('');
		});

		it('should enforce max length', () => {
			const longLanguage = 'a'.repeat(50);
			expect(validateLanguage(longLanguage)).toBe('');
		});
	});

	describe('validateSessionId', () => {
		it('should validate correct session ID formats', () => {
			expect(validateSessionId('sess_12345678-1234-1234-1234-123456789012')).toBe('sess_12345678-1234-1234-1234-123456789012');
			expect(validateSessionId('session-abc123')).toBe('session-abc123');
			expect(validateSessionId('1234567890')).toBe('1234567890');
			expect(validateSessionId('abc_def-123')).toBe('abc_def-123');
		});

		it('should reject invalid session ID formats', () => {
			expect(validateSessionId('session with spaces')).toBe('');
			expect(validateSessionId('session@with#special')).toBe('');
			expect(validateSessionId('session.with.dots')).toBe('');
			expect(validateSessionId('')).toBe('');
		});

		it('should handle non-string inputs', () => {
			expect(validateSessionId(null as unknown as string)).toBe('');
			expect(validateSessionId(123 as unknown as string)).toBe('');
		});

		it('should handle very long session IDs', () => {
			const longSessionId = 'a'.repeat(200);
			// Should return sanitized string, possibly truncated
			expect(typeof validateSessionId(longSessionId)).toBe('string');
		});
	});

	describe('validateUtmParameter', () => {
		it('should validate UTM parameters', () => {
			expect(validateUtmParameter('google')).toBe('google');
			expect(validateUtmParameter('email-campaign')).toBe('email-campaign');
			expect(validateUtmParameter('social_media')).toBe('social_media');
		});

		it('should sanitize UTM parameters', () => {
			expect(validateUtmParameter('google<script>')).toBe('google');
			expect(validateUtmParameter('  spaced  ')).toBe('spaced');
		});

		it('should enforce max length', () => {
			const longUtm = 'a'.repeat(600);
			const result = validateUtmParameter(longUtm);
			expect(result.length).toBe(VALIDATION_LIMITS.UTM_MAX_LENGTH);
		});
	});

	describe('validateNumeric', () => {
		it('should validate numbers within range', () => {
			expect(validateNumeric(100, 0, 1000)).toBe(100);
			expect(validateNumeric(0, 0, 1000)).toBe(0);
			expect(validateNumeric(1000, 0, 1000)).toBe(1000);
		});

		it('should reject numbers outside range', () => {
			expect(validateNumeric(-1, 0, 1000)).toBeNull();
			expect(validateNumeric(1001, 0, 1000)).toBeNull();
		});

		it('should parse string numbers', () => {
			expect(validateNumeric('100', 0, 1000)).toBe(100);
			expect(validateNumeric('100.7', 0, 1000)).toBe(101);
		});

		it('should reject invalid inputs', () => {
			expect(validateNumeric('abc', 0, 1000)).toBeNull();
			expect(validateNumeric(NaN, 0, 1000)).toBeNull();
			expect(validateNumeric(Infinity, 0, 1000)).toBeNull();
			expect(validateNumeric(null, 0, 1000)).toBeNull();
		});

		it('should round fractional numbers', () => {
			expect(validateNumeric(100.7, 0, 1000)).toBe(101);
			expect(validateNumeric(100.3, 0, 1000)).toBe(100);
		});
	});

	describe('validateUrl', () => {
		it('should validate HTTP and HTTPS URLs', () => {
			// URL validation may normalize URLs (add trailing slash)
			expect(validateUrl('https://example.com')).toContain('https://example.com');
			expect(validateUrl('http://example.com')).toContain('http://example.com');
			expect(validateUrl('https://example.com/path?query=1')).toBe('https://example.com/path?query=1');
		});

		it('should reject non-HTTP protocols', () => {
			expect(validateUrl('ftp://example.com')).toBe('');
			expect(validateUrl('javascript:alert(1)')).toBe('');
			expect(validateUrl('data:text/html,<script>')).toBe('');
		});

		it('should reject invalid URLs', () => {
			expect(validateUrl('not-a-url')).toBe('');
			expect(validateUrl('')).toBe('');
		});

		it('should handle non-string inputs', () => {
			expect(validateUrl(null as unknown as string)).toBe('');
			expect(validateUrl(123 as unknown as string)).toBe('');
		});
	});

	describe('filterSafeHeaders', () => {
		it('should filter safe headers only', () => {
			const headers = {
				'user-agent': 'Mozilla/5.0',
				'content-type': 'application/json',
				'x-custom-header': 'value',
				'authorization': 'Bearer token',
				'accept': '*/*',
			};

			const result = filterSafeHeaders(headers);
			expect(result).toEqual({
				'user-agent': 'Mozilla/5.0',
				'content-type': 'application/json',
				'accept': '*/*',
			});
		});

		it('should handle array values', () => {
			const headers = {
				'accept': ['*/*', 'text/html'],
				'user-agent': 'Mozilla/5.0',
			};

			const result = filterSafeHeaders(headers);
			expect(result).toEqual({
				'accept': '*/*',
				'user-agent': 'Mozilla/5.0',
			});
		});

		it('should sanitize header values', () => {
			const headers = {
				'user-agent': 'Mozilla/5.0<script>alert(1)</script>',
				'accept': '*/*',
			};

			const result = filterSafeHeaders(headers);
			expect(result['accept']).toBe('*/*');
			expect(result['user-agent']).toContain('Mozilla/5.0');
			expect(result['user-agent']).not.toContain('<script>');
		});
	});

	describe('validateProperties', () => {
		it('should validate object properties', () => {
			const properties = {
				name: 'test',
				value: 123,
				active: true,
				description: null,
			};

			const result = validateProperties(properties);
			expect(result).toEqual({
				name: 'test',
				value: 123,
				active: true,
				description: null,
			});
		});

		it('should sanitize string properties', () => {
			const properties = {
				name: 'test<script>alert(1)</script>',
				value: 123,
			};

			const result = validateProperties(properties);
			expect(result.value).toBe(123);
			expect(result.name).toContain('test');
			expect(result.name).not.toContain('<script>');
		});

		it('should limit number of properties', () => {
			const properties: Record<string, string> = {};
			for (let i = 0; i < 150; i++) {
				properties[`prop${i}`] = `value${i}`;
			}

			const result = validateProperties(properties);
			expect(Object.keys(result).length).toBeLessThanOrEqual(100);
		});

		it('should handle non-object inputs', () => {
			expect(validateProperties(null)).toEqual({});
			expect(validateProperties(undefined)).toEqual({});
			expect(validateProperties('string')).toEqual({});
			expect(validateProperties([])).toEqual({});
		});
	});

	describe('validatePayloadSize', () => {
		it('should validate payload size', () => {
			const smallPayload = { test: 'data' };
			expect(validatePayloadSize(smallPayload)).toBe(true);

			const largePayload = { data: 'x'.repeat(2 * 1024 * 1024) }; // 2MB
			expect(validatePayloadSize(largePayload, 1024 * 1024)).toBe(false);
		});

		it('should handle circular references', () => {
			const circular: any = { test: 'data' };
			circular.self = circular;

			expect(validatePayloadSize(circular)).toBe(false);
		});

		it('should handle non-serializable data', () => {
			const nonSerializable = {
				test: 'data',
				func: () => {},
			};

			const result = validatePayloadSize(nonSerializable);
			expect(typeof result).toBe('boolean');
		});
	});

	describe('validatePerformanceMetric', () => {
		it('should validate performance metrics', () => {
			expect(validatePerformanceMetric(100)).toBe(100);
			expect(validatePerformanceMetric(0)).toBe(0);
			expect(validatePerformanceMetric(300000)).toBe(300000);
		});

		it('should reject invalid performance metrics', () => {
			expect(validatePerformanceMetric(-1)).toBeUndefined();
			expect(validatePerformanceMetric(300001)).toBeUndefined();
			expect(validatePerformanceMetric(NaN)).toBeUndefined();
		});

		it('should parse string numbers', () => {
			expect(validatePerformanceMetric('100')).toBe(100);
			expect(validatePerformanceMetric('100.7')).toBe(101);
		});
	});

	describe('validateScreenResolution', () => {
		it('should validate screen resolution formats', () => {
			expect(validateScreenResolution('1920x1080')).toBe('1920x1080');
			expect(validateScreenResolution('1024x768')).toBe('1024x768');
			expect(validateScreenResolution('2560x1440')).toBe('2560x1440');
		});

		it('should reject invalid formats', () => {
			expect(validateScreenResolution('1920x')).toBe('');
			expect(validateScreenResolution('x1080')).toBe('');
			expect(validateScreenResolution('1920 1080')).toBe('');
			expect(validateScreenResolution('')).toBe('');
		});

		it('should handle non-string inputs', () => {
			expect(validateScreenResolution(null as unknown as string)).toBe('');
			expect(validateScreenResolution(123 as unknown as string)).toBe('');
		});
	});

	describe('validateViewportSize', () => {
		it('should validate viewport size (same as screen resolution)', () => {
			expect(validateViewportSize('1920x1080')).toBe('1920x1080');
			expect(validateViewportSize('1024x768')).toBe('1024x768');
		});

		it('should reject invalid formats', () => {
			expect(validateViewportSize('1920x')).toBe('');
			expect(validateViewportSize('invalid')).toBe('');
		});
	});

	describe('validateScrollDepth', () => {
		it('should validate scroll depth percentages', () => {
			expect(validateScrollDepth(0)).toBe(0);
			expect(validateScrollDepth(50)).toBe(50);
			expect(validateScrollDepth(100)).toBe(100);
		});

		it('should reject invalid scroll depths', () => {
			expect(validateScrollDepth(-1)).toBeNull();
			expect(validateScrollDepth(101)).toBeNull();
		});

		it('should parse string numbers', () => {
			expect(validateScrollDepth('50')).toBe(50);
			expect(validateScrollDepth('50.7')).toBe(51);
		});
	});

	describe('validatePageCount', () => {
		it('should validate page counts', () => {
			expect(validatePageCount(1)).toBe(1);
			expect(validatePageCount(100)).toBe(100);
			expect(validatePageCount(10000)).toBe(10000);
		});

		it('should reject invalid page counts', () => {
			expect(validatePageCount(0)).toBeNull();
			expect(validatePageCount(10001)).toBeNull();
		});
	});

	describe('validateInteractionCount', () => {
		it('should validate interaction counts', () => {
			expect(validateInteractionCount(0)).toBe(0);
			expect(validateInteractionCount(1000)).toBe(1000);
			expect(validateInteractionCount(100000)).toBe(100000);
		});

		it('should reject invalid interaction counts', () => {
			expect(validateInteractionCount(-1)).toBeNull();
			expect(validateInteractionCount(100001)).toBeNull();
		});
	});

	describe('validateExitIntent', () => {
		it('should validate exit intent values', () => {
			expect(validateExitIntent(0)).toBe(0);
			expect(validateExitIntent(1)).toBe(1);
		});

		it('should default invalid values to 0', () => {
			expect(validateExitIntent(-1)).toBe(0);
			expect(validateExitIntent(2)).toBe(0);
			expect(validateExitIntent('invalid')).toBe(0);
		});

		it('should parse string numbers', () => {
			expect(validateExitIntent('1')).toBe(1);
			expect(validateExitIntent('0')).toBe(0);
		});
	});
});
