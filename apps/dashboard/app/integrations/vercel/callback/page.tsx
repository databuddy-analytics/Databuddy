'use client';

import { authClient, useSession } from '@databuddy/auth/client';
import {
	CheckCircleIcon,
	LinkIcon,
	SpinnerIcon,
	UserIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function VercelCallbackContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { data: session } = useSession();
	const [isProcessing, setIsProcessing] = useState(true);
	const [integrationData, setIntegrationData] = useState<{
		configurationId?: string;
		teamId?: string;
		next?: string;
		code?: string;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const code = searchParams.get('code');
		const configurationId = searchParams.get('configurationId');
		const teamId = searchParams.get('teamId');
		const next = searchParams.get('next');

		if (!code) {
			setError('Authorization code not found');
			setIsProcessing(false);
			return;
		}

		setIntegrationData({
			code,
			configurationId: configurationId || undefined,
			teamId: teamId || undefined,
			next: next || undefined,
		});
		setIsProcessing(false);
	}, [searchParams]);

	const handleConfirmIntegration = async () => {
		if (!integrationData?.code) {
			return;
		}

		setIsProcessing(true);
		try {
			const { data, error } = await authClient.oauth2.link({
				providerId: 'vercel',
				callbackURL: '/websites',
			});

			if (error) {
				setError(
					`Failed to connect Vercel account: ${error.message || 'Unknown error'}`
				);
				return;
			}

			if (integrationData.configurationId || integrationData.teamId) {
				// TODO: Store these details in the database
			}

			toast.success('Vercel account connected successfully!');
			router.push('/websites');
		} catch (error) {
			setError(
				`An error occurred while connecting your Vercel account: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleCancel = () => {
		router.push('/websites');
	};

	if (error) {
		return (
			<div className="mx-auto flex min-h-screen max-w-[1600px] flex-col p-3 sm:p-4 lg:p-6">
				<div className="flex flex-1 items-center justify-center">
					<div className="w-full max-w-md">
						<Card className="border-destructive border-l-4 bg-destructive/5">
							<CardContent className="p-6 text-center">
								<div className="mb-4 flex justify-center">
									<WarningCircleIcon className="h-12 w-12 text-destructive" />
								</div>
								<h1 className="mb-2 font-medium text-destructive text-lg">
									Integration Failed
								</h1>
								<p className="mb-4 text-muted-foreground text-sm">{error}</p>
								<Button onClick={handleCancel} type="button">
									Go Back to Dashboard
								</Button>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		);
	}

	if (isProcessing && !integrationData) {
		return (
			<div className="mx-auto flex min-h-screen max-w-[1600px] flex-col p-3 sm:p-4 lg:p-6">
				<div className="flex flex-1 items-center justify-center">
					<div className="text-center">
						<div className="relative mb-4">
							<div className="absolute inset-0 animate-ping rounded-full bg-primary/20 blur-xl" />
							<SpinnerIcon className="relative mx-auto h-8 w-8 animate-spin text-primary" />
						</div>
						<h1 className="mb-2 font-medium text-lg">
							Processing integration...
						</h1>
						<p className="text-muted-foreground text-sm">
							Please wait while we verify your request.
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto flex min-h-screen max-w-[1600px] flex-col p-3 sm:p-4 lg:p-6">
			<div className="flex flex-1 items-center justify-center">
				<div className="w-full max-w-lg space-y-6">
					{/* Header */}
					<div className="text-center">
						<div className="mb-4 flex justify-center">
							<LinkIcon className="h-12 w-12 text-primary" />
						</div>
						<h1 className="mb-2 font-medium text-2xl">
							Connect Vercel Account
						</h1>
						<p className="text-muted-foreground text-sm">
							You're about to connect your Vercel account to Databuddy
						</p>
					</div>

					{/* Current User Account Info */}
					<Card className="border-primary border-l-4 bg-primary/5">
						<CardContent className="p-4">
							<h4 className="mb-3 flex items-center gap-2 font-medium text-primary text-sm">
								<UserIcon className="h-4 w-4" />
								Connecting to your Databuddy account
							</h4>
							<div className="space-y-2">
								<div className="flex items-center gap-3">
									{session?.user?.image ? (
										<img
											alt={session?.user?.name || 'User'}
											className="h-8 w-8 rounded-full"
											src={session.user.image}
										/>
									) : (
										<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 font-medium text-primary text-sm">
											{session?.user?.name?.[0]?.toUpperCase() || 'U'}
										</div>
									)}
									<div>
										<div className="font-medium text-sm">
											{session?.user?.name || 'Unknown User'}
										</div>
										<div className="text-muted-foreground text-xs">
											{session?.user?.email || 'No email available'}
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Integration Details */}
					<Card>
						<CardContent className="p-4">
							<h3 className="mb-3 font-medium text-sm">Integration Details</h3>
							<div className="space-y-2">
								{integrationData?.configurationId && (
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">
											Configuration ID:
										</span>
										<span className="font-mono text-xs">
											{integrationData.configurationId}
										</span>
									</div>
								)}
								{integrationData?.teamId && (
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">Team ID:</span>
										<span className="font-mono text-xs">
											{integrationData.teamId}
										</span>
									</div>
								)}
								<div className="flex justify-between text-sm">
									<span className="text-muted-foreground">Provider:</span>
									<span className="font-medium">Vercel</span>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Permissions */}
					<Card className="border-accent border-l-4 bg-accent/5">
						<CardContent className="p-4">
							<h4 className="mb-3 flex items-center gap-2 font-medium text-accent-foreground text-sm">
								<CheckCircleIcon className="h-4 w-4" />
								What this integration will do
							</h4>
							<ul className="space-y-2">
								<li className="flex items-center gap-3 text-sm">
									<CheckCircleIcon className="h-4 w-4 text-accent" />
									<span>Access your Vercel projects and deployments</span>
								</li>
								<li className="flex items-center gap-3 text-sm">
									<CheckCircleIcon className="h-4 w-4 text-accent" />
									<span>Monitor deployment analytics</span>
								</li>
								<li className="flex items-center gap-3 text-sm">
									<CheckCircleIcon className="h-4 w-4 text-accent" />
									<span>Sync project data with Databuddy</span>
								</li>
								<li className="flex items-center gap-3 text-sm">
									<CheckCircleIcon className="h-4 w-4 text-accent" />
									<span>Enable deployment notifications</span>
								</li>
							</ul>
						</CardContent>
					</Card>

					{/* Actions */}
					<div className="flex gap-3">
						<Button
							className="flex-1"
							disabled={isProcessing}
							onClick={handleCancel}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							className="flex-1"
							disabled={isProcessing}
							onClick={handleConfirmIntegration}
							type="button"
						>
							{isProcessing ? (
								<>
									<SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
									Connecting...
								</>
							) : (
								'Connect Account'
							)}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function VercelCallbackPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-screen items-center justify-center bg-background">
					<SpinnerIcon className="h-8 w-8 animate-spin text-primary" />
				</div>
			}
		>
			<VercelCallbackContent />
		</Suspense>
	);
}
