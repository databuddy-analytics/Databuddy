import { checkBotId } from 'botid/server';
import { type NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/discord-webhook';
import { formRateLimit } from '@/lib/rate-limit';

// Type for ambassador form data
interface AmbassadorFormData {
	name: string;
	email: string;
	xHandle?: string;
	website?: string;
	whyAmbassador: string;
	experience?: string;
	audience?: string;
	referralSource?: string;
}

function getClientIP(request: NextRequest): string {
	const forwarded = request.headers.get('x-forwarded-for');
	const realIP = request.headers.get('x-real-ip');
	const cfConnectingIP = request.headers.get('cf-connecting-ip');

	if (forwarded) {
		return forwarded.split(',')[0].trim();
	}
	if (realIP) {
		return realIP;
	}
	if (cfConnectingIP) {
		return cfConnectingIP;
	}

	return 'unknown';
}

function validateFormData(data: unknown): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (!data || typeof data !== 'object') {
		return { valid: false, errors: ['Invalid form data'] };
	}

	const formData = data as Record<string, unknown>;

	// Required fields
	if (
		!formData.name ||
		typeof formData.name !== 'string' ||
		formData.name.trim().length < 2
	) {
		errors.push('Name is required and must be at least 2 characters');
	}

	if (
		!formData.email ||
		typeof formData.email !== 'string' ||
		!formData.email.includes('@')
	) {
		errors.push('Valid email is required');
	}

	if (
		!formData.whyAmbassador ||
		typeof formData.whyAmbassador !== 'string' ||
		formData.whyAmbassador.trim().length < 10
	) {
		errors.push(
			'Please explain why you want to be an ambassador (minimum 10 characters)'
		);
	}

	// Optional fields validation
	if (
		formData.xHandle &&
		typeof formData.xHandle === 'string' &&
		formData.xHandle.length > 0 &&
		(formData.xHandle.includes('@') || formData.xHandle.includes('http'))
	) {
		errors.push('X handle should not include @ or URLs');
	}

	if (
		formData.website &&
		typeof formData.website === 'string' &&
		formData.website.length > 0
	) {
		try {
			new URL(formData.website);
		} catch {
			errors.push('Website must be a valid URL');
		}
	}

	return { valid: errors.length === 0, errors };
}

export async function POST(request: NextRequest) {
	try {
		// Bot protection - DISABLED
		// const verification = await checkBotId();

		// if (verification.isBot) {
		// 	await logger.warning(
		// 		'Ambassador Form Bot Attempt',
		// 		'Bot detected trying to submit ambassador form',
		// 		{
		// 			botScore: verification.isBot,
		// 			userAgent: request.headers.get('user-agent'),
		// 		}
		// 	);
		// 	return NextResponse.json({ error: 'Access denied' }, { status: 403 });
		// }

		// Rate limiting
		const clientIP = getClientIP(request);
		const rateLimitResult = formRateLimit.check(clientIP);

		if (!rateLimitResult.allowed) {
			await logger.warning(
				'Ambassador Form Rate Limited',
				`IP ${clientIP} exceeded rate limit for ambassador form submissions`,
				{ ip: clientIP, resetTime: rateLimitResult.resetTime }
			);

			return NextResponse.json(
				{
					error: 'Too many submissions. Please try again later.',
					resetTime: rateLimitResult.resetTime,
				},
				{ status: 429 }
			);
		}

		// Parse and validate form data
		const formData = await request.json();
		const validation = validateFormData(formData);

		if (!validation.valid) {
			await logger.warning(
				'Ambassador Form Validation Failed',
				'Form submission failed validation',
				{ errors: validation.errors, ip: clientIP }
			);

			return NextResponse.json(
				{ error: 'Validation failed', details: validation.errors },
				{ status: 400 }
			);
		}

		const ambassadorData = formData as AmbassadorFormData;

		// Log successful submission
		await logger.success(
			'New Ambassador Application',
			`${ambassadorData.name} (${ambassadorData.email}) submitted an ambassador application`,
			{
				name: ambassadorData.name,
				email: ambassadorData.email,
				xHandle: ambassadorData.xHandle || 'Not provided',
				website: ambassadorData.website || 'Not provided',
				whyAmbassador: ambassadorData.whyAmbassador,
				experience: ambassadorData.experience || 'Not provided',
				audience: ambassadorData.audience || 'Not provided',
				referralSource: ambassadorData.referralSource || 'Not provided',
				ip: clientIP,
				userAgent: request.headers.get('user-agent'),
				timestamp: new Date().toISOString(),
			}
		);

		return NextResponse.json({
			success: true,
			message: 'Ambassador application submitted successfully',
		});
	} catch (error) {
		await logger.exception(
			error instanceof Error
				? error
				: new Error('Unknown error in ambassador form submission'),
			{
				ip: getClientIP(request),
				userAgent: request.headers.get('user-agent'),
			}
		);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

export function GET() {
	return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
