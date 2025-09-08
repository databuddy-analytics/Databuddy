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

		setIsLoading(false);
	};

	return (
		<div className="relative mx-auto mt-12 w-full max-w-md overflow-hidden p-6">
			<div className="mb-12 text-center">
				<div className="relative mb-10 inline-flex h-16 w-16 items-center justify-center ">
					<div className="-inset-1 absolute rounded-full bg-gradient-to-tr from-blue-200 to-blue-100 opacity-20 blur-md" />
					<div className="relative ">
						<Sparkles className="h-8 w-8 animate-pulse text-foreground" />
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
				<div className="flex items-center gap-3 p-3 text-info-foreground text-sm">
					<Sparkles className="h-5 w-5 flex-shrink-0 text-foreground" />
					<p className="text-muted-foreground">
						We'll send a secure link to your email that will sign you in
						instantly — no password needed.
					</p>
				</div>
				<Button
					className="h-11 w-full bg-info text-info-foreground hover:bg-info/90"
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
				<Link className="block" href="/login">
					<Button
						className="h-11 w-full border-info/20 hover:cursor-pointer hover:bg-info/5"
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
