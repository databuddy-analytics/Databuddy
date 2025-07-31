'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';

// Types
export interface RedditPost {
	id: string;
	title: string;
	url: string;
	subreddit: string;
	author: string;
	score: number;
	num_comments: number;
	created_utc: number;
	selftext?: string;
	permalink: string;
	keyword: string;
	upvote_ratio?: number;
	domain?: string;
	is_self?: boolean;
	stickied?: boolean;
}

export interface RedditStats {
	total_mentions: number;
	average_score: number;
	top_subreddit: string;
	recent_mentions: number;
	trending_keywords: string[];
	sentiment_score?: number;
	engagement_rate: number;
	peak_hour: number;
}

export interface RedditMentionsResponse {
	posts: RedditPost[];
	stats: RedditStats;
	metadata: {
		total_searched: number;
		search_time_ms: number;
		last_updated: string;
		next_update?: string;
	};
}

export interface RedditHealthResponse {
	status: 'healthy' | 'unhealthy' | 'degraded';
	reddit_connected: boolean;
	last_check: string;
	response_time_ms?: number;
	error_count?: number;
}

export interface SearchFilters {
	keywords: string[];
	timeRange: string;
	subreddits?: string[];
	minScore?: number;
	sortBy?: 'relevance' | 'new' | 'top' | 'hot';
	excludeStickied?: boolean;
}

// API client functions
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function apiRequest<T>(
	endpoint: string,
	options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string; code?: string }> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s timeout

	try {
		console.log(`Making API request to: ${API_BASE_URL}/v1${endpoint}`);

		const response = await fetch(`${API_BASE_URL}/v1${endpoint}`, {
			credentials: 'include',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'Databuddy-Dashboard/1.0',
				...options.headers,
			},
			signal: controller.signal,
			...options,
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			// Handle different HTTP error codes
			switch (response.status) {
				case 429:
					throw new Error(
						'Rate limit exceeded. Please wait before making another request.'
					);
				case 503:
					throw new Error(
						'Reddit API is temporarily unavailable. Please try again later.'
					);
				case 401:
					throw new Error(
						'Authentication failed. Please check your Reddit credentials.'
					);
				case 404:
					throw new Error('API endpoint not found. Please contact support.');
				default:
					throw new Error(`API request failed with status ${response.status}`);
			}
		}

		const data = await response.json();
		console.log('API response:', { status: response.status, data });

		if (!data.success && data.error) {
			throw new Error(data.error);
		}

		return data;
	} catch (error: unknown) {
		clearTimeout(timeoutId);

		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error('Request timed out. Please try again.');
		}

		if (error instanceof Error) {
			throw error;
		}

		throw new Error('An unexpected error occurred');
	}
}

