'use client';

import { authClient, useSession } from '@databuddy/auth/client';
import {
	ArrowClockwiseIcon,
	ClockIcon,
	GlobeIcon,
	MonitorIcon,
	PhoneIcon,
	SignOutIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

dayjs.extend(relativeTime);

interface Session {
	id: string;
	ipAddress?: string | null;
	userAgent?: string | null;
	createdAt: Date;
	expiresAt: Date;
	isCurrent?: boolean;
}

export function SessionsForm() {
	const router = useRouter();
	const { data: session } = useSession();
	const [sessions, setSessions] = useState<Session[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [revokeLoading, setRevokeLoading] = useState<string | null>(null);

	useEffect(() => {
		fetchSessions();
	}, [fetchSessions]);

	const fetchSessions = async () => {
		setIsLoading(true);
		try {
			const response = await authClient.listSessions();

			// Mark current session
			const currentSessionId = session?.session?.id;
			const formattedSessions = response.data?.map((s: any) => ({
				...s,
				isCurrent: s.id === currentSessionId,
			}));

			setSessions(formattedSessions || []);
		} catch (error: any) {
			toast.error(error.message || 'Failed to load sessions');
		} finally {
			setIsLoading(false);
		}
	};

	const handleRevoke = async (sessionId: string) => {
		setRevokeLoading(sessionId);
		try {
			const response = await authClient.revokeSession({ token: sessionId });
			if (response.error) {
				toast.error(response.error.message || 'Failed to revoke session');
			} else {
				toast.success('Session revoked successfully');

				// If current session was revoked, redirect to login
				if (sessionId === session?.session?.id) {
					router.push('/login');
					return;
				}

				// Refresh the list
				fetchSessions();
			}
		} catch (error: any) {
			toast.error(error.message || 'Failed to revoke session');
		} finally {
			setRevokeLoading(null);
		}
	};

	const handleRevokeAll = async () => {
		if (
			!confirm(
				"Are you sure you want to revoke all other sessions? You'll remain logged in on this device only."
			)
		) {
			return;
		}

		setIsLoading(true);
		try {
			const response = await authClient.revokeOtherSessions();
			if (response.error) {
				toast.error(response.error.message || 'Failed to revoke sessions');
			} else {
				toast.success('All other sessions revoked successfully');
				fetchSessions();
			}
		} catch (error: any) {
			toast.error(error.message || 'Failed to revoke sessions');
		} finally {
			setIsLoading(false);
		}
	};

	const getDeviceIcon = (userAgent?: string | null) => {
		if (!userAgent) {
			return <GlobeIcon className="h-4 w-4" size={16} weight="duotone" />;
		}

		const ua = userAgent.toLowerCase();
		if (
			ua.includes('mobile') ||
			ua.includes('android') ||
			ua.includes('iphone') ||
			ua.includes('ipad')
		) {
			return <PhoneIcon className="h-4 w-4" size={16} weight="duotone" />;
		}
		return <MonitorIcon className="h-4 w-4" size={16} weight="duotone" />;
	};

	const formatUserAgent = (userAgent?: string | null) => {
		if (!userAgent) {
			return 'Unknown Device';
		}

		// Extract browser and OS information
		let browser = 'Unknown Browser';
		let os = 'Unknown OS';

		if (userAgent.includes('Firefox')) {
			browser = 'Firefox';
		} else if (userAgent.includes('Chrome')) {
			browser = 'Chrome';
		} else if (userAgent.includes('Safari')) {
			browser = 'Safari';
		} else if (userAgent.includes('Edge')) {
			browser = 'Edge';
		}

		if (userAgent.includes('Windows')) {
			os = 'Windows';
		} else if (userAgent.includes('Mac OS')) {
			os = 'macOS';
		} else if (userAgent.includes('Linux')) {
			os = 'Linux';
		} else if (userAgent.includes('Android')) {
			os = 'Android';
		} else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
			os = 'iOS';
		}

		return `${browser} on ${os}`;
	};

	return (
		<div className="space-y-4">
			<div className="mb-4 flex items-center justify-between">
				<h3 className="font-medium text-lg">Active Sessions</h3>
				{sessions.length > 1 && (
					<Button
						disabled={isLoading}
						onClick={handleRevokeAll}
						size="sm"
						variant="outline"
					>
						<SignOutIcon className="mr-2 h-4 w-4" size={16} weight="duotone" />
						Revoke All Other Sessions
					</Button>
				)}
			</div>

			{isLoading ? (
				<div className="flex items-center justify-center p-8">
					<ArrowClockwiseIcon
						className="h-6 w-6 animate-spin text-muted-foreground"
						size={16}
						weight="fill"
					/>
				</div>
			) : sessions.length === 0 ? (
				<Alert>
					<AlertTitle>No active sessions</AlertTitle>
					<AlertDescription>
						There are no active sessions for your account.
					</AlertDescription>
				</Alert>
			) : (
				<div className="space-y-3">
					{sessions.map((s) => (
						<div
							className={`flex items-start justify-between rounded-md border p-4 ${
								s.isCurrent ? 'border-primary/20 bg-primary/5' : ''
							}`}
							key={s.expiresAt.toString()}
						>
							<div className="flex items-start gap-3">
								<div className="rounded-md bg-muted p-2">
									{getDeviceIcon(s.userAgent)}
								</div>
								<div>
									<p className="font-medium">
										{formatUserAgent(s.userAgent)}
										{s.isCurrent && (
											<span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-primary text-xs">
												Current
											</span>
										)}
									</p>
									<div className="mt-1 text-muted-foreground text-sm">
										<div className="flex items-center gap-2">
											<GlobeIcon
												className="h-3.5 w-3.5"
												size={16}
												weight="duotone"
											/>
											<span>{s.ipAddress || 'Unknown IP'}</span>
										</div>
										<div className="mt-1 flex items-center gap-2">
											<ClockIcon
												className="h-3.5 w-3.5"
												size={16}
												weight="duotone"
											/>
											<span>
												Created {dayjs(s.createdAt).fromNow()}, expires{' '}
												{dayjs(s.expiresAt).fromNow()}
											</span>
										</div>
									</div>
								</div>
							</div>
							<Button
								disabled={revokeLoading === s.id}
								onClick={() => handleRevoke(s.id)}
								size="sm"
								variant="ghost"
							>
								{revokeLoading === s.id ? (
									<ArrowClockwiseIcon
										className="h-4 w-4 animate-spin"
										size={16}
										weight="fill"
									/>
								) : (
									'Revoke'
								)}
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
