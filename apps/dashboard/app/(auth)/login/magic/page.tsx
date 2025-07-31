'use client';

import { signIn } from '@databuddy/auth/client';
import { ChevronLeft, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function MagicLinkPage() {
	const router = useRouter();
	const [email, setEmail] = useState('');
	const [isLoading, setIsLoading] = useState(false);

	const handleMagicLinkLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email) {
			toast.error('Please enter your email address');
			return;
		}
		setIsLoading(true);
		try {
			await signIn.magicLink({
				email,
				callbackURL: '/home',
				fetchOptions: {
					onSuccess: () => {
						setIsLoading(false);
						toast.success('Magic link sent! Please check your email.');
						router.push(`/login/magic-sent?email=${encodeURIComponent(email)}`);
					},
					onError: () => {
						setIsLoading(false);
						toast.error('Failed to send magic link. Please try again.');
					},
				},
			});
		} catch (_error) {
			setIsLoading(false);
			toast.error('Failed to send magic link. Please try again.');
		}
	};

	return (
		<div className="relative mx-auto mt-12 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card p-6 shadow">
			<div className="mb-8 text-center">
				<div className="relative mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 p-3">
					<div className="absolute inset-0 animate-pulse rounded-full bg-blue-50" />
					<div className="-inset-1 absolute rounded-full bg-gradient-to-tr from-blue-200 to-blue-100 opacity-70 blur-md" />
					<div className="relative rounded-full bg-gradient-to-tr from-blue-500 to-blue-400 p-2.5">
						<Sparkles className="h-8 w-8 text-white" />
					</div>
				</div>
				<h1 className="font-bold text-2xl text-foreground">
					Sign in with magic link
				</h1>
				<p className="mt-2 text-muted-foreground">
					No password needed — just use your email
				</p>
			</div>
			<form className="space-y-4" onSubmit={handleMagicLinkLogin}>
				<div className="space-y-2">
					<Label className="font-medium text-foreground" htmlFor="magic-email">
						Email address
					</Label>
					<Input
						autoComplete="email"
						className="h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						id="magic-email"
						name="email"
						onChange={(e) => setEmail(e.target.value)}
						placeholder="name@example.com"
						required
						type="email"
						value={email}
					/>
				</div>
				<div className="flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-blue-800 text-sm">
					<Sparkles className="h-5 w-5 flex-shrink-0 text-blue-500" />
					<p>
						We'll send a secure link to your email that will sign you in
						instantly — no password needed.
					</p>
				</div>
				<Button
					className="h-11 w-full bg-blue-500 text-white hover:bg-blue-600"
					disabled={isLoading}
					type="submit"
				>
					{isLoading ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Sending magic link...
						</>
					) : (
						<>
							<Sparkles className="mr-2 h-4 w-4" />
							Send magic link
						</>
					)}
				</Button>
				<Link className="mt-4 block" href="/login">
					<Button
						className="w-full border-blue-200 hover:bg-blue-50"
						type="button"
						variant="outline"
					>
						<ChevronLeft className="mr-2 h-4 w-4" />
						Back to login
					</Button>
				</Link>
			</form>
		</div>
	);
}
