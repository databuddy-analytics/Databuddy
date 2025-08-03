'use client';

import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	ArrowUpIcon,
	ChatCircleIcon,
	CircleNotchIcon,
	ClockIcon,
	Download,
	FunnelIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	TrendUpIcon,
	UserIcon,
	WarningCircleIcon,
	WifiHighIcon,
	WifiLowIcon,
	X,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
	type RedditPost,
	useExportRedditData,
	useRedditHealth,
	useRedditMentions,
	useRefreshRedditMentions,
	useSearchHistory,
} from './hooks/use-reddit-mentions';

const DEFAULT_KEYWORDS = [
	'databuddy',
	'analytics platform',
	'website analytics',
];

function LoadingSkeleton() {
	return (
		<div className="space-y-6">
			{/* Stats skeleton */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
				{[1, 2, 3, 4].map((i) => (
					<Card key={i}>
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-10 w-10 rounded-lg" />
								<div className="space-y-2">
									<Skeleton className="h-3 w-20 rounded" />
									<Skeleton className="h-6 w-12 rounded" />
								</div>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{/* Posts skeleton */}
			<div className="space-y-4">
				{[1, 2, 3].map((i) => (
					<Card key={i}>
						<CardContent className="p-6">
							<div className="space-y-4">
								<div className="flex items-start justify-between">
									<div className="flex-1 space-y-2">
										<Skeleton className="h-5 w-3/4 rounded" />
										<div className="flex gap-4">
											<Skeleton className="h-4 w-20 rounded" />
											<Skeleton className="h-4 w-16 rounded" />
											<Skeleton className="h-4 w-24 rounded" />
										</div>
									</div>
									<Skeleton className="h-8 w-8 rounded" />
								</div>
								<Skeleton className="h-16 w-full rounded" />
								<div className="flex justify-between">
									<Skeleton className="h-6 w-20 rounded" />
									<div className="flex gap-4">
										<Skeleton className="h-4 w-12 rounded" />
										<Skeleton className="h-4 w-12 rounded" />
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center px-4 py-16 text-center">
			<div className="relative mb-8">
				<div className="rounded-full border bg-muted/50 p-8">
					<MagnifyingGlassIcon
						className="h-16 w-16 text-muted-foreground"
						size={64}
						weight="duotone"
					/>
				</div>
				<div className="-top-2 -right-2 absolute rounded-full border border-primary/20 bg-primary/10 p-2">
					<ChatCircleIcon
						className="h-6 w-6 text-primary"
						size={24}
						weight="fill"
					/>
				</div>
			</div>

			<h3 className="mb-4 font-bold text-2xl">No mentions found</h3>
			<p className="mb-8 max-w-md text-muted-foreground leading-relaxed">
				Try adjusting your keywords or time range, or check back later for new
				mentions.
			</p>

			<Button onClick={onRefresh} size="lg" variant="outline">
				<ArrowClockwiseIcon className="mr-2 h-4 w-4" size={16} weight="fill" />
				Refresh Data
			</Button>
		</div>
	);
}

function ErrorState({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	return (
		<div className="flex flex-col items-center justify-center px-4 py-16 text-center">
			<div className="mb-8 rounded-full border border-red-200 bg-red-50 p-8">
				<WarningCircleIcon
					className="h-16 w-16 text-red-500"
					size={64}
					weight="fill"
				/>
			</div>
			<h3 className="mb-4 font-bold text-2xl">Something went wrong</h3>
			<p className="mb-8 max-w-md text-muted-foreground leading-relaxed">
				{error}
			</p>
			<Button onClick={onRetry} size="lg" variant="outline">
				Try Again
			</Button>
		</div>
	);
}

export default function RedditMentionsPage() {
	const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
	const [newKeyword, setNewKeyword] = useState('');
	const [timeRange, setTimeRange] = useState('24h');
	const [subreddits, _setSubreddits] = useState<string[]>([]);
	const [minScore, setMinScore] = useState<number | undefined>(undefined);
	const [sortBy, setSortBy] = useState<'relevance' | 'new' | 'top' | 'hot'>(
		'new'
	);
	const [excludeStickied, setExcludeStickied] = useState(false);
	const [backgroundSync, setBackgroundSync] = useState(false);

	const filters = {
		keywords,
		timeRange,
		subreddits: subreddits.length > 0 ? subreddits : undefined,
		minScore,
		sortBy,
		excludeStickied,
	};

	const {
		data: redditData,
		isLoading,
		error,
		isError,
		isFetching,
		dataUpdatedAt,
		refetch,
	} = useRedditMentions(filters, { backgroundSync });

	const { data: healthData } = useRedditHealth();
	const refreshMutation = useRefreshRedditMentions();
	const exportMutation = useExportRedditData();
	const { addToHistory } = useSearchHistory();

	const posts = redditData?.posts || [];
	const stats = redditData?.stats || {
		total_mentions: 0,
		average_score: 0,
		top_subreddit: '',
		recent_mentions: 0,
	};

	const handleRefresh = () => {
		refreshMutation.mutate();
		// Add to search history
		addToHistory(filters);
	};

	const addKeyword = () => {
		if (
			newKeyword.trim() &&
			!keywords.includes(newKeyword.trim()) &&
			keywords.length < 10
		) {
			setKeywords([...keywords, newKeyword.trim()]);
			setNewKeyword('');
		}
	};

	const removeKeyword = (keyword: string) => {
		setKeywords(keywords.filter((k) => k !== keyword));
	};

	const _handleExport = (format: 'json' | 'csv') => {
		exportMutation.mutate({ format, filters });
	};

	const formatTimeAgo = (timestamp: number) => {
		const date = new Date(timestamp * 1000);
		const now = new Date();
		const diffInHours = Math.floor(
			(now.getTime() - date.getTime()) / (1000 * 60 * 60)
		);

		if (diffInHours < 1) {
			return 'Less than an hour ago';
		}
		if (diffInHours === 1) {
			return '1 hour ago';
		}
		if (diffInHours < 24) {
			return `${diffInHours} hours ago`;
		}
		return `${Math.floor(diffInHours / 24)} days ago`;
	};

	const isApiHealthy =
		healthData?.status === 'healthy' && healthData?.reddit_connected;
	const isRefreshing = refreshMutation.isPending || isFetching;

	return (
		<div className="flex h-full flex-col">
			{/* Enhanced header */}
			<div className="border-b bg-gradient-to-r from-background via-background to-muted/20">
				<div className="flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center sm:gap-0 sm:px-4 sm:py-4">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-3">
							<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
								<ChatCircleIcon
									className="h-5 w-5 text-primary"
									size={20}
									weight="fill"
								/>
							</div>
							<div>
								<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
									Reddit Mentions
								</h1>
								<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
									Track mentions of your keywords across Reddit
								</p>
							</div>
						</div>
					</div>

					<div className="flex items-center gap-2">
						{/* API Status Indicator */}
						<div
							className={cn(
								'flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium text-xs',
								isApiHealthy
									? 'border-green-200 bg-green-50 text-green-700'
									: 'border-red-200 bg-red-50 text-red-700'
							)}
						>
							{isApiHealthy ? (
								<WifiHighIcon className="h-4 w-4" size={16} />
							) : (
								<WifiLowIcon className="h-4 w-4" size={16} />
							)}
							<span>{isApiHealthy ? 'Connected' : 'Disconnected'}</span>
						</div>

						<div className="flex gap-2">
							<Button
								disabled={exportMutation.isPending || posts.length === 0}
								onClick={() =>
									exportMutation.mutate({ format: 'csv', filters })
								}
								size="default"
								variant="outline"
							>
								<Download className="mr-2 h-4 w-4" />
								Export CSV
							</Button>

							<Button
								className={cn(
									'gap-2 px-6 py-3 font-medium',
									'bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary',
									'group relative overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl'
								)}
								disabled={isRefreshing || !isApiHealthy}
								onClick={handleRefresh}
								size="default"
							>
								<div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-[100%]" />
								{isRefreshing ? (
									<CircleNotchIcon
										className="relative z-10 h-4 w-4 animate-spin"
										size={16}
										weight="fill"
									/>
								) : (
									<ArrowClockwiseIcon
										className="relative z-10 h-4 w-4"
										size={16}
										weight="fill"
									/>
								)}
								<span className="relative z-10">
									{isRefreshing ? 'Refreshing...' : 'Refresh'}
								</span>
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* Content area */}
			<div className="flex-1 overflow-y-auto p-3 sm:px-4 sm:pt-4 sm:pb-6">
				{/* Error Alert */}
				{isError && (
					<Alert className="mb-6" variant="destructive">
						<WarningCircleIcon className="h-4 w-4" size={16} weight="duotone" />
						<AlertDescription>
							{error?.message ||
								'Failed to fetch Reddit mentions. Please try again.'}
						</AlertDescription>
					</Alert>
				)}

				{/* Configuration Card */}
				<Card className="mb-6">
					<CardHeader>
						<CardTitle className="text-lg">Configuration</CardTitle>
						<CardDescription>
							Manage your keywords and time range settings
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						{/* Keywords Management */}
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<Label className="font-medium text-sm">Keywords</Label>
								<span className="text-muted-foreground text-xs">
									{keywords.length}/10
								</span>
							</div>

							<div className="flex flex-wrap gap-2">
								{keywords.map((keyword) => (
									<Badge
										className="group cursor-pointer px-3 py-1 transition-colors hover:bg-destructive hover:text-destructive-foreground"
										key={keyword}
										onClick={() => removeKeyword(keyword)}
										variant="secondary"
									>
										{keyword}
										<X className="ml-1 h-3 w-3 opacity-50 group-hover:opacity-100" />
									</Badge>
								))}
							</div>

							<div className="flex gap-2">
								<Input
									className="flex-1"
									disabled={keywords.length >= 10}
									onChange={(e) => setNewKeyword(e.target.value)}
									onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
									placeholder="Add new keyword..."
									value={newKeyword}
								/>
								<Button
									disabled={keywords.length >= 10 || !newKeyword.trim()}
									onClick={addKeyword}
									variant="outline"
								>
									<PlusIcon className="h-4 w-4" size={16} />
								</Button>
							</div>

							{keywords.length >= 10 && (
								<p className="text-muted-foreground text-xs">
									Maximum of 10 keywords reached. Remove a keyword to add a new
									one.
								</p>
							)}
						</div>

						<Separator />

						{/* Time Range Selection */}
						<div className="space-y-2">
							<Label className="font-medium text-sm">Time Range</Label>
							<Select onValueChange={setTimeRange} value={timeRange}>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="1h">Last Hour</SelectItem>
									<SelectItem value="24h">Last 24 Hours</SelectItem>
									<SelectItem value="7d">Last 7 Days</SelectItem>
									<SelectItem value="30d">Last 30 Days</SelectItem>
									<SelectItem value="365d">Last Year</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<Separator />

						{/* Advanced Filters */}
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<FunnelIcon className="h-4 w-4" size={16} weight="fill" />
								<Label className="font-medium text-sm">Advanced Filters</Label>
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label className="font-medium text-xs">Sort By</Label>
									<Select
										onValueChange={(value: any) => setSortBy(value)}
										value={sortBy}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="new">Newest First</SelectItem>
											<SelectItem value="top">Highest Score</SelectItem>
											<SelectItem value="hot">Most Active</SelectItem>
											<SelectItem value="relevance">Most Relevant</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label className="font-medium text-xs">Min Score</Label>
									<Input
										onChange={(e) =>
											setMinScore(
												e.target.value
													? Number.parseInt(e.target.value, 10)
													: undefined
											)
										}
										placeholder="e.g. 10"
										type="number"
										value={minScore || ''}
									/>
								</div>
							</div>

							<div className="flex items-center space-x-2">
								<input
									checked={excludeStickied}
									className="rounded"
									id="excludeStickied"
									onChange={(e) => setExcludeStickied(e.target.checked)}
									type="checkbox"
								/>
								<Label className="text-xs" htmlFor="excludeStickied">
									Exclude stickied posts
								</Label>
							</div>

							<div className="flex items-center space-x-2">
								<input
									checked={backgroundSync}
									className="rounded"
									id="backgroundSync"
									onChange={(e) => setBackgroundSync(e.target.checked)}
									type="checkbox"
								/>
								<Label className="text-xs" htmlFor="backgroundSync">
									Auto-refresh every 10 minutes
								</Label>
							</div>
						</div>

						{dataUpdatedAt && (
							<div className="border-t pt-2 text-muted-foreground text-xs">
								Last updated: {new Date(dataUpdatedAt).toLocaleString()}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Stats Cards */}
				{!(isLoading || isError) && (
					<div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/20">
										<MagnifyingGlassIcon
											className="h-5 w-5 text-blue-600 dark:text-blue-400"
											size={20}
											weight="fill"
										/>
									</div>
									<div>
										<p className="font-medium text-muted-foreground text-sm">
											Total Mentions
										</p>
										<p className="font-bold text-2xl">{stats.total_mentions}</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/20">
										<TrendUpIcon
											className="h-5 w-5 text-green-600 dark:text-green-400"
											size={20}
											weight="fill"
										/>
									</div>
									<div>
										<p className="font-medium text-muted-foreground text-sm">
											Avg Score
										</p>
										<p className="font-bold text-2xl">
											{Math.round(stats.average_score)}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/20">
										<ChatCircleIcon
											className="h-5 w-5 text-purple-600 dark:text-purple-400"
											size={20}
											weight="fill"
										/>
									</div>
									<div>
										<p className="font-medium text-muted-foreground text-sm">
											Top Subreddit
										</p>
										<p className="truncate font-bold text-lg">
											r/{stats.top_subreddit || 'N/A'}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="rounded-lg bg-orange-100 p-2 dark:bg-orange-900/20">
										<ClockIcon
											className="h-5 w-5 text-orange-600 dark:text-orange-400"
											size={20}
											weight="fill"
										/>
									</div>
									<div>
										<p className="font-medium text-muted-foreground text-sm">
											Recent
										</p>
										<p className="font-bold text-2xl">
											{stats.recent_mentions}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				)}

				{/* Results Section */}
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="font-semibold text-xl">Recent Mentions</h2>
						{!(isLoading || isError) && (
							<Badge className="text-sm" variant="outline">
								{posts.length} results
							</Badge>
						)}
					</div>

					{/* Loading State */}
					{isLoading && <LoadingSkeleton />}

					{/* Error State */}
					{isError && (
						<ErrorState
							error={error?.message || 'Failed to fetch Reddit mentions'}
							onRetry={() => refetch()}
						/>
					)}

					{/* Empty State */}
					{!(isLoading || isError) && posts.length === 0 && (
						<EmptyState onRefresh={handleRefresh} />
					)}

					{/* Results */}
					{!(isLoading || isError) && posts.length > 0 && (
						<div className="fade-in slide-in-from-bottom-2 animate-in space-y-4 duration-700">
							{posts.map((post: RedditPost, index: number) => (
								<div
									className="fade-in slide-in-from-bottom-4 animate-in"
									key={post.id}
									style={{ animationDelay: `${index * 100}ms` }}
								>
									<Card className="border-l-4 border-l-primary/20 transition-all duration-200 hover:border-l-primary hover:shadow-md">
										<CardContent className="p-6">
											<div className="space-y-4">
												{/* Header */}
												<div className="flex items-start justify-between gap-4">
													<div className="min-w-0 flex-1">
														<h3 className="mb-2 line-clamp-2 font-semibold text-foreground text-lg">
															{post.title}
														</h3>
														<div className="flex items-center gap-4 text-muted-foreground text-sm">
															<div className="flex items-center gap-1">
																<ChatCircleIcon
																	className="h-4 w-4"
																	size={16}
																	weight="fill"
																/>
																<span className="font-medium">
																	r/{post.subreddit}
																</span>
															</div>
															<div className="flex items-center gap-1">
																<UserIcon
																	className="h-4 w-4"
																	size={16}
																	weight="fill"
																/>
																<span>u/{post.author}</span>
															</div>
															<div className="flex items-center gap-1">
																<ClockIcon
																	className="h-4 w-4"
																	size={16}
																	weight="fill"
																/>
																<span>{formatTimeAgo(post.created_utc)}</span>
															</div>
														</div>
													</div>
													<Button asChild size="sm" variant="ghost">
														<a
															href={`https://reddit.com${post.permalink}`}
															rel="noopener noreferrer"
															target="_blank"
														>
															<ArrowSquareOutIcon
																className="h-4 w-4"
																size={16}
																weight="fill"
															/>
														</a>
													</Button>
												</div>

												{/* Content */}
												{post.selftext && (
													<p className="line-clamp-3 text-muted-foreground text-sm leading-relaxed">
														{post.selftext}
													</p>
												)}

												{/* Footer */}
												<div className="flex items-center justify-between pt-2">
													<Badge className="text-xs" variant="outline">
														{post.keyword}
													</Badge>

													<div className="flex items-center gap-4 text-muted-foreground text-sm">
														<div className="flex items-center gap-1">
															<ArrowUpIcon
																className="h-4 w-4"
																size={16}
																weight="fill"
															/>
															<span className="font-medium">{post.score}</span>
														</div>
														<div className="flex items-center gap-1">
															<ChatCircleIcon
																className="h-4 w-4"
																size={16}
																weight="fill"
															/>
															<span>{post.num_comments}</span>
														</div>
													</div>
												</div>
											</div>
										</CardContent>
									</Card>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