// API functions
const redditApi = {
	getMentions: async (
		filters: SearchFilters
	): Promise<RedditMentionsResponse> => {
		const params = new URLSearchParams({
			keywords: filters.keywords.join(','),
			time_range: filters.timeRange,
			...(filters.subreddits?.length && {
				subreddits: filters.subreddits.join(','),
			}),
			...(filters.minScore && { min_score: filters.minScore.toString() }),
			...(filters.sortBy && { sort: filters.sortBy }),
			...(filters.excludeStickied && { exclude_stickied: 'true' }),
		});

		const result = await apiRequest<RedditMentionsResponse>(
			`/reddit/mentions?${params}`
		);
		if (result.error) {
			throw new Error(result.error);
		}

		return (
			result.data || {
				posts: [],
				stats: {
					total_mentions: 0,
					average_score: 0,
					top_subreddit: '',
					recent_mentions: 0,
					trending_keywords: [],
					engagement_rate: 0,
					peak_hour: 0,
				},
				metadata: {
					total_searched: 0,
					search_time_ms: 0,
					last_updated: new Date().toISOString(),
				},
			}
		);
	},

	getHealth: async (): Promise<RedditHealthResponse> => {
		const result = await apiRequest<RedditHealthResponse>('/reddit/health');
		if (result.error) {
			throw new Error(result.error);
		}
		return (
			result.data || {
				status: 'unhealthy',
				reddit_connected: false,
				last_check: new Date().toISOString(),
			}
		);
	},

	refresh: async (): Promise<{ success: boolean }> => {
		const result = await apiRequest<{ success: boolean }>('/reddit/refresh', {
			method: 'POST',
		});
		if (result.error) {
			throw new Error(result.error);
		}
		return result.data || { success: false };
	},

	exportData: async (
		format: 'json' | 'csv',
		filters: SearchFilters
	): Promise<Blob> => {
		const params = new URLSearchParams({
			keywords: filters.keywords.join(','),
			time_range: filters.timeRange,
			format,
			...(filters.subreddits?.length && {
				subreddits: filters.subreddits.join(','),
			}),
		});

		const response = await fetch(`${API_BASE_URL}/v1/reddit/export?${params}`, {
			credentials: 'include',
		});

		if (!response.ok) {
			throw new Error('Failed to export data');
		}

		return response.blob();
	},

	getAnalytics: async (filters: SearchFilters): Promise<any> => {
		const params = new URLSearchParams({
			keywords: filters.keywords.join(','),
			time_range: filters.timeRange,
		});

		const result = await apiRequest<any>(`/reddit/analytics?${params}`);
		if (result.error) {
			throw new Error(result.error);
		}
		return result.data;
	},
};

// Query keys
export const redditKeys = {
	all: ['reddit'] as const,
	mentions: () => [...redditKeys.all, 'mentions'] as const,
	mentionsList: (filters: SearchFilters) =>
		[...redditKeys.mentions(), filters] as const,
	health: () => [...redditKeys.all, 'health'] as const,
	analytics: (filters: SearchFilters) =>
		[...redditKeys.all, 'analytics', filters] as const,
};

// Enhanced hook for Reddit mentions with advanced features
export function useRedditMentions(
	filters: SearchFilters,
	options?: {
		enabled?: boolean;
		refetchInterval?: number;
		backgroundSync?: boolean;
	}
) {
	console.log('useRedditMentions called with:', { filters, options });

	const queryResult = useQuery({
		queryKey: redditKeys.mentionsList(filters),
		queryFn: async () => {
			console.log('Fetching Reddit mentions...');
			try {
				const result = await redditApi.getMentions(filters);
				console.log('Reddit mentions result:', result);

				// Store in localStorage for offline access
				if (typeof window !== 'undefined') {
					localStorage.setItem(
						'reddit-mentions-cache',
						JSON.stringify({
							data: result,
							timestamp: Date.now(),
							filters,
						})
					);
				}

				return result;
			} catch (error) {
				console.error('Error fetching Reddit mentions:', error);

				// Try to load from cache on error
				if (typeof window !== 'undefined') {
					const cached = localStorage.getItem('reddit-mentions-cache');
					if (cached) {
						const { data, timestamp } = JSON.parse(cached);
						// Use cache if it's less than 1 hour old
						if (Date.now() - timestamp < 3_600_000) {
							console.log('Using cached data due to API error');
							return data;
						}
					}
				}

				throw error;
			}
		},
		enabled: filters.keywords.length > 0 && (options?.enabled ?? true),
		staleTime: 5 * 60 * 1000, // 5 minutes
		refetchOnWindowFocus: false,
		refetchInterval: options?.backgroundSync
			? options.refetchInterval || 10 * 60 * 1000
			: false, // 10 minutes if background sync enabled
		retry: (failureCount, error) => {
			// Don't retry if it's a rate limit error
			if (
				error.message.includes('rate limit') ||
				error.message.includes('429')
			) {
				return false;
			}
			return failureCount < 3;
		},
		retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
	});

	// Background sync effect
	useEffect(() => {
		if (options?.backgroundSync && !queryResult.isLoading) {
			const interval = setInterval(
				() => {
					queryResult.refetch();
				},
				options.refetchInterval || 10 * 60 * 1000
			);

			return () => clearInterval(interval);
		}
	}, [options?.backgroundSync, options?.refetchInterval, queryResult]);

	return queryResult;
}

