'use client';

import { signIn } from '@databuddy/auth/client';
import { ChevronLeft, Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export default function MagicSentPage() {
	const searchParams = useSearchParams();
	const email = searchParams.get('email') || '';
	const [isLoading, setIsLoading] = useState(false);

	const handleResend = async (e: React.MouseEvent) => {
		e.preventDefault();
		if (!email) {
			toast.error('No email found');
			return;
		}
		setIsLoading(true);

		await signIn.magicLink({
			email,
			callbackURL: '/home',
			fetchOptions: {
				onSuccess: () => {
					setIsLoading(false);
					toast.success('Magic link sent! Please check your email.');
				},
				onError: () => {
					setIsLoading(false);
					toast.error('Failed to send magic link. Please try again.');
				},
			},
		});

		setIsLoading(false);
	};

	return (
		<div className="relative mx-auto mt-12 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card p-6 shadow">
			<div className="mb-8 text-center">
				<div className="relative mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 p-3">
					<div className="absolute inset-0 animate-pulse rounded-full bg-blue-50" />
					<div className="-inset-1 absolute rounded-full bg-gradient-to-tr from-blue-200 to-blue-100 opacity-70 blur-md" />
					<div className="relative rounded-full bg-gradient-to-tr from-blue-500 to-blue-400 p-2.5">
						<MailCheck className="h-8 w-8 text-white" />
					</div>
				</div>
				<h1 className="font-bold text-2xl text-foreground">Check your email</h1>
				<p className="mt-2 text-muted-foreground">
					Magic link sent to{' '}
					<strong className="font-medium text-blue-600">{email}</strong>
				</p>
			</div>
			<div className="space-y-5 py-4">
				<div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800">
					<p className="text-sm">
						We've sent a magic link to <strong>{email}</strong>. Please check
						your inbox and click the link to sign in instantly.
					</p>
				</div>
				<Button
					className="w-full bg-blue-500 text-white hover:bg-blue-600"
					disabled={isLoading}
					onClick={handleResend}
					type="button"
				>
					{isLoading ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Sending...
						</>
					) : (
						'Resend magic link'
					)}
				</Button>
				<Link href="/login">
					<Button
						className="w-full border-blue-200 hover:bg-blue-50"
						type="button"
						variant="outline"
					>
						<ChevronLeft className="mr-2 h-4 w-4" />
						Back to login
					</Button>
				</Link>
			</div>
		</div>
	);
}
