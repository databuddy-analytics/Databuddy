'use client';

import { signIn } from '@databuddy/auth/client';
import {
	EyeIcon,
	EyeSlashIcon,
	GithubLogoIcon,
	GoogleLogoIcon,
	SparkleIcon,
	SpinnerIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

function LoginPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isLoading, setIsLoading] = useState(false);
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [lastUsed, setLastUsed] = useState<string | null>(null);

	const defaultCallbackUrl = searchParams.get('callback') || '/websites';

	useEffect(() => {
		setLastUsed(localStorage.getItem('lastUsedLogin'));
	}, []);

	const handleSocialLogin = (provider: 'github' | 'google') => {
		setIsLoading(true);

		const callbackUrl = searchParams.get('callback');
		const finalCallbackUrl = callbackUrl || defaultCallbackUrl;

		signIn.social({
			provider,
			callbackURL: finalCallbackUrl,
			newUserCallbackURL: '/onboarding',
			fetchOptions: {
				onSuccess: () => {
					localStorage.setItem('lastUsedLogin', provider);
					if (callbackUrl) {
						router.push(callbackUrl);
					}
				},
				onError: () => {
					setIsLoading(false);
					toast.error(
						`${provider === 'github' ? 'GitHub' : 'Google'} login failed. Please try again.`
					);
				},
			},
		});
	};

	const handleEmailPasswordLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!(email && password)) {
			toast.error('Please enter both email and password');
			return;
		}

		setIsLoading(true);

		await signIn.email({
			email,
			password,
			callbackURL: defaultCallbackUrl,
			fetchOptions: {
				onSuccess: () => {
					localStorage.setItem('lastUsedLogin', 'email');
					const callbackUrl = searchParams.get('callback');
					if (callbackUrl) {
						router.push(callbackUrl);
					}
				},
				onError: (error) => {
					setIsLoading(false);
					if (
						error?.error?.code === 'EMAIL_NOT_VERIFIED' ||
						error?.error?.message?.toLowerCase().includes('not verified')
					) {
						router.push(
							`/login/verification-needed?email=${encodeURIComponent(email)}`
						);
					} else {
						toast.error(
							error?.error?.message ||
								'Login failed. Please check your credentials and try again.'
						);
					}
				},
			},
		});

		setIsLoading(false);
	};

	return (
		<>
			<div className="-mt-8 mb-8 text-center">
				<h1 className="font-bold text-2xl text-foreground">Welcome back</h1>
				<p className="mt-2 text-muted-foreground">
					Sign in to your account to continue your journey with Databuddy
				</p>
			</div>
			<div className="relative overflow-hidden p-6">
				<div className="-top-40 -right-40 pointer-events-none absolute h-80 w-80 rounded-full blur-3xl" />
				<div className="-bottom-40 -left-40 pointer-events-none absolute h-80 w-80 rounded-full blur-3xl" />
				<div className="relative z-10">
					<div className="space-y-6">
						<div className="-mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
							<Button
								className="relative flex h-11 w-full cursor-pointer items-center justify-center transition-all duration-200 hover:bg-primary/5"
								disabled={isLoading}
								onClick={() => handleSocialLogin('github')}
								type="button"
								variant="outline"
							>
								<GithubLogoIcon className="mr-2 h-5 w-5" />
								<span>Sign in with GitHub</span>
								{lastUsed === 'github' && (
									<span className="-top-4 -right-0.5 absolute inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-medium text-primary text-xs">
										Last used
									</span>
								)}
							</Button>
							<Button
								className="relative flex h-11 w-full cursor-pointer items-center justify-center transition-all duration-200 hover:bg-primary/5"
								disabled={isLoading}
								onClick={() => handleSocialLogin('google')}
								type="button"
								variant="outline"
							>
								<GoogleLogoIcon className="mr-2 h-5 w-5" />
								<span>Sign in with Google</span>
								{lastUsed === 'google' && (
									<span className="-top-4 -right-0.5 absolute inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-medium text-primary text-xs">
										Last used
									</span>
								)}
							</Button>
						</div>
						<div className="relative">
							<div className="absolute inset-0 flex items-center">
								<Separator className="w-full" />
							</div>
							<div className="relative flex justify-center">
								<span className="bg-card px-4 font-medium text-muted-foreground text-sm">
									or continue with
								</span>
							</div>
						</div>
						<form className="space-y-4" onSubmit={handleEmailPasswordLogin}>
							<div className="space-y-2">
								<Label className="font-medium text-foreground" htmlFor="email">
									Email<span className="text-primary">*</span>
								</Label>
								<div className="relative">
									<Input
										autoComplete="email"
										className="h-11 border-none bg-input text-foreground transition-all duration-200 placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20"
										id="email"
										name="email"
										onChange={(e) => setEmail(e.target.value)}
										placeholder="Enter your email"
										required
										type="email"
										value={email}
									/>
									{lastUsed === 'email' && (
										<span className="-translate-y-1/2 absolute top-1/2 right-2 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-medium text-primary text-xs sm:px-2">
											<span className="hidden sm:inline">Last used</span>
											<span className="sm:hidden">★</span>
										</span>
									)}
								</div>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label
										className="font-medium text-foreground"
										htmlFor="password"
									>
										Password<span className="text-primary">*</span>
									</Label>
									<Link
										className="h-auto cursor-pointer p-0 text-primary text-xs sm:text-sm"
										href="/login/forgot"
									>
										<span className="hidden sm:inline">Forgot password?</span>
										<span className="sm:hidden">Forgot?</span>
									</Link>
								</div>
								<div className="relative">
									<Input
										autoComplete="current-password"
										className="h-11 border-none bg-input pr-10 transition-all duration-200 placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20"
										id="password"
										name="password"
										onChange={(e) => setPassword(e.target.value)}
										placeholder="••••••••"
										required
										type={showPassword ? 'text' : 'password'}
										value={password}
									/>
									<Button
										aria-label={
											showPassword ? 'Hide password' : 'Show password'
										}
										className="absolute top-0 right-0 h-full px-3 text-muted-foreground hover:text-foreground"
										onClick={() => setShowPassword(!showPassword)}
										size="sm"
										type="button"
										variant="link"
									>
										{showPassword ? (
											<EyeSlashIcon className="h-4 w-4" />
										) : (
											<EyeIcon className="h-4 w-4" />
										)}
									</Button>
								</div>
							</div>
							<Button
								className="hover:-translate-y-0.5 relative h-11 w-full overflow-hidden shadow transition-all duration-300 hover:shadow-lg hover:shadow-primary/20"
								disabled={isLoading}
								type="submit"
							>
								{isLoading ? (
									<>
										<SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
										Signing in...
									</>
								) : (
									'Sign in'
								)}
							</Button>
							<Link href="/login/magic" passHref>
								<Button
									className="flex w-full cursor-pointer items-center justify-center font-medium text-primary hover:text-primary/80 hover:no-underline"
									type="button"
									variant="link"
								>
									<SparkleIcon className="mr-2 h-4 w-4" />
									Sign in with magic link
								</Button>
							</Link>
						</form>
					</div>
				</div>
			</div>
			<div className="mt-2 text-center">
				<p className="text-muted-foreground text-sm">
					Don&apos;t have an account?{' '}
					<Link
						className="font-medium text-primary hover:text-primary/80"
						href="/register"
					>
						Sign up
					</Link>
				</p>
			</div>
		</>
	);
}

export default function Page() {
	return (
		<Suspense
			fallback={
				<div className="flex h-screen items-center justify-center bg-background">
					<div className="relative">
						<div className="absolute inset-0 animate-ping rounded-full bg-primary/20 blur-xl" />
						<SpinnerIcon className="relative h-8 w-8 animate-spin text-primary" />
					</div>
				</div>
			}
		>
			<LoginPage />
		</Suspense>
	);
}
