'use client';

import {
	CheckCircle,
	Clock,
	Copy,
	History,
	Play,
	Save,
	XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface QueryHistory {
	id: string;
	query: string;
	timestamp: Date;
	duration?: number;
	success: boolean;
	error?: string;
}

interface SqlEditorProps {
	value: string;
	onChange: (value: string) => void;
	onExecute: () => void;
	loading?: boolean;
	className?: string;
}

export function SqlEditor({
	value,
	onChange,
	onExecute,
	loading = false,
	className,
}: SqlEditorProps) {
	const [queryHistory, setQueryHistory] = useState<QueryHistory[]>([]);
	const [showHistory, setShowHistory] = useState(false);

	// Load query history from localStorage on mount
	useEffect(() => {
		const saved = localStorage.getItem('sql-query-history');
		if (saved) {
			try {
				const parsed = JSON.parse(saved).map((item: any) => ({
					...item,
					timestamp: new Date(item.timestamp),
				}));
				setQueryHistory(parsed);
			} catch (error) {
				console.error('Failed to load query history:', error);
			}
		}
	}, []);

	// Save query history to localStorage
	const saveQueryHistory = (history: QueryHistory[]) => {
		localStorage.setItem('sql-query-history', JSON.stringify(history));
		setQueryHistory(history);
	};

	// Add query to history
	const _addToHistory = (
		query: string,
		success: boolean,
		duration?: number,
		error?: string
	) => {
		const newEntry: QueryHistory = {
			id: Date.now().toString(),
			query: query.trim(),
			timestamp: new Date(),
			duration,
			success,
			error,
		};

		const updatedHistory = [newEntry, ...queryHistory.slice(0, 49)]; // Keep last 50 queries
		saveQueryHistory(updatedHistory);
	};

	// Load query from history
	const loadFromHistory = (query: string) => {
		onChange(query);
		setShowHistory(false);
	};

	// Clear history
	const clearHistory = () => {
		saveQueryHistory([]);
	};

	// Copy query to clipboard
	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
		}
	};

	// Save query as file
	const saveAsFile = () => {
		const blob = new Blob([value], { type: 'text/sql' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `query-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.sql`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	// Common ClickHouse queries
	const commonQueries = [
		{
			name: 'Show all databases',
			query: 'SHOW DATABASES',
		},
		{
			name: 'Show tables in analytics',
			query: 'SHOW TABLES FROM analytics',
		},
		{
			name: 'Describe events table',
			query: 'DESCRIBE analytics.events',
		},
		{
			name: 'Recent events (last hour)',
			query: `SELECT * FROM analytics.events 
WHERE time >= now() - INTERVAL 1 HOUR 
ORDER BY time DESC 
LIMIT 100`,
		},
		{
			name: 'Event count by hour',
			query: `SELECT 
  toStartOfHour(time) as hour,
  count() as events
FROM analytics.events 
WHERE time >= now() - INTERVAL 24 HOUR
GROUP BY hour 
ORDER BY hour DESC`,
		},
		{
			name: 'Top pages by views',
			query: `SELECT 
  path,
  count() as views,
  uniq(session_id) as sessions
FROM analytics.events 
WHERE event_name = 'page_view'
  AND time >= now() - INTERVAL 7 DAY
GROUP BY path 
ORDER BY views DESC 
LIMIT 20`,
		},
	];

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			e.preventDefault();
			onExecute();
		}
	};

	return (
		<div className={cn('space-y-4', className)}>
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>SQL Editor</CardTitle>
							<CardDescription>
								Execute ClickHouse queries • Press Ctrl+Enter to run
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<Button
								onClick={() => setShowHistory(!showHistory)}
								size="sm"
								variant="outline"
							>
								<History className="h-4 w-4" />
								History
							</Button>
							<Button
								disabled={!value.trim()}
								onClick={() => copyToClipboard(value)}
								size="sm"
								variant="outline"
							>
								<Copy className="h-4 w-4" />
								Copy
							</Button>
							<Button
								disabled={!value.trim()}
								onClick={saveAsFile}
								size="sm"
								variant="outline"
							>
								<Save className="h-4 w-4" />
								Save
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Textarea
							className="min-h-32 resize-none font-mono text-sm"
							onChange={(e) => onChange(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="SELECT * FROM analytics.events LIMIT 10"
							rows={8}
							value={value}
						/>
					</div>

					<div className="flex items-center justify-between">
						<div className="text-muted-foreground text-sm">
							{value.trim().length} characters
						</div>
						<Button
							className="min-w-24"
							disabled={loading || !value.trim()}
							onClick={onExecute}
						>
							{loading ? (
								<>
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
									Running...
								</>
							) : (
								<>
									<Play className="h-4 w-4" />
									Execute
								</>
							)}
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Common Queries */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Common Queries</CardTitle>
					<CardDescription>Click to load a pre-built query</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{commonQueries.map((item, index) => (
							<Button
								className="h-auto justify-start p-3 text-left"
								key={index}
								onClick={() => onChange(item.query)}
								variant="outline"
							>
								<div>
									<div className="font-medium text-sm">{item.name}</div>
									<div className="mt-1 truncate text-muted-foreground text-xs">
										{item.query.split('\n')[0]}
									</div>
								</div>
							</Button>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Query History */}
			{showHistory && (
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<div>
								<CardTitle className="text-lg">Query History</CardTitle>
								<CardDescription>
									Recent queries and their results
								</CardDescription>
							</div>
							{queryHistory.length > 0 && (
								<Button onClick={clearHistory} size="sm" variant="outline">
									Clear History
								</Button>
							)}
						</div>
					</CardHeader>
					<CardContent>
						{queryHistory.length === 0 ? (
							<div className="py-8 text-center text-muted-foreground">
								<History className="mx-auto mb-2 h-8 w-8" />
								<p>No query history yet</p>
							</div>
						) : (
							<ScrollArea className="h-64">
								<div className="space-y-2">
									{queryHistory.map((item) => (
										<div
											className="cursor-pointer rounded border p-3 transition-colors hover:bg-muted/50"
											key={item.id}
											onClick={() => loadFromHistory(item.query)}
										>
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0 flex-1">
													<div className="mb-1 flex items-center gap-2">
														{item.success ? (
															<CheckCircle className="h-3 w-3 flex-shrink-0 text-green-500" />
														) : (
															<XCircle className="h-3 w-3 flex-shrink-0 text-red-500" />
														)}
														<span className="flex items-center gap-1 text-muted-foreground text-xs">
															<Clock className="h-3 w-3" />
															{item.timestamp.toLocaleString()}
														</span>
														{item.duration && (
															<Badge className="text-xs" variant="outline">
																{item.duration}ms
															</Badge>
														)}
													</div>
													<code className="block truncate font-mono text-xs">
														{item.query}
													</code>
													{item.error && (
														<p className="mt-1 truncate text-red-500 text-xs">
															{item.error}
														</p>
													)}
												</div>
												<Button
													onClick={(e) => {
														e.stopPropagation();
														copyToClipboard(item.query);
													}}
													size="sm"
													variant="ghost"
												>
													<Copy className="h-3 w-3" />
												</Button>
											</div>
										</div>
									))}
								</div>
							</ScrollArea>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
