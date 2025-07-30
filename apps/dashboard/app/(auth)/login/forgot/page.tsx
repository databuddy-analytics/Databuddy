'use client';

import { authClient } from '@databuddy/auth/client';
import { ChevronLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState('');
	const [isLoading, setIsLoading] = useState(false);

	const handleForgotPassword = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email) {
			toast.error('Please enter your email address');
			return;
		}
		setIsLoading(true);
		try {
			await authClient.forgetPassword({
				email,
				fetchOptions: {
					onSuccess: () => {
						setIsLoading(false);
						toast.success('Password reset instructions sent to your email.');
					},
					onError: () => {
						setIsLoading(false);
						toast.error('Failed to send reset instructions. Please try again.');
					},
				},
			});
		} catch (_error) {
			setIsLoading(false);
			toast.error('An error occurred. Please try again later.');
		}
	};

	return (
		<div className="relative mx-auto mt-12 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card p-6 shadow">
			<div className="mb-8 text-center">
				<h1 className="font-bold text-2xl text-foreground">
					Reset your password
				</h1>
				<p className="mt-2 text-muted-foreground">
					We'll send you a link to reset your password
				</p>
			</div>
			<form className="space-y-4" onSubmit={handleForgotPassword}>
				<div className="space-y-2">
					<Label className="font-medium text-foreground" htmlFor="forgot-email">
						Email address
					</Label>
					<Input
						autoComplete="email"
						className="h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						id="forgot-email"
						name="email"
						onChange={(e) => setEmail(e.target.value)}
						placeholder="name@example.com"
						required
						type="email"
						value={email}
					/>
				</div>
				<div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-blue-800 text-sm">
					Enter your email address and we'll send you a link to reset your
					password.
				</div>
				<Button
					className="h-11 w-full bg-primary"
					disabled={isLoading}
					type="submit"
				>
					{isLoading ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Sending reset link...
						</>
					) : (
						'Send reset link'
					)}
				</Button>
				<Link className="mt-4 block" href="/login">
					<Button className="w-full" type="button" variant="outline">
						<ChevronLeft className="mr-2 h-4 w-4" />
						Back to login
					</Button>
				</Link>
			</form>
		</div>
	);
}
