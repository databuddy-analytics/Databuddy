'use client';

import { authClient } from '@databuddy/auth/client';
import { AlertCircle, ChevronLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export default function VerificationNeededPage() {
	const searchParams = useSearchParams();
	const email = searchParams.get('email') || '';
	const [isLoading, setIsLoading] = useState(false);

	const sendVerificationEmail = async () => {
		setIsLoading(true);

		await authClient.sendVerificationEmail({
			email,
			callbackURL: '/home',
			fetchOptions: {
				onSuccess: () => {
					toast.success('Verification email sent!');
					setIsLoading(false);
				},
				onError: () => {
					setIsLoading(false);
					toast.error(
						'Failed to send verification email. Please try again later.'
					);
				},
			},
		});

		setIsLoading(false);
	};

	return (
		<div className="relative mx-auto mt-12 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card p-6 shadow">
			<div className="mb-8 text-center">
				<div className="relative mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-warning/10 p-3">
					<div className="absolute inset-0 animate-pulse rounded-full bg-warning/5" />
					<div className="-inset-1 absolute rounded-full bg-gradient-to-tr from-warning/20 to-warning/10 opacity-70 blur-md" />
					<div className="relative rounded-full bg-gradient-to-tr from-warning to-warning/80 p-2.5">
						<AlertCircle className="h-8 w-8 text-warning-foreground" />
					</div>
				</div>
				<h1 className="font-bold text-2xl text-foreground">
					Verify your email
				</h1>
				<p className="mt-2 text-muted-foreground">
					Verification needed for{' '}
					<strong className="font-medium text-warning">{email}</strong>
				</p>
			</div>
			<div className="space-y-5 py-4">
				<div className="rounded-lg border border-warning/20 bg-warning/5 p-4 text-warning-foreground">
					<p className="text-sm">
						Your email <strong>{email}</strong> needs to be verified before you
						can sign in. Please check your inbox for the verification link.
					</p>
				</div>
				<Button
					className="w-full bg-warning text-warning-foreground hover:bg-warning/90"
					disabled={isLoading}
					onClick={sendVerificationEmail}
				>
					{isLoading ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Sending...
						</>
					) : (
						'Resend verification email'
					)}
				</Button>
				<Link href="/login">
					<Button
						className="w-full border-warning/20 text-warning hover:bg-warning/5"
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
