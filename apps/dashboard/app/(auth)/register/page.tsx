'use client';

import { authClient } from '@databuddy/auth/client';
import {
	CaretLeftIcon,
	CheckCircleIcon,
	EyeIcon,
	EyeSlashIcon,
	GithubLogoIcon,
	GoogleLogoIcon,
	InfoIcon,
	SpinnerIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import VisuallyHidden from '@/components/ui/visuallyhidden';

function RegisterPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const selectedPlan = searchParams.get('plan');
	const [isLoading, setIsLoading] = useState(false);
	const [formData, setFormData] = useState({
		name: '',
		email: '',
		password: '',
		confirmPassword: '',
	});
	const [acceptTerms, setAcceptTerms] = useState(false);
	const [isHoneypot, setIsHoneypot] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [registrationStep, setRegistrationStep] = useState<
		'form' | 'success' | 'verification-needed'
	>('form');

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (formData.password !== formData.confirmPassword) {
			toast.error('Passwords do not match');
			return;
		}

		if (!acceptTerms) {
			toast.error('You must accept the terms and conditions');
			return;
		}

		if (isHoneypot) {
			toast.error('Server error, please try again later');
			return;
		}

		setIsLoading(true);

		const { error } = await authClient.signUp.email({
			email: formData.email,
			password: formData.password,
			name: formData.name,
			fetchOptions: {
				onSuccess: (ctx) => {
					const authToken = ctx.response.headers.get('set-auth-token');
					if (authToken) {
						localStorage.setItem('authToken', authToken);
					}
					toast.success(
						'Account created! Please check your email to verify your account.'
					);
					setRegistrationStep('verification-needed');

					// Store plan selection for post-verification redirect
					if (selectedPlan) {
						localStorage.setItem('pendingPlanSelection', selectedPlan);
					}
					// router.push(`/verify?email=${encodeURIComponent(formData.email)}`);
				},
			},
		});

		if (error) {
			toast.error(error.message || 'Failed to create account');
		}

		setIsLoading(false);
	};

	const resendVerificationEmail = async () => {
		setIsLoading(true);

		await authClient.sendVerificationEmail({
			email: formData.email,
			callbackURL: '/onboarding',
			fetchOptions: {
				onSuccess: () => {
					toast.success('Verification email sent!');
				},
				onError: () => {
					toast.error(
						'Failed to send verification email. Please try again later.'
					);
				},
			},
		});

		setIsLoading(false);
	};

	const handleSocialLogin = async (provider: 'github' | 'google') => {
		setIsLoading(true);

		await authClient.signIn.social({
			provider,
			fetchOptions: {
				onSuccess: (ctx) => {
					const authToken = ctx.response.headers.get('set-auth-token');
					if (authToken) {
						localStorage.setItem('authToken', authToken);
					}
					toast.success('Registration successful!');

					// Redirect to billing with plan selection if plan was specified
					if (selectedPlan) {
						localStorage.setItem('pendingPlanSelection', selectedPlan);
						router.push(`/billing?tab=plans&plan=${selectedPlan}`);
					} else {
						router.push('/home');
					}
				},
				onError: () => {
					toast.error('Login failed. Please try again.');
				},
			},
		});

		setIsLoading(false);
	};

	// Render header content based on current registration step
	const renderHeaderContent = () => {
		switch (registrationStep) {
			case 'verification-needed':
				return (
					<>
						<div className="relative mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 p-3">
							<div className="absolute inset-0 animate-pulse rounded-full bg-amber-50" />
							<div className="-inset-1 absolute rounded-full bg-gradient-to-tr from-amber-200 to-amber-100 opacity-70 blur-md" />
							<div className="relative rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 p-2.5">
								<WarningCircleIcon className="h-8 w-8 text-white" />
							</div>
						</div>
						<h1 className="font-bold text-2xl text-foreground">
							Verify your email
						</h1>
						<p className="mt-2 text-muted-foreground">
							We've sent a verification link to{' '}
							<strong className="font-medium text-amber-600">
								{formData.email}
							</strong>
						</p>
					</>
				);
			case 'success':
				return (
					<>
						<div className="relative mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 p-3">
							<div className="absolute inset-0 animate-pulse rounded-full bg-green-50" />
							<div className="-inset-1 absolute rounded-full bg-gradient-to-tr from-green-200 to-green-100 opacity-70 blur-md" />
							<div className="relative rounded-full bg-gradient-to-tr from-green-500 to-green-400 p-2.5">
								<CheckCircleIcon className="h-8 w-8 text-white" />
							</div>
						</div>
						<h1 className="font-bold text-2xl text-foreground">Success!</h1>
						<p className="mt-2 text-muted-foreground">
							Your account has been created successfully
						</p>
					</>
				);
			default:
				return (
					<>
						<h1 className="font-bold text-2xl text-foreground tracking-tight">
							Create your account
						</h1>
						<p className="mt-2 text-muted-foreground">
							Sign up to start building better products with Databuddy
						</p>
					</>
				);
		}
	};

	// Split render content into smaller components
	const renderVerificationContent = () => (
		<div className="space-y-5 py-4">
			<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
				<p className="text-sm">
					Please check your email inbox and click the verification link to
					activate your account. If you don't see the email, check your spam
					folder.
				</p>
			</div>

			<div className="flex flex-col space-y-3">
				<Button
					className="w-full bg-amber-500 text-sm text-white hover:bg-amber-600 sm:text-base"
					disabled={isLoading}
					onClick={resendVerificationEmail}
				>
					{isLoading ? (
						<>
							<SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
							Sending...
						</>
					) : (
						<>
							<span className="hidden sm:inline">
								Resend verification email
							</span>
							<span className="sm:hidden">Resend email</span>
						</>
					)}
				</Button>

				<Button
					className="w-full border-amber-200 text-amber-700 text-sm hover:bg-amber-50 sm:text-base"
					onClick={() => setRegistrationStep('form')}
					variant="outline"
				>
					<CaretLeftIcon className="mr-2 h-4 w-4" />
					<span className="hidden sm:inline">Back to registration</span>
					<span className="sm:hidden">Back</span>
				</Button>
			</div>
		</div>
	);

	const renderSuccessContent = () => (
		<div className="space-y-5 py-4">
			<div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
				<p className="text-sm">
					Your account has been created successfully. You can now sign in to
					access your dashboard.
				</p>
			</div>

			<Button
				className="w-full bg-green-500 text-sm text-white hover:bg-green-600 sm:text-base"
				onClick={() => router.push('/login')}
			>
				<span className="hidden sm:inline">Continue to login</span>
				<span className="sm:hidden">Continue</span>
			</Button>
		</div>
	);

	const renderFormContent = () => (
		<div className="space-y-4">
			<div className="-mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
				<Button
					className="flex h-11 w-full cursor-pointer items-center justify-center transition-all duration-200 hover:bg-primary/5"
					disabled={isLoading}
					onClick={() => handleSocialLogin('github')}
					type="button"
					variant="outline"
				>
					<GithubLogoIcon className="mr-2 h-5 w-5" />
					<span>Sign up with GitHub</span>
				</Button>

				<Button
					className="flex h-11 w-full cursor-pointer items-center justify-center transition-all duration-200 hover:bg-primary/5"
					disabled={isLoading}
					onClick={() => handleSocialLogin('google')}
					type="button"
					variant="outline"
				>
					<GoogleLogoIcon className="mr-2 h-5 w-5" />
					<span>Sign up with Google</span>
				</Button>
			</div>

			<div className="relative">
				<div className="absolute inset-0 flex items-center">
					<Separator className="w-full" />
				</div>
				<div className="relative flex justify-center">
					<span className="bg-card px-4 font-medium text-muted-foreground text-sm">
						or continue with email
					</span>
				</div>
			</div>

			<form className="space-y-4" onSubmit={handleSubmit}>
				<div className="space-y-2">
					<Label className="font-medium text-foreground" htmlFor="name">
						Full name<span className="text-blue-700">*</span>
					</Label>
					<Input
						autoComplete="name"
						className="h-11 border-none bg-input transition-all duration-200 placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20"
						disabled={isLoading}
						id="name"
						name="name"
						onChange={handleChange}
						placeholder="Enter your name"
						required
						type="text"
						value={formData.name}
					/>
				</div>

				<div className="space-y-2">
					<Label className="font-medium text-foreground" htmlFor="email">
						Email address<span className="text-blue-700">*</span>
					</Label>
					<Input
						autoComplete="email"
						className="h-11 border-none bg-input transition-all duration-200 placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20"
						disabled={isLoading}
						id="email"
						name="email"
						onChange={handleChange}
						placeholder="Enter your email"
						required
						type="email"
						value={formData.email}
					/>
				</div>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Label className="font-medium text-foreground" htmlFor="password">
								Password<span className="text-blue-700">*</span>
							</Label>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<InfoIcon className="h-4 w-4 text-muted-foreground" />
									</TooltipTrigger>
									<TooltipContent>
										<p>Password must be at</p>
										<p>least 8 characters long</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
						<div className="relative">
							<Input
								autoComplete="new-password"
								className="h-11 border-none bg-input pr-10 transition-all duration-200 placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20"
								disabled={isLoading}
								id="password"
								minLength={8}
								name="password"
								onChange={handleChange}
								placeholder="••••••••"
								required
								type={showPassword ? 'text' : 'password'}
								value={formData.password}
							/>
							<Button
								aria-label={showPassword ? 'Hide password' : 'Show password'}
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

					<div className="space-y-2">
						<Label
							className="font-medium text-foreground whitespace-nowrap"
							htmlFor="confirmPassword"
						>
							Confirm password<span className="text-blue-700">*</span>
						</Label>
						<div className="relative">
							<Input
								autoComplete="new-password"
								className="h-11 border-none bg-input pr-10 transition-all duration-200 placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20"
								disabled={isLoading}
								id="confirmPassword"
								minLength={8}
								name="confirmPassword"
								onChange={handleChange}
								placeholder="••••••••"
								required
								type={showConfirmPassword ? 'text' : 'password'}
								value={formData.confirmPassword}
							/>
							<Button
								aria-label={
									showConfirmPassword ? 'Hide password' : 'Show password'
								}
								className="absolute top-0 right-0 h-full px-3 text-muted-foreground hover:text-foreground"
								onClick={() => setShowConfirmPassword(!showConfirmPassword)}
								size="sm"
								type="button"
								variant="link"
							>
								{showConfirmPassword ? (
									<EyeSlashIcon className="h-4 w-4" />
								) : (
									<EyeIcon className="h-4 w-4" />
								)}
							</Button>
						</div>
					</div>
				</div>

				<VisuallyHidden>
					<div className="flex items-center space-x-2" id="honeypot">
						<Checkbox
							checked={isHoneypot}
							disabled={isLoading}
							id="honeypot"
							onCheckedChange={(checked) => setIsHoneypot(checked as boolean)}
						/>
					</div>
				</VisuallyHidden>

				<div className="space-y-2">
					<div className="flex items-start gap-2">
						<Checkbox
							checked={acceptTerms}
							className="mt-1 cursor-pointer data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
							disabled={isLoading}
							id="terms"
							onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
						/>
						<Label
							className="text-muted-foreground text-xs leading-relaxed sm:text-sm"
							htmlFor="terms"
						>
							<span className="hidden sm:inline">
								I agree to the{' '}
								<Link
									className="font-medium text-primary hover:text-primary/80"
									href="https://www.databuddy.cc/terms"
									target="_blank"
								>
									Terms of Service
								</Link>
								{' '}and{' '}
								<Link
									className="font-medium text-primary hover:text-primary/80"
									href="https://www.databuddy.cc/privacy"
									target="_blank"
								>
									Privacy Policy
								</Link>
							</span>
							<span className="sm:hidden">
								I agree to{' '}
								<Link
									className="font-medium text-primary hover:text-primary/80"
									href="https://www.databuddy.cc/terms"
									target="_blank"
								>
									Terms
								</Link>
								{' '}&{' '}
								<Link
									className="font-medium text-primary hover:text-primary/80"
									href="https://www.databuddy.cc/privacy"
									target="_blank"
								>
									Privacy
								</Link>
							</span>
						</Label>
					</div>
				</div>

				<Button
					className="hover:-translate-y-0.5 relative h-11 w-full overflow-hidden text-sm shadow transition-all duration-300 hover:shadow-lg hover:shadow-primary/20 sm:text-base"
					disabled={isLoading}
					type="submit"
				>
					{isLoading ? (
						<>
							<SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
							<span className="hidden sm:inline">Creating account...</span>
							<span className="sm:hidden">Creating...</span>
						</>
					) : (
						<>
							<span className="hidden sm:inline">Create account</span>
							<span className="sm:hidden">Sign up</span>
						</>
					)}
				</Button>
			</form>
		</div>
	);

	// Render content based on current registration step
	const renderContent = () => {
		switch (registrationStep) {
			case 'verification-needed':
				return renderVerificationContent();
			case 'success':
				return renderSuccessContent();
			default:
				return renderFormContent();
		}
	};

	return (
		<>
			<div className="mb-8 text-center">{renderHeaderContent()}</div>
			<div className="relative overflow-hidden p-6">
				<div className="-top-40 -right-40 pointer-events-none absolute h-80 w-80 blur-3xl" />
				<div className="-bottom-40 -left-40 pointer-events-none absolute h-80 w-80 blur-3xl" />
				<div className="relative z-10">{renderContent()}</div>
			</div>
			{registrationStep === 'form' && (
				<div className="mt-2 text-center">
					<p className="text-muted-foreground text-sm">
						Already have an account?{' '}
						<Link
							className="font-medium text-primary hover:text-primary/80"
							href="/login"
						>
							Sign in
						</Link>
					</p>
				</div>
			)}
		</>
	);
}

export default function RegisterPage() {
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
			<RegisterPageContent />
		</Suspense>
	);
}
