'use client';

import { ArrowLeft, Clock, Copy, Play } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface QueryResult {
	data: Record<string, any>[];
	meta: Array<{ name: string; type: string }>;
	rows: number;
	statistics?: {
		elapsed: number;
		rows_read: number;
		bytes_read: number;
	};
}

export default function SqlConsole() {
	const [query, setQuery] = useState('');
	const [result, setResult] = useState<QueryResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [executionTime, setExecutionTime] = useState<number | null>(null);

	const executeQuery = async () => {
		if (!query.trim()) {
			return;
		}

		setLoading(true);
		setError(null);
		const startTime = Date.now();

		try {
			const response = await fetch('/api/database/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query }),
			});
			const data = await response.json();
			const duration = Date.now() - startTime;
			setExecutionTime(duration);

			if (data.success) {
				setResult(data.data);
			} else {
				setError(data.error);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to execute query');
		} finally {
			setLoading(false);
		}
	};

	const copyQuery = async () => {
		try {
			await navigator.clipboard.writeText(query);
		} catch (error) {
			console.error('Failed to copy query:', error);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			e.preventDefault();
			executeQuery();
		}
	};

	const commonQueries = [
		{
			name: 'Show Databases',
			query: 'SHOW DATABASES',
		},
		{
			name: 'Show Tables',
			query: 'SHOW TABLES FROM analytics',
		},
		{
			name: 'Recent Events',
			query: `SELECT * FROM analytics.events 
WHERE time >= now() - INTERVAL 1 HOUR 
ORDER BY time DESC 
LIMIT 100`,
		},
		{
			name: 'Event Count by Hour',
			query: `SELECT 
  toStartOfHour(time) as hour,
  count() as events
FROM analytics.events 
WHERE time >= now() - INTERVAL 24 HOUR
GROUP BY hour 
ORDER BY hour DESC`,
		},
	];

	return (
		<div className="min-h-screen bg-background p-6">
			<div className="mx-auto max-w-6xl space-y-6">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<Link href="/">
							<Button size="sm" variant="ghost">
								<ArrowLeft className="h-4 w-4" />
								Back
							</Button>
						</Link>
						<div>
							<h1 className="font-bold text-3xl">SQL Console</h1>
							<p className="text-muted-foreground">
								Execute ClickHouse queries
							</p>
						</div>
					</div>
				</div>

				{/* Query Editor */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<div>
								<CardTitle>Query Editor</CardTitle>
								<CardDescription>Press Ctrl+Enter to execute</CardDescription>
							</div>
							<div className="flex items-center gap-2">
								<Button
									disabled={!query.trim()}
									onClick={copyQuery}
									size="sm"
									variant="outline"
								>
									<Copy className="h-4 w-4" />
									Copy
								</Button>
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-4">
						<Textarea
							className="min-h-32 font-mono text-sm"
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="SELECT * FROM analytics.events LIMIT 10"
							rows={8}
							value={query}
						/>

						<div className="flex items-center justify-between">
							<div className="text-muted-foreground text-sm">
								{query.trim().length} characters
								{executionTime && (
									<span className="ml-4 flex items-center gap-1">
										<Clock className="h-3 w-3" />
										{executionTime}ms
									</span>
								)}
							</div>
							<Button
								className="min-w-24"
								disabled={loading || !query.trim()}
								onClick={executeQuery}
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
						<CardTitle>Common Queries</CardTitle>
						<CardDescription>Click to load a pre-built query</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid gap-2 sm:grid-cols-2">
							{commonQueries.map((item, index) => (
								<Button
									className="h-auto justify-start p-3 text-left"
									key={index}
									onClick={() => setQuery(item.query)}
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

				{/* Error Display */}
				{error && (
					<Card className="border-destructive">
						<CardContent className="pt-6">
							<p className="font-mono text-destructive text-sm">{error}</p>
						</CardContent>
					</Card>
				)}

				{/* Results */}
				{result && <DataTable loading={loading} result={result} />}
			</div>
		</div>
	);
}
