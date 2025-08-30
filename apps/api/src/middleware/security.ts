import { Elysia } from 'elysia';

/**
 * Comprehensive security middleware to protect against various injection attacks
 */

// Common injection patterns to detect and block
const INJECTION_PATTERNS = [
	// SQL Injection patterns
	/['"];?\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|EXEC|EXECUTE|TRUNCATE)\b/i,
	/UNION\s+(ALL\s+)?SELECT/i,
	/;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)/i,
	
	// XSS patterns
	/<script[\s\S]*?>/i,
	/javascript:/i,
	/vbscript:/i,
	/onload\s*=/i,
	/onerror\s*=/i,
	/onclick\s*=/i,
	/onmouse\w*\s*=/i,
	/eval\s*\(/i,
	/expression\s*\(/i,
	
	// Command injection patterns (operators and subshells, not generic parentheses)
	/(?:\|\||&&|;)/,
	/`[^`]*`/,                 // backtick subshell
	/\$\([^)]+\)/,             // $() subshell
	/\$\{[^}]+\}/,             // ${} expansions
	/\.\./,  // Path traversal
	/\/etc\/passwd/i,
	/\/proc\//i,
	
	// NoSQL injection patterns
	/\$\w+:/,
	/{\s*\$\w+/,
] as const;

// Rate limiting configuration
const RATE_LIMITS = {
	general: { max: 1000, window: 60 * 1000 }, // 1000 requests per minute
	query: { max: 100, window: 60 * 1000 },    // 100 queries per minute
	assistant: { max: 50, window: 60 * 1000 }, // 50 AI requests per minute
} as const;

// In-memory rate limiting (should use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function isInjectionAttempt(input: string): boolean {
	return INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

function checkRateLimit(key: string, limit: { max: number; window: number }): boolean {
	const now = Date.now();
	const entry = rateLimitStore.get(key);
	
	if (!entry || now > entry.resetTime) {
		rateLimitStore.set(key, { count: 1, resetTime: now + limit.window });
		return true;
	}
	
	if (entry.count >= limit.max) {
		return false;
	}
	
	entry.count++;
	return true;
}

function sanitizeRequestData(data: unknown): unknown {
	if (typeof data === 'string') {
		if (isInjectionAttempt(data)) {
			throw new Error('Potential injection attack detected');
		}
		return data;
	}
	
	if (Array.isArray(data)) {
		return data.map(sanitizeRequestData);
	}
	
	if (data && typeof data === 'object') {
		const sanitized: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(data)) {
			if (isInjectionAttempt(key)) {
				throw new Error('Potential injection attack detected in key');
			}
			sanitized[key] = sanitizeRequestData(value);
		}
		return sanitized;
	}
	
	return data;
}

export function securityMiddleware() {
	return new Elysia()
		.onBeforeHandle(async ({ request, set }) => {
			const url = new URL(request.url);
			const ip = request.headers.get('x-forwarded-for') || 
			         request.headers.get('x-real-ip') || 
			         'unknown';
			
			// Basic rate limiting
			const rateLimitKey = `${ip}:${url.pathname}`;
			let limit = RATE_LIMITS.general;
			
			// Apply specific limits for different endpoints
			if (url.pathname.includes('/query')) {
				limit = RATE_LIMITS.query;
			} else if (url.pathname.includes('/assistant')) {
				limit = RATE_LIMITS.assistant;
			}
			
			if (!checkRateLimit(rateLimitKey, limit)) {
				set.status = 429;
				return {
					success: false,
					error: 'Rate limit exceeded',
					code: 'RATE_LIMIT_EXCEEDED'
				};
			}
			
			// Check for suspicious headers
			const userAgent = request.headers.get('user-agent') || '';
			const referer = request.headers.get('referer') || '';
			
			// Only flag headers containing high-signal XSS markers or stacked SQL queries
			const headerSuspicious = [
			  /javascript:/i,
			  /<script/i,
			  /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)\b/i
			];
			if (
			  headerSuspicious.some((p) => p.test(userAgent)) ||
			  headerSuspicious.some((p) => p.test(referer))
			) {
				set.status = 400;
				return {
					success: false,
					error: 'Malicious request detected',
					code: 'SECURITY_VIOLATION'
				};
			}
			
			// Check URL parameters for injection attempts
			for (const [key, value] of url.searchParams.entries()) {
				if (isInjectionAttempt(key) || isInjectionAttempt(value)) {
					set.status = 400;
					return {
						success: false,
						error: 'Malicious query parameters detected',
						code: 'SECURITY_VIOLATION'
					};
				}
			}
		})
		.onTransform(({ body }) => {
			// Sanitize request body
			if (body) {
				try {
					const sanitizedBody = sanitizeRequestData(body);
					return { body: sanitizedBody };
				} catch (error) {
					throw new Error('Security validation failed: ' + (error as Error).message);
				}
			}
		})
		.onError(({ code, error, set }) => {
			// Handle security-related errors
			if (error.message.includes('injection') || 
			    error.message.includes('Security validation')) {
				set.status = 400;
				return {
					success: false,
					error: 'Request blocked for security reasons',
					code: 'SECURITY_VIOLATION'
				};
			}
		});
}

// Content Security Policy headers
export function cspHeaders() {
	return new Elysia()
		.onAfterHandle(({ set }) => {
			set.headers = {
				...set.headers,
				'Content-Security-Policy': [
					"default-src 'self'",
					"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
					"style-src 'self' 'unsafe-inline'",
					"img-src 'self' data: https:",
					"font-src 'self' data:",
					"connect-src 'self'",
					"frame-src 'none'",
					"object-src 'none'",
					"media-src 'self'",
					"worker-src 'self'",
					"child-src 'none'",
					"form-action 'self'",
					"frame-ancestors 'none'",
					"base-uri 'self'",
					"upgrade-insecure-requests"
				].join('; '),
				'X-Content-Type-Options': 'nosniff',
				'X-Frame-Options': 'DENY',
				'X-XSS-Protection': '1; mode=block',
				'Referrer-Policy': 'strict-origin-when-cross-origin',
				'Permissions-Policy': [
					'accelerometer=()',
					'camera=()',
					'geolocation=()',
					'gyroscope=()',
					'magnetometer=()',
					'microphone=()',
					'payment=()',
					'usb=()'
				].join(', ')
			};
		});
}