import { describe, expect, it } from 'bun:test';
import {
	analyticsEventSchema,
	errorEventSchema,
	webVitalsEventSchema,
	customEventSchema,
	outgoingLinkSchema,
} from './event-schema';

describe('Event Schema Validation', () => {
	describe('analyticsEventSchema', () => {
		it('should validate a basic track event from databuddy.js', () => {
			const trackEvent = {
				type: 'track',
				payload: {
					eventId: '12345678-1234-1234-1234-123456789012',
					name: 'page_view',
					anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
					sessionId: 'sess_12345678-1234-1234-1234-123456789012',
					timestamp: Date.now(),
					sessionStartTime: Date.now() - 30000,
					path: 'https://example.com/page',
					title: 'Example Page',
					screen_resolution: '1920x1080',
					viewport_size: '1920x1080',
					language: 'en-US',
					timezone: 'America/New_York',
					connection_type: 'wifi',
					rtt: 50,
					downlink: 10,
					time_on_page: 30,
					scroll_depth: 75,
					interaction_count: 5,
					page_count: 1,
					utm_source: 'google',
					utm_medium: 'cpc',
					utm_campaign: 'summer_sale',
					load_time: 1200,
					dom_ready_time: 800,
					dom_interactive: 600,
					ttfb: 200,
					render_time: 400,
					properties: {
						category: 'electronics',
						value: 299.99,
					},
				},
			};

			const result = analyticsEventSchema.safeParse(trackEvent.payload);
			expect(result.success).toBe(true);
		});

		it('should validate screen_view event with minimal data', () => {
			const screenViewEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: 'screen_view',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				sessionId: 'sess_12345678-1234-1234-1234-123456789012',
				timestamp: Date.now(),
				sessionStartTime: Date.now(),
				path: 'https://example.com',
				page_count: 1,
			};

			const result = analyticsEventSchema.safeParse(screenViewEvent);
			expect(result.success).toBe(true);
		});

		it('should validate custom track event with properties', () => {
			const customTrackEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: 'button_click',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				sessionId: 'sess_12345678-1234-1234-1234-123456789012',
				timestamp: Date.now(),
				sessionStartTime: Date.now(),
				path: 'https://example.com/page',
				properties: {
					button_id: 'cta-button',
					button_text: 'Sign Up',
					section: 'hero',
				},
			};

			const result = analyticsEventSchema.safeParse(customTrackEvent);
			expect(result.success).toBe(true);
		});

		it('should reject invalid event names', () => {
			const invalidEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: '', // Empty name
				path: 'https://example.com',
			};

			const result = analyticsEventSchema.safeParse(invalidEvent);
			expect(result.success).toBe(false);
		});

		it('should reject invalid screen resolutions', () => {
			const invalidEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: 'page_view',
				path: 'https://example.com',
				screen_resolution: '1920x', // Invalid format
			};

			const result = analyticsEventSchema.safeParse(invalidEvent);
			expect(result.success).toBe(false);
		});

		it('should reject invalid URLs', () => {
			const invalidEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: 'page_view',
				path: 'not-a-url',
			};

			const result = analyticsEventSchema.safeParse(invalidEvent);
			expect(result.success).toBe(false);
		});


		it('should reject invalid scroll depth', () => {
			const invalidEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: 'page_view',
				path: 'https://example.com',
				scroll_depth: 150, // Over 100%
			};

			const result = analyticsEventSchema.safeParse(invalidEvent);
			expect(result.success).toBe(false);
		});

		it('should reject invalid connection types', () => {
			const invalidEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: 'page_view',
				path: 'https://example.com',
				connection_type: 'invalid_connection',
			};

			const result = analyticsEventSchema.safeParse(invalidEvent);
			expect(result.success).toBe(false);
		});

		it('should validate localhost URLs', () => {
			const localhostEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: 'page_view',
				path: 'http://localhost:3000/page',
			};

			const result = analyticsEventSchema.safeParse(localhostEvent);
			expect(result.success).toBe(true);
		});

		it('should validate direct referrer', () => {
			const directReferrerEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: 'page_view',
				path: 'https://example.com',
				referrer: 'direct',
			};

			const result = analyticsEventSchema.safeParse(directReferrerEvent);
			expect(result.success).toBe(true);
		});
	});

	describe('errorEventSchema', () => {
		it('should validate a basic error event from databuddy.js', () => {
			const errorEvent = {
				type: 'error',
				payload: {
					eventId: '12345678-1234-1234-1234-123456789012',
					anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
					sessionId: 'sess_12345678-1234-1234-1234-123456789012',
					timestamp: Date.now(),
					path: 'https://example.com/page',
					message: 'TypeError: Cannot read property "foo" of undefined',
					filename: 'https://example.com/js/app.js',
					lineno: 42,
					colno: 15,
					stack: 'TypeError: Cannot read property "foo" of undefined\n    at Object.function (app.js:42:15)\n    at HTMLButtonElement.onclick (page.html:123:45)',
					errorType: 'TypeError',
				},
			};

			const result = errorEventSchema.safeParse(errorEvent);
			expect(result.success).toBe(true);
		});

		it('should validate error event with minimal data', () => {
			const minimalErrorEvent = {
				type: 'error',
				payload: {
					anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
					sessionId: 'sess_12345678-1234-1234-1234-123456789012',
					timestamp: Date.now(),
					path: 'https://example.com/page',
					message: 'Something went wrong',
				},
			};

			const result = errorEventSchema.safeParse(minimalErrorEvent);
			expect(result.success).toBe(true);
		});

		it('should validate unhandled promise rejection', () => {
			const promiseRejectionEvent = {
				type: 'error',
				payload: {
					eventId: '12345678-1234-1234-1234-123456789012',
					anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
					sessionId: 'sess_12345678-1234-1234-1234-123456789012',
					timestamp: Date.now(),
					path: 'https://example.com/page',
					message: 'Failed to fetch user data',
					errorType: 'UnhandledRejection',
				},
			};

			const result = errorEventSchema.safeParse(promiseRejectionEvent);
			expect(result.success).toBe(true);
		});

		it('should reject error event without required fields', () => {
			const invalidErrorEvent = {
				type: 'error',
				payload: {
					// Missing required fields: path, message
					anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				},
			};

			const result = errorEventSchema.safeParse(invalidErrorEvent);
			expect(result.success).toBe(false);
		});


		it('should reject error event with invalid column numbers', () => {
			const invalidErrorEvent = {
				type: 'error',
				payload: {
					anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
					sessionId: 'sess_12345678-1234-1234-1234-123456789012',
					timestamp: Date.now(),
					path: 'https://example.com/page',
					message: 'Error message',
					colno: 1000000, // Too large
				},
			};

			const result = errorEventSchema.safeParse(invalidErrorEvent);
			expect(result.success).toBe(false);
		});
	});

	describe('webVitalsEventSchema', () => {
		it('should validate a basic web vitals event from databuddy.js', () => {
			const webVitalsEvent = {
				type: 'web_vitals',
				payload: {
					eventId: '12345678-1234-1234-1234-123456789012',
					anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
					sessionId: 'sess_12345678-1234-1234-1234-123456789012',
					timestamp: Date.now(),
					path: 'https://example.com/page',
					fcp: 1200, // First Contentful Paint
					lcp: 2500, // Largest Contentful Paint
					cls: 0.1, // Cumulative Layout Shift
					fid: 50, // First Input Delay
					inp: 200, // Interaction to Next Paint
				},
			};

			const result = webVitalsEventSchema.safeParse(webVitalsEvent);
			expect(result.success).toBe(true);
		});

		it('should validate web vitals event with partial data', () => {
			const partialWebVitalsEvent = {
				type: 'web_vitals',
				payload: {
					eventId: '12345678-1234-1234-1234-123456789012',
					anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
					sessionId: 'sess_12345678-1234-1234-1234-123456789012',
					timestamp: Date.now(),
					path: 'https://example.com/page',
					fcp: 1200,
					lcp: 2500,
					// cls, fid, inp are optional
				},
			};

			const result = webVitalsEventSchema.safeParse(partialWebVitalsEvent);
			expect(result.success).toBe(true);
		});

		it('should validate web vitals event with null values', () => {
			const nullWebVitalsEvent = {
				type: 'web_vitals',
				payload: {
					eventId: '12345678-1234-1234-1234-123456789012',
					anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
					sessionId: 'sess_12345678-1234-1234-1234-123456789012',
					timestamp: Date.now(),
					path: 'https://example.com/page',
					fcp: null,
					lcp: null,
					cls: null,
					fid: null,
					inp: null,
				},
			};

			const result = webVitalsEventSchema.safeParse(nullWebVitalsEvent);
			expect(result.success).toBe(true);
		});

	});

	describe('customEventSchema', () => {
		it('should validate a basic custom event from databuddy.js', () => {
			const customEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: 'button_click',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				sessionId: 'sess_12345678-1234-1234-1234-123456789012',
				timestamp: Date.now(),
				properties: {
					button_id: 'cta-button',
					button_text: 'Sign Up',
					section: 'hero',
					value: 299.99,
				},
			};

			const result = customEventSchema.safeParse(customEvent);
			expect(result.success).toBe(true);
		});

		it('should validate custom event with minimal data', () => {
			const minimalCustomEvent = {
				name: 'custom_event',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
			};

			const result = customEventSchema.safeParse(minimalCustomEvent);
			expect(result.success).toBe(true);
		});

		it('should validate custom event with JSON properties', () => {
			const customEventWithJson = {
				name: 'form_submit',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				sessionId: 'sess_12345678-1234-1234-1234-123456789012',
				timestamp: Date.now(),
				properties: JSON.stringify({
					form_id: 'contact-form',
					fields: ['name', 'email', 'message'],
					validation_errors: [],
				}),
			};

			const result = customEventSchema.safeParse(customEventWithJson);
			expect(result.success).toBe(true);
		});

		it('should reject custom event without name', () => {
			const invalidCustomEvent = {
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				// Missing required name field
			};

			const result = customEventSchema.safeParse(invalidCustomEvent);
			expect(result.success).toBe(false);
		});

		it('should reject custom event with empty name', () => {
			const invalidCustomEvent = {
				name: '', // Empty name
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
			};

			const result = customEventSchema.safeParse(invalidCustomEvent);
			expect(result.success).toBe(false);
		});

	});

	describe('outgoingLinkSchema', () => {
		it('should validate a basic outgoing link event from databuddy.js', () => {
			const outgoingLinkEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				sessionId: 'sess_12345678-1234-1234-1234-123456789012',
				timestamp: Date.now(),
				href: 'https://external-site.com/page',
				text: 'Visit External Site',
				properties: {
					link_type: 'external',
					section: 'footer',
				},
			};

			const result = outgoingLinkSchema.safeParse(outgoingLinkEvent);
			expect(result.success).toBe(true);
		});

		it('should validate outgoing link event with minimal data', () => {
			const minimalOutgoingLinkEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				href: 'https://external-site.com',
			};

			const result = outgoingLinkSchema.safeParse(minimalOutgoingLinkEvent);
			expect(result.success).toBe(true);
		});

		it('should validate outgoing link event without text', () => {
			const outgoingLinkEventWithoutText = {
				eventId: '12345678-1234-1234-1234-123456789012',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				sessionId: 'sess_12345678-1234-1234-1234-123456789012',
				timestamp: Date.now(),
				href: 'https://external-site.com/page',
				// text is optional
			};

			const result = outgoingLinkSchema.safeParse(outgoingLinkEventWithoutText);
			expect(result.success).toBe(true);
		});

		it('should reject outgoing link event without href', () => {
			const invalidOutgoingLinkEvent = {
				eventId: '12345678-1234-1234-1234-123456789012',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				// Missing required href field
			};

			const result = outgoingLinkSchema.safeParse(invalidOutgoingLinkEvent);
			expect(result.success).toBe(false);
		});


	});

	describe('Real-world databuddy.js payloads', () => {
		it('should validate actual track payload from databuddy.js', () => {
			// This matches the exact structure from databuddy.js track() method
			const realTrackPayload = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: 'screen_view',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				sessionId: 'sess_12345678-1234-1234-1234-123456789012',
				sessionStartTime: 1703123456789,
				timestamp: 1703123486789,
				path: 'https://example.com/dashboard',
				title: 'Dashboard - Example App',
				screen_resolution: '1920x1080',
				viewport_size: '1920x1080',
				language: 'en-US',
				timezone: 'America/New_York',
				connection_type: 'wifi',
				rtt: 50,
				downlink: 10,
				utm_source: 'google',
				utm_medium: 'cpc',
				utm_campaign: 'summer_sale',
				page_count: 3,
			};

			const result = analyticsEventSchema.safeParse(realTrackPayload);
			expect(result.success).toBe(true);
		});

		it('should validate actual error payload from databuddy.js', () => {
			// This matches the exact structure from databuddy.js trackError() method
			const realErrorPayload = {
				eventId: '12345678-1234-1234-1234-123456789012',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				sessionId: 'sess_12345678-1234-1234-1234-123456789012',
				timestamp: 1703123486789,
				path: 'https://example.com/dashboard',
				message: 'TypeError: Cannot read property "user" of undefined',
				filename: 'https://example.com/js/app.js',
				lineno: 42,
				colno: 15,
				stack: 'TypeError: Cannot read property "user" of undefined\n    at Dashboard.render (app.js:42:15)\n    at ReactDOM.render (react-dom.js:123:45)',
				errorType: 'TypeError',
			};

			const errorEvent = {
				type: 'error',
				payload: realErrorPayload,
			};

			const result = errorEventSchema.safeParse(errorEvent);
			expect(result.success).toBe(true);
		});

		it('should validate actual web vitals payload from databuddy.js', () => {
			// This matches the exact structure from databuddy.js trackWebVitals() method
			const realWebVitalsPayload = {
				eventId: '12345678-1234-1234-1234-123456789012',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				sessionId: 'sess_12345678-1234-1234-1234-123456789012',
				timestamp: 1703123486789,
				path: 'https://example.com/dashboard',
				fcp: 1200,
				lcp: 2500,
				cls: 0.1,
				fid: 50,
				inp: 200,
			};

			const webVitalsEvent = {
				type: 'web_vitals',
				payload: realWebVitalsPayload,
			};

			const result = webVitalsEventSchema.safeParse(webVitalsEvent);
			expect(result.success).toBe(true);
		});

		it('should validate actual custom event payload from databuddy.js', () => {
			// This matches the exact structure from databuddy.js trackCustomEvent() method
			const realCustomEventPayload = {
				eventId: '12345678-1234-1234-1234-123456789012',
				name: 'form_submit',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				sessionId: 'sess_12345678-1234-1234-1234-123456789012',
				timestamp: 1703123486789,
				properties: {
					form_id: 'contact-form',
					form_type: 'contact',
					fields_count: 5,
					validation_errors: [],
				},
			};

			const result = customEventSchema.safeParse(realCustomEventPayload);
			expect(result.success).toBe(true);
		});

		it('should validate actual outgoing link payload from databuddy.js', () => {
			// This matches the exact structure from databuddy.js trackOutgoingLinks() method
			const realOutgoingLinkPayload = {
				eventId: '12345678-1234-1234-1234-123456789012',
				anonymousId: 'anon_12345678-1234-1234-1234-123456789012',
				sessionId: 'sess_12345678-1234-1234-1234-123456789012',
				timestamp: 1703123486789,
				href: 'https://github.com/example/repo',
				text: 'View on GitHub',
				properties: {},
			};

			const result = outgoingLinkSchema.safeParse(realOutgoingLinkPayload);
			expect(result.success).toBe(true);
		});
	});
});
