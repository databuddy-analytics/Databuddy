'use client';

import { authClient } from '@databuddy/auth/client';
import {
	ArrowRight,
	Buildings,
	CheckCircle,
	CircleNotch,
	Clock,
	Sparkle,
	UserPlus,
	XCircle,
} from '@phosphor-icons/react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type InvitationData = {
	organizationName: string;
	organizationSlug: string;
	inviterEmail: string;
	id: string;
	email: string;
	status: 'pending' | 'accepted' | 'rejected' | 'canceled';
	expiresAt: Date;
	organizationId: string;
	role: string;
	inviterId: string;
	teamId?: string | undefined;
};

export default function AcceptInvitationPage() {
	const router = useRouter();
	const params = useParams();
	const invitationId = params.id as string;

	const [status, setStatus] = useState<
		| 'loading'
		| 'ready'
		| 'accepting'
		| 'success'
		| 'error'
		| 'expired'
		| 'already-accepted'
	>('loading');
	const [invitation, setInvitation] = useState<InvitationData | null>(null);
	const [error, setError] = useState<string>('');

	useEffect(() => {
		const fetchInvitation = async () => {
			try {
				if (!invitationId) {
					setStatus('error');
					setError('Invalid invitation link');
					return;
				}

				const { data: invitationData, error: invitationError } =
					await authClient.organization.getInvitation({
						query: { id: invitationId },
					});

				if (invitationError || !invitationData) {
					if (
						invitationError?.message?.includes('expired') ||
						invitationError?.message?.includes('not found')
					) {
						setStatus('expired');
					} else {
						setStatus('error');
						setError(invitationError?.message || 'Failed to load invitation');
					}
					return;
				}

				setInvitation(invitationData);

				if (invitationData.status === 'accepted') {
					setStatus('already-accepted');
				} else if (
					invitationData.status === 'canceled' ||
					invitationData.status === 'rejected' ||
					new Date(invitationData.expiresAt) < new Date()
				) {
					setStatus('expired');
				} else {
					setStatus('ready');
				}
			} catch (err: any) {
				console.error('Error fetching invitation:', err);
				setStatus('error');
				setError(err.message || 'An unexpected error occurred');
			}
		};

		fetchInvitation();
	}, [invitationId]);

	const handleAcceptInvitation = async () => {
		if (!invitation) {
			return;
		}

		setStatus('accepting');
		try {
			const result = await authClient.organization.acceptInvitation({
				invitationId,
			});

			if (result.data) {
				setStatus('success');
				setTimeout(() => {
					router.push('/websites');
				}, 3000);
			} else {
				setStatus('error');
				setError('Failed to accept invitation');
			}
		} catch (err: any) {
			console.error('Error accepting invitation:', err);
			setStatus('error');
			setError(err.message || 'Failed to accept invitation');
		}
	};

	const handleDecline = () => {
		router.push('/websites');
	};

	const formatRole = (role: string) => {
		return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
	};

	const formatExpiryDate = (expiresAt: string) => {
		const date = new Date(expiresAt);
		return date.toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	};

	const renderContent = () => {
		switch (status) {
			case 'loading':
				return (
					<div className="flex flex-col items-center justify-center px-4 py-16 text-center">
						<div className="relative mb-8">
							<div className="rounded-full border bg-muted/50 p-8">
								<CircleNotch className="h-16 w-16 animate-spin text-primary" />
							</div>
						</div>
						<h3 className="mb-4 font-bold text-2xl">Loading Invitation</h3>
						<p className="text-muted-foreground leading-relaxed">
							Fetching invitation details...
						</p>
					</div>
				);

			case 'ready':
				return (
					<div className="flex flex-col items-center justify-center px-4 py-16 text-center">
						<div className="relative mb-8">
							<div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl" />
							<div className="relative rounded-full border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
								<UserPlus className="h-12 w-12 text-primary" weight="duotone" />
							</div>
							<Sparkle
								className="-top-2 -right-2 absolute h-6 w-6 animate-pulse text-primary/60"
								weight="duotone"
							/>
							<Sparkle
								className="-bottom-1 -left-3 absolute h-4 w-4 animate-pulse text-primary/40"
								style={{ animationDelay: '1s' }}
								weight="duotone"
							/>
						</div>

						<div className="mb-8 space-y-4">
							<h3 className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text font-bold text-2xl text-transparent">
								You're Invited!
							</h3>
							<p className="max-w-md text-lg text-muted-foreground leading-relaxed">
								<span className="font-semibold text-foreground">
									{invitation?.inviterEmail}
								</span>{' '}
								has invited you to join{' '}
								<span className="font-semibold text-foreground">
									{invitation?.organizationName}
								</span>{' '}
								as a{' '}
								<span className="font-semibold text-primary">
									{formatRole(invitation?.role || '')}
								</span>
								.
							</p>
						</div>

						<div className="mb-8 w-full max-w-md rounded-xl border border-border/50 bg-muted/50 p-6">
							<div className="mb-4 flex items-start gap-3">
								<div className="rounded-lg bg-primary/10 p-2">
									<Buildings
										className="h-5 w-5 text-primary"
										weight="duotone"
									/>
								</div>
								<div className="flex-1 text-left">
									<p className="mb-1 font-semibold text-sm">
										Organization Details
									</p>
									<p className="text-muted-foreground text-sm">
										{invitation?.organizationName}
									</p>
									<p className="mt-1 text-muted-foreground text-xs">
										Role: {formatRole(invitation?.role || '')}
									</p>
								</div>
							</div>

							<div className="flex items-start gap-3">
								<div className="rounded-lg bg-orange-100 p-2 dark:bg-orange-900/20">
									<Clock
										className="h-5 w-5 text-orange-600 dark:text-orange-400"
										weight="duotone"
									/>
								</div>
								<div className="flex-1 text-left">
									<p className="mb-1 font-semibold text-sm">Expires</p>
									<p className="text-muted-foreground text-xs">
										{formatExpiryDate(invitation?.expiresAt.toString() || '')}
									</p>
								</div>
							</div>
						</div>

						<div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
							<Button
								className="group relative flex-1 gap-3 overflow-hidden rounded px-8 py-6 font-medium text-lg"
								onClick={handleAcceptInvitation}
								size="lg"
							>
								<UserPlus
									className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:scale-110"
									weight="duotone"
								/>
								<span className="relative z-10">Join Organization</span>
								<ArrowRight className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
							</Button>

							<Button
								className="flex-1 rounded px-8 py-6 font-medium text-lg sm:flex-initial"
								onClick={handleDecline}
								size="lg"
								variant="outline"
							>
								Maybe Later
							</Button>
						</div>
					</div>
				);

			case 'accepting':
				return (
					<div className="flex flex-col items-center justify-center px-4 py-16 text-center">
						<div className="relative mb-8">
							<div className="rounded-full border border-primary/20 bg-primary/10 p-8">
								<CircleNotch className="h-16 w-16 animate-spin text-primary" />
							</div>
						</div>
						<h3 className="mb-4 font-bold text-2xl">Joining Organization</h3>
						<p className="text-muted-foreground leading-relaxed">
							Adding you to{' '}
							<span className="font-semibold text-foreground">
								{invitation?.organizationName}
							</span>
							...
						</p>
					</div>
				);

			case 'success':
				return (
					<div className="flex flex-col items-center justify-center px-4 py-16 text-center">
						<div className="relative mb-8">
							<div className="absolute inset-0 animate-pulse rounded-full bg-green-500/20 blur-xl" />
							<div className="relative rounded-full border border-green-500/20 bg-gradient-to-br from-green-500/10 to-green-500/5 p-6">
								<CheckCircle
									className="h-12 w-12 text-green-600"
									weight="duotone"
								/>
							</div>
							<Sparkle
								className="-top-2 -right-2 absolute h-6 w-6 animate-pulse text-green-500/60"
								weight="duotone"
							/>
						</div>

						<div className="mb-8 space-y-4">
							<h3 className="bg-gradient-to-r from-green-600 to-green-500 bg-clip-text font-bold text-2xl text-transparent">
								Welcome Aboard!
							</h3>
							<p className="text-lg text-muted-foreground leading-relaxed">
								You've successfully joined{' '}
								<span className="font-semibold text-foreground">
									{invitation?.organizationName}
								</span>
							</p>
							<p className="text-muted-foreground text-sm">
								Redirecting you to your dashboard...
							</p>
						</div>

						<div className="max-w-md rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-900/20">
							<div className="flex items-start gap-3">
								<div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/40">
									<Sparkle
										className="h-5 w-5 text-green-600 dark:text-green-400"
										weight="duotone"
									/>
								</div>
								<div className="text-left">
									<p className="mb-2 font-semibold text-green-800 text-sm dark:text-green-200">
										🎉 You're all set!
									</p>
									<p className="text-green-700 text-sm leading-relaxed dark:text-green-300">
										You can now access all projects and resources in{' '}
										{invitation?.organizationName}.
									</p>
								</div>
							</div>
						</div>
					</div>
				);

			case 'already-accepted':
				return (
					<div className="flex flex-col items-center justify-center px-4 py-16 text-center">
						<div className="relative mb-8">
							<div className="rounded-full border border-blue-500/20 bg-blue-500/10 p-8">
								<CheckCircle
									className="h-16 w-16 text-blue-600"
									weight="duotone"
								/>
							</div>
						</div>

						<div className="mb-8 space-y-4">
							<h3 className="font-bold text-2xl">Already a Member</h3>
							<p className="text-lg text-muted-foreground leading-relaxed">
								You're already a member of{' '}
								<span className="font-semibold text-foreground">
									{invitation?.organizationName}
								</span>
							</p>
						</div>

						<Button
							className="gap-3 rounded px-8 py-6 font-medium text-lg"
							onClick={() => router.push('/websites')}
							size="lg"
						>
							<Buildings className="h-5 w-5" weight="duotone" />
							Go to Dashboard
							<ArrowRight className="h-5 w-5" weight="duotone" />
						</Button>
					</div>
				);

			case 'expired':
				return (
					<div className="flex flex-col items-center justify-center px-4 py-16 text-center">
						<div className="relative mb-8">
							<div className="rounded-full border border-red-500/20 bg-red-500/10 p-8">
								<XCircle className="h-16 w-16 text-red-600" weight="duotone" />
							</div>
						</div>

						<div className="mb-8 space-y-4">
							<h3 className="font-bold text-2xl">Invitation Expired</h3>
							<p className="text-lg text-muted-foreground leading-relaxed">
								This invitation link has expired or is no longer valid.
							</p>
							<p className="text-muted-foreground text-sm">
								Please contact the organization admin for a new invitation.
							</p>
						</div>

						<Button
							className="gap-3 rounded px-8 py-6 font-medium text-lg"
							onClick={() => router.push('/')}
							size="lg"
						>
							<Buildings className="h-5 w-5" weight="duotone" />
							Back to Home
							<ArrowRight className="h-5 w-5" weight="duotone" />
						</Button>
					</div>
				);

			case 'error':
				return (
					<div className="flex flex-col items-center justify-center px-4 py-16 text-center">
						<div className="relative mb-8">
							<div className="rounded-full border border-red-500/20 bg-red-500/10 p-8">
								<XCircle className="h-16 w-16 text-red-600" weight="duotone" />
							</div>
						</div>

						<div className="mb-8 space-y-4">
							<h3 className="font-bold text-2xl">Something went wrong</h3>
							<p className="text-lg text-muted-foreground leading-relaxed">
								{error}
							</p>
						</div>

						<Button
							className="gap-3 rounded px-8 py-6 font-medium text-lg"
							onClick={() => router.push('/')}
							size="lg"
						>
							<Buildings className="h-5 w-5" weight="duotone" />
							Back to Home
							<ArrowRight className="h-5 w-5" weight="duotone" />
						</Button>
					</div>
				);

			default:
				return null;
		}
	};

	return (
		<div className="fade-in slide-in-from-bottom-4 flex h-full animate-in flex-col duration-500">
			<div className="border-b bg-muted/30">
				<div className="flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center sm:gap-0 sm:px-4 sm:py-4">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-3">
							<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
								<UserPlus className="h-5 w-5 text-primary" weight="duotone" />
							</div>
							<div>
								<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
									Organization Invitation
								</h1>
								<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
									{status === 'ready' && invitation
										? `Join ${invitation.organizationName}`
										: 'Processing invitation'}
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto">
				<Card className="w-full border-0 bg-transparent shadow-none">
					<CardContent className="p-0">{renderContent()}</CardContent>
				</Card>
			</div>
		</div>
	);
}
