import { auth } from '@databuddy/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function VercelCallbackLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({ headers: await headers() });

	// If user is not logged in, redirect to login with callback URL
	if (!session) {
		const currentUrl = new URL(
			'/integrations/vercel/callback',
			'https://app.databuddy.cc'
		);
		// Preserve all query parameters from the original callback
		const searchParams = new URLSearchParams();

		// Get the current request URL to preserve query params
		const headersList = await headers();
		const fullUrl =
			headersList.get('x-url') || headersList.get('referer') || '';

		if (fullUrl) {
			try {
				const url = new URL(fullUrl);
				url.searchParams.forEach((value, key) => {
					searchParams.set(key, value);
				});
			} catch (e) {
				// Fallback if URL parsing fails
			}
		}

		const callbackUrl = `/integrations/vercel/callback?${searchParams.toString()}`;
		const loginUrl = `/login?callback=${encodeURIComponent(callbackUrl)}`;

		redirect(loginUrl);
	}

	return <>{children}</>;
}
