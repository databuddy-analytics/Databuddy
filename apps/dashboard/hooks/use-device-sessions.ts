'use client';

import { authClient } from '@databuddy/auth/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface DeviceSessionDetails {
	sessionToken: string;
	userId: string;
	provider: string;
	isCurrent: boolean;
	ipAddress: string | null;
	userAgent: string | null;
	lastActive: string;
	createdAt: string;
	expiresAt: string;
}

export interface DeviceSessionEntry {
	session: DeviceSessionDetails;
	user?: {
		email?: string;
		name?: string;
	};
	sessionToken: string;
	isCurrent: boolean;
	provider: string;
	userId: string;
}

// Helper types
type RawSessionItem = {
	session?: DeviceSessionDetails;
	sessionToken?: string;
	userId?: string;
	provider?: string;
	isCurrent?: boolean;
	ipAddress?: string;
	userAgent?: string;
	lastActive?: string;
	createdAt?: string;
	expiresAt?: string;
	user?: { email?: string; name?: string };
	email?: string;
	name?: string;
};

// Helper function to build session details
function buildSessionDetails(
	sessionItem: RawSessionItem
): DeviceSessionDetails {
	return (
		sessionItem.session || {
			sessionToken: sessionItem.sessionToken ?? '',
			userId: sessionItem.userId ?? '',
			provider: sessionItem.provider ?? '',
			isCurrent: sessionItem.isCurrent ?? false,
			ipAddress: sessionItem.ipAddress ?? null,
			userAgent: sessionItem.userAgent ?? null,
			lastActive: sessionItem.lastActive ?? '',
			createdAt: sessionItem.createdAt ?? '',
			expiresAt: sessionItem.expiresAt ?? '',
		}
	);
}

// Helper function to build user details
function buildUserDetails(sessionItem: RawSessionItem) {
	return (
		sessionItem.user ?? {
			email: sessionItem.email ?? 'Unknown User',
			name: sessionItem.name,
		}
	);
}

// Helper function to process a single session item
function processSessionItem(item: unknown): DeviceSessionEntry {
	const sessionItem = item as RawSessionItem;

	const sessionDetails = buildSessionDetails(sessionItem);
	const userDetails = buildUserDetails(sessionItem);
	const sessionToken =
		sessionItem.sessionToken ?? sessionItem.session?.sessionToken ?? '';
	const isCurrent =
		typeof sessionItem.isCurrent === 'boolean'
			? sessionItem.isCurrent
			: (sessionItem.session?.isCurrent ?? false);

	return {
		session: sessionDetails,
		user: userDetails,
		sessionToken,
		isCurrent,
		provider: sessionItem.provider ?? sessionItem.session?.provider ?? 'N/A',
		userId: sessionItem.userId ?? sessionItem.session?.userId ?? '',
	};
}

// Process raw session data into the expected format
function processSessionData(result: unknown): DeviceSessionEntry[] {
	const typedResult = result as {
		error?: { message?: string } | null;
		data?: unknown[] | null;
	};

	if (typedResult.error?.message) {
		throw new Error(typedResult.error.message);
	}

	return typedResult.data?.map(processSessionItem) ?? [];
}

export function useDeviceSessions() {
	const queryClient = useQueryClient();

	// Fetch sessions with React Query
	const {
		data: sessions = [],
		isLoading,
		error,
		refetch: fetchSessions,
	} = useQuery({
		queryKey: ['device-sessions'],
		queryFn: async () => {
			const result = await authClient.multiSession.listDeviceSessions();
			return processSessionData(result);
		},
		staleTime: 2 * 60 * 1000, // 2 minutes - auth data should stay fresh
		gcTime: 5 * 60 * 1000, // 5 minutes
		refetchOnWindowFocus: true, // Refetch when user comes back to check sessions
		refetchOnMount: true,
		retry: (failureCount, err) => {
			// Don't retry auth failures
			if (
				err.message.includes('unauthorized') ||
				err.message.includes('forbidden')
			) {
				return false;
			}
			return failureCount < 2;
		},
	});

	// Set active session mutation
	const setActiveSession = useMutation({
		mutationFn: async (sessionToken: string) => {
			const result = await authClient.multiSession.setActive({ sessionToken });
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result;
		},
		onSuccess: () => {
			toast.success('Session switched successfully. Reloading...');
			// Clear all queries since we're switching context
			queryClient.clear();
			window.location.reload();
		},
		onError: (err: Error) => {
			toast.error(err.message || 'Failed to switch session.');
		},
	});

	// Revoke session mutation
	const revokeSession = useMutation({
		mutationFn: async (sessionToken: string) => {
			const result = await authClient.multiSession.revoke({ sessionToken });
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result;
		},
		onSuccess: () => {
			toast.success('Session revoked successfully.');
			// Invalidate and refetch sessions to update the list
			queryClient.invalidateQueries({ queryKey: ['device-sessions'] });
		},
		onError: (err: Error) => {
			toast.error(err.message || 'Failed to revoke session.');
		},
	});

	return {
		sessions,
		isLoading,
		error: error?.message || null,
		operatingSession:
			setActiveSession.isPending || revokeSession.isPending
				? 'operating'
				: null,
		fetchSessions,
		setActiveSession: setActiveSession.mutate,
		revokeSession: revokeSession.mutate,
		isSettingActive: setActiveSession.isPending,
		isRevoking: revokeSession.isPending,
		isOperating: setActiveSession.isPending || revokeSession.isPending,
	};
}
