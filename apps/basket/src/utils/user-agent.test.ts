import { describe, expect, it } from 'vitest';
import { detectBot, parseUserAgent } from './user-agent';

describe('User Agent Utilities', () => {
	describe('detectBot', () => {
		it('should identify a known bot from user agent', () => {
			const userAgent =
				'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
			const request = new Request('https://example.com', {
				headers: { 'user-agent': userAgent, accept: '*/*' },
			});
			const result = detectBot(userAgent, request);
			expect(result.isBot).toBe(true);
			expect(result.botName).toBe('Googlebot');
		});

		it('should return isBot:true for a missing user agent', () => {
			const request = new Request('https://example.com', {
				headers: { accept: '*/*' },
			});
			const result = detectBot('', request);
			expect(result.isBot).toBe(true);
			expect(result.reason).toBe('missing_user_agent');
		});

		it('should return isBot:true for a missing accept header', () => {
			const userAgent = 'Test UA';
			const request = new Request('https://example.com', {
				headers: { 'user-agent': userAgent },
			});
			const result = detectBot(userAgent, request);
			expect(result.isBot).toBe(true);
			expect(result.reason).toBe('missing_accept_header');
		});

		it('should return isBot:true for a very short user agent', () => {
			const userAgent = 'short';
			const request = new Request('https://example.com', {
				headers: { 'user-agent': userAgent, accept: '*/*' },
			});
			const result = detectBot(userAgent, request);
			expect(result.isBot).toBe(true);
			expect(result.reason).toBe('user_agent_too_short');
		});

		it('should return isBot:false for a legitimate user agent', () => {
			const userAgent =
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';
			const request = new Request('https://example.com', {
				headers: { 'user-agent': userAgent, accept: '*/*' },
			});
			const result = detectBot(userAgent, request);
			expect(result.isBot).toBe(false);
		});
	});

	describe('parseUserAgent', () => {
		it('should correctly parse a common user agent string', () => {
			const userAgent =
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';
			const result = parseUserAgent(userAgent);
			expect(result.browserName).toBe('Chrome');
			expect(result.osName).toBe('Windows');
		});

		it('should return undefined for an empty user agent', () => {
			const result = parseUserAgent('');
			expect(result.browserName).toBeUndefined();
		});
	});
});
