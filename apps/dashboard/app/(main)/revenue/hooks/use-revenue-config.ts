'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type {
	CreateRevenueConfigData,
	OnboardingStep,
	RevenueConfig,
} from '../utils/types';

// API client functions - self-contained to avoid double API calls
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function apiRequest<T>(
	endpoint: string,
	options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
	const response = await fetch(`${API_BASE_URL}/v1${endpoint}`, {
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
			...options.headers,
		},
		...options,
	});

	const data = await response.json();

	if (!response.ok) {
		throw new Error(data.error || `HTTP error! status: ${response.status}`);
	}

	return data;
}

// API functions
const revenueApi = {
	getConfig: async (): Promise<RevenueConfig | null> => {
		const result = await apiRequest<RevenueConfig>('/revenue/config');
		if (result.error) {
			throw new Error(result.error);
		}
		return result.data || null;
	},

	createOrUpdateConfig: async (
		data: CreateRevenueConfigData
	): Promise<RevenueConfig> => {
		const result = await apiRequest<RevenueConfig>('/revenue/config', {
			method: 'POST',
			body: JSON.stringify(data),
		});
		if (result.error) {
			throw new Error(result.error);
		}
		if (!result.data) {
			throw new Error('No data returned from save revenue config');
		}
		return result.data;
	},

	regenerateWebhookToken: async (): Promise<{ webhookToken: string }> => {
		const result = await apiRequest<{ webhookToken: string }>(
			'/revenue/config/regenerate-webhook-token',
			{
				method: 'POST',
			}
		);
		if (result.error) {
			throw new Error(result.error);
		}
		if (!result.data) {
			throw new Error('No data returned from regenerate webhook token');
		}
		return result.data;
	},

	deleteConfig: async (): Promise<{ success: boolean }> => {
		const result = await apiRequest<{ success: boolean }>('/revenue/config', {
			method: 'DELETE',
		});
		if (result.error) {
			throw new Error(result.error);
		}
		if (!result.data) {
			throw new Error('No data returned from delete revenue config');
		}
		return result.data;
	},
};

// Query keys
const revenueKeys = {
	all: ['revenue'] as const,
	config: () => [...revenueKeys.all, 'config'] as const,
};

export function useRevenueConfig() {
	const [onboardingStep, setOnboardingStep] =
		useState<OnboardingStep>('overview');
	const [copied, setCopied] = useState(false);
	const queryClient = useQueryClient();

	// Fetch revenue config with React Query
	const {
		data: config,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: revenueKeys.config(),
		queryFn: async () => {
			try {
				return await revenueApi.getConfig();
			} catch (error) {
				console.error('Error fetching revenue config:', error);
				throw error;
			}
		},
		staleTime: 30_000, // 30 seconds
		refetchOnWindowFocus: false,
	});

	// Create or update config mutation
	const createOrUpdateMutation = useMutation({
		mutationFn: async (
			data: CreateRevenueConfigData
		): Promise<RevenueConfig> => {
			return await revenueApi.createOrUpdateConfig(data);
		},
		onSuccess: (newData) => {
			toast.success('Revenue configuration saved successfully');

			queryClient.setQueryData(revenueKeys.config(), newData);

			queryClient.invalidateQueries({
				predicate: (query) => {
					return query.queryKey[0] === 'batch-dynamic-query';
				},
			});
		},
		onError: (error: Error) => {
			toast.error(error.message || 'Failed to save revenue configuration');
		},
	});

	// Regenerate webhook token mutation
	const regenerateTokenMutation = useMutation({
		mutationFn: async () => {
			return await revenueApi.regenerateWebhookToken();
		},
		onSuccess: () => {
			toast.success('Webhook token regenerated successfully');
			queryClient.invalidateQueries({ queryKey: revenueKeys.config() });
		},
		onError: (error: Error) => {
			toast.error(error.message || 'Failed to regenerate webhook token');
		},
	});

	// Delete config mutation
	const deleteMutation = useMutation({
		mutationFn: async () => {
			return await revenueApi.deleteConfig();
		},
		onSuccess: () => {
			toast.success('Revenue configuration deleted successfully');
			queryClient.invalidateQueries({ queryKey: revenueKeys.config() });
		},
		onError: (error: Error) => {
			toast.error(error.message || 'Failed to delete revenue configuration');
		},
	});

	// Derived values from config
	const webhookToken = config?.webhookToken || '';
	const webhookSecret = config?.webhookSecret || '';
	const isLiveMode = config?.isLiveMode ?? false;
	const webhookUrl = useMemo(() => {
		return webhookToken
			? `https://basket.databuddy.cc/stripe/webhook/${webhookToken}`
			: '';
	}, [webhookToken]);

	const copyToClipboard = useCallback((text: string, label: string) => {
		navigator.clipboard.writeText(text);
		setCopied(true);
		toast.success(`${label} copied to clipboard`);
		setTimeout(() => setCopied(false), 2000);
	}, []);

	const updateConfig = useCallback(
		(updates: { webhookSecret?: string; isLiveMode?: boolean }) => {
			const updateData: CreateRevenueConfigData = {
				isLiveMode: updates.isLiveMode ?? config?.isLiveMode ?? false,
				isActive: true,
			};

			// Only include webhookSecret if it's explicitly provided
			if (updates.webhookSecret !== undefined) {
				updateData.webhookSecret = updates.webhookSecret;
			}

			createOrUpdateMutation.mutate(updateData);
		},
		[createOrUpdateMutation, config?.isLiveMode]
	);

	const setWebhookSecret = useCallback(
		(secret: string) => {
			updateConfig({ webhookSecret: secret });
		},
		[updateConfig]
	);

	const setIsLiveMode = useCallback(
		(mode: boolean) => {
			updateConfig({ isLiveMode: mode });
		},
		[updateConfig]
	);

	// Computed states for setup completion
	const isWebhookConfigured = !!(webhookSecret && webhookToken);
	const isSetupComplete = isWebhookConfigured;
	const setupProgress = isWebhookConfigured ? 100 : webhookSecret ? 50 : 0;

	return {
		// State
		onboardingStep,
		webhookToken,
		webhookSecret,
		isLiveMode,
		copied,
		webhookUrl,

		// Setup status
		isWebhookConfigured,
		isSetupComplete,
		setupProgress,

		// Actions
		setOnboardingStep,
		setWebhookSecret,
		setIsLiveMode,
		updateConfig,
		copyToClipboard,

		// API states
		isLoading,
		isError,
		isCreating: createOrUpdateMutation.isPending,
		isRegeneratingToken: regenerateTokenMutation.isPending,
		isDeleting: deleteMutation.isPending,

		// API actions
		regenerateWebhookToken: regenerateTokenMutation.mutate,
		deleteConfig: deleteMutation.mutate,
		refetch,
	};
}