// Hook for Reddit API health with enhanced monitoring
export function useRedditHealth() {
	return useQuery({
		queryKey: redditKeys.health(),
		queryFn: async () => {
			try {
				return await redditApi.getHealth();
			} catch (error) {
				console.error('Error checking Reddit health:', error);
				return {
					status: 'unhealthy' as const,
					reddit_connected: false,
					last_check: new Date().toISOString(),
					error_count: 1,
				};
			}
		},
		staleTime: 30 * 1000, // 30 seconds
		refetchInterval: 60 * 1000, // Check every minute
		refetchOnWindowFocus: false,
		retry: 2,
	});
}

// Hook for manual refresh with better UX
export function useRefreshRedditMentions() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			return await redditApi.refresh();
		},
		onSuccess: () => {
			toast.success('Reddit mentions refreshed successfully');
			// Invalidate all Reddit queries to trigger refetch
			queryClient.invalidateQueries({ queryKey: redditKeys.all });
		},
		onError: (error: Error) => {
			console.error('Error refreshing Reddit mentions:', error);

			let message = 'Failed to refresh Reddit mentions';
			if (error.message.includes('rate limit')) {
				message = 'Rate limit exceeded. Please wait before refreshing again.';
			} else if (error.message.includes('timeout')) {
				message =
					'Request timed out. Please check your connection and try again.';
			}

			toast.error(message);
		},
	});
}

// Hook for data export
export function useExportRedditData() {
	return useMutation({
		mutationFn: async ({
			format,
			filters,
		}: {
			format: 'json' | 'csv';
			filters: SearchFilters;
		}) => {
			const blob = await redditApi.exportData(format, filters);

			// Create download link
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.style.display = 'none';
			a.href = url;
			a.download = `reddit-mentions-${new Date().toISOString().split('T')[0]}.${format}`;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);

			return { success: true };
		},
		onSuccess: () => {
			toast.success('Data exported successfully');
		},
		onError: (error: Error) => {
			console.error('Error exporting data:', error);
			toast.error('Failed to export data. Please try again.');
		},
	});
}

// Hook for analytics data
export function useRedditAnalytics(filters: SearchFilters, enabled = false) {
	return useQuery({
		queryKey: redditKeys.analytics(filters),
		queryFn: () => redditApi.getAnalytics(filters),
		enabled: enabled && filters.keywords.length > 0,
		staleTime: 10 * 60 * 1000, // 10 minutes
		refetchOnWindowFocus: false,
	});
}

// Utility hook for managing search history
export function useSearchHistory() {
	const getHistory = useCallback(() => {
		if (typeof window === 'undefined') {
			return [];
		}
		const history = localStorage.getItem('reddit-search-history');
		return history ? JSON.parse(history) : [];
	}, []);

	const addToHistory = useCallback(
		(filters: SearchFilters) => {
			if (typeof window === 'undefined') {
				return;
			}

			const history = getHistory();
			const newEntry = {
				...filters,
				timestamp: Date.now(),
				id: Date.now().toString(),
			};

			// Remove duplicates and limit to 10 entries
			const filtered = history.filter(
				(entry: any) =>
					JSON.stringify(entry.keywords) !== JSON.stringify(filters.keywords)
			);

			const updated = [newEntry, ...filtered].slice(0, 10);
			localStorage.setItem('reddit-search-history', JSON.stringify(updated));
		},
		[getHistory]
	);

	const clearHistory = useCallback(() => {
		if (typeof window !== 'undefined') {
			localStorage.removeItem('reddit-search-history');
		}
	}, []);

	return { getHistory, addToHistory, clearHistory };
}

// Export API functions for direct use if needed
export { redditApi };
