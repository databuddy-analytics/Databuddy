import { randomUUID } from 'node:crypto';
import { auth } from '@databuddy/auth';
import { account, and, db, eq } from '@databuddy/db';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

interface VercelTokenResponse {
	access_token: string;
	token_type: string;
	installation_id: string;
}

interface VercelUserInfo {
	id: string;
	email: string;
	name?: string;
	avatar?: string;
}

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const code = searchParams.get('code');
		const configurationId = searchParams.get('configurationId');
		const teamId = searchParams.get('teamId');
		const next = searchParams.get('next');

		if (!code) {
			return NextResponse.redirect(
				`${process.env.BETTER_AUTH_URL}/auth/error?error=missing_code`
			);
		}

		// Check if user is authenticated
		const session = await auth.api.getSession({ headers: await headers() });

		// If no session, redirect to auth pages with the callback URL
		if (!session?.user) {
			const callbackUrl = new URL(request.url);
			const completeIntegrationUrl = `${process.env.BETTER_AUTH_URL}${callbackUrl.pathname}${callbackUrl.search}`;

			return NextResponse.redirect(
				`${process.env.BETTER_AUTH_URL}/register?callback=${encodeURIComponent(completeIntegrationUrl)}`
			);
		}

		const redirectUri = `${process.env.BETTER_AUTH_URL}/api/integrations/vercel/callback`;

		const tokenResponse = await fetch(
			'https://api.vercel.com/v2/oauth/access_token',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					code,
					client_id: process.env.VERCEL_CLIENT_ID as string,
					client_secret: process.env.VERCEL_CLIENT_SECRET as string,
					redirect_uri: redirectUri,
				}),
			}
		);

		if (!tokenResponse.ok) {
			return NextResponse.redirect(
				`${process.env.BETTER_AUTH_URL}/auth/error?error=token_exchange_failed`
			);
		}

		const tokens: VercelTokenResponse = await tokenResponse.json();

		const userResponse = await fetch('https://api.vercel.com/v2/user', {
			headers: {
				Authorization: `Bearer ${tokens.access_token}`,
			},
		});

		if (!userResponse.ok) {
			return NextResponse.redirect(
				`${process.env.BETTER_AUTH_URL}/auth/error?error=user_fetch_failed`
			);
		}

		const userResponse_json = await userResponse.json();
		const userInfo: VercelUserInfo = userResponse_json.user;

		if (!(userInfo.email && userInfo.id)) {
			return NextResponse.redirect(
				`${process.env.BETTER_AUTH_URL}/auth/error?error=invalid_user_info`
			);
		}

		const userId = session.user.id;

		const existingAccount = await db.query.account.findFirst({
			where: and(eq(account.userId, userId), eq(account.providerId, 'vercel')),
		});

		const now = new Date().toISOString();
		const scopeData = JSON.stringify({
			configurationId,
			teamId,
			installationId: tokens.installation_id,
			tokenType: tokens.token_type,
		});

		if (existingAccount) {
			await db
				.update(account)
				.set({
					accessToken: tokens.access_token,
					scope: scopeData,
					updatedAt: now,
				})
				.where(eq(account.id, existingAccount.id));
		} else {
			await db.insert(account).values({
				id: randomUUID(),
				accountId: userInfo.id,
				providerId: 'vercel',
				userId,
				accessToken: tokens.access_token,
				scope: scopeData,
				createdAt: now,
				updatedAt: now,
			});
		}

		const redirectUrl =
			next || `${process.env.BETTER_AUTH_URL}/dashboard?vercel_integrated=true`;

		return NextResponse.redirect(redirectUrl);
	} catch (error) {
		console.error('Vercel OAuth callback error:', error);
		return NextResponse.redirect(
			`${process.env.BETTER_AUTH_URL}/auth/error?error=internal_error`
		);
	}
}
