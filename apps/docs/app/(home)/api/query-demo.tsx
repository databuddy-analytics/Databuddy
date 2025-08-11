'use client';

import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getQueryTypes } from './actions';
import {
	type BatchQueryResponse,
	type DynamicQueryRequest,
	executeBatchQueries,
} from './query-builder';

interface QueryType {
	name: string;
	defaultLimit?: number;
	customizable?: boolean;
	allowedFilters?: string[];
}

// JSON Tree Viewer Component
interface JsonNodeProps {
	data: unknown;
	name?: string;
	level?: number;
}

function JsonNode({ data, name, level = 0 }: JsonNodeProps) {
	const [isExpanded, setIsExpanded] = useState(true); // Open by default
	const indent = level * 12;

	// Simple value renderer
	const renderValue = (value: unknown, key?: string) => (
		<div className="flex items-center py-0.5" style={{ paddingLeft: indent }}>
			{key && <span className="mr-2 text-blue-400">{key}:</span>}
			<span className={getValueColor(value)}>{formatValue(value)}</span>
		</div>
	);

	// Get color for different value types
	const getValueColor = (value: unknown) => {
		if (value === null) {
			return 'text-gray-400';
		}
		if (typeof value === 'string') {
			return 'text-green-400';
		}
		if (typeof value === 'number' || typeof value === 'boolean') {
			return 'text-yellow-400';
		}
		return 'text-gray-300';
	};

	// Format value for display
	const formatValue = (value: unknown) => {
		if (value === null) {
			return 'null';
		}
		if (typeof value === 'string') {
			return `"${value}"`;
		}
		return String(value);
	};

	// Handle primitive values
	if (
		data === null ||
		typeof data === 'string' ||
		typeof data === 'number' ||
		typeof data === 'boolean'
	) {
		return renderValue(data, name);
	}

	// Handle arrays
	if (Array.isArray(data)) {
		if (data.length === 0) {
			return renderValue('[]', name);
		}
		return (
			<div>
				<button
					className="flex w-full items-center py-0.5 text-left hover:bg-gray-700/30"
					onClick={() => setIsExpanded(!isExpanded)}
					style={{ paddingLeft: indent }}
					type="button"
				>
					{isExpanded ? (
						<CaretDownIcon className="mr-1 h-3 w-3" />
					) : (
						<CaretRightIcon className="mr-1 h-3 w-3" />
					)}
					{name && <span className="mr-2 text-blue-400">{name}:</span>}
					<span className="text-gray-300">[</span>
				</button>
				{isExpanded && (
					<>
						{data.map((item, index) => (
							<JsonNode
								data={item}
								key={`${name || 'root'}-${index}`}
								level={level + 1}
							/>
						))}
						<div
							className="flex items-center py-0.5"
							style={{ paddingLeft: indent }}
						>
							<span className="text-gray-300">]</span>
						</div>
					</>
				)}
				{!isExpanded && (
					<div
						className="flex items-center py-0.5"
						style={{ paddingLeft: indent }}
					>
						<span className="text-gray-300">]</span>
					</div>
				)}
			</div>
		);
	}

	// Handle objects
	if (typeof data === 'object' && data !== null) {
		const keys = Object.keys(data as Record<string, unknown>);
		if (keys.length === 0) {
			return renderValue('{}', name);
		}
		return (
			<div>
				<button
					className="flex w-full items-center py-0.5 text-left hover:bg-gray-700/30"
					onClick={() => setIsExpanded(!isExpanded)}
					style={{ paddingLeft: indent }}
					type="button"
				>
					{isExpanded ? (
						<CaretDownIcon className="mr-1 h-3 w-3" />
					) : (
						<CaretRightIcon className="mr-1 h-3 w-3" />
					)}
					{name && <span className="mr-2 text-blue-400">{name}:</span>}
					<span className="text-gray-300">{'{'}</span>
				</button>
				{isExpanded && (
					<>
						{keys.map((key) => (
							<JsonNode
								data={(data as Record<string, unknown>)[key]}
								key={key}
								level={level + 1}
								name={key}
							/>
						))}
						<div
							className="flex items-center py-0.5"
							style={{ paddingLeft: indent }}
						>
							<span className="text-gray-300">{'}'}</span>
						</div>
					</>
				)}
				{!isExpanded && (
					<div
						className="flex items-center py-0.5"
						style={{ paddingLeft: indent }}
					>
						<span className="text-gray-300">{'}'}</span>
					</div>
				)}
			</div>
		);
	}

	return null;
}

function CornerDecorations() {
	return (
		<div className="pointer-events-none absolute inset-0">
			<div className="absolute top-0 left-0 h-2 w-2">
				<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
				<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
			</div>
			<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2">
				<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
				<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
			</div>
			<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2">
				<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
				<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
			</div>
			<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2">
				<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
				<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
			</div>
		</div>
	);
}

export function QueryDemo() {
	const [availableTypes, setAvailableTypes] = useState<QueryType[]>([]);
	const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
	const [isLoading, setIsLoading] = useState(false);
	const [result, setResult] = useState<BatchQueryResponse | null>(null);

	// Load available query types on mount
	useEffect(() => {
		const loadTypes = async () => {
			const data = await getQueryTypes();
			if (data.success) {
				const types = data.types.map((name) => ({
					name,
					defaultLimit: data.configs[name]?.defaultLimit,
					customizable: data.configs[name]?.customizable,
					allowedFilters: data.configs[name]?.allowedFilters,
				}));
				setAvailableTypes(types);
			}
		};
		loadTypes();
	}, []);

	const handleTypeToggle = (typeName: string) => {
		const newSelected = new Set(selectedTypes);
		if (newSelected.has(typeName)) {
			newSelected.delete(typeName);
		} else {
			newSelected.add(typeName);
		}
		setSelectedTypes(newSelected);
	};

	const handleExecuteQuery = async () => {
		if (selectedTypes.size === 0) {
			return;
		}

		setIsLoading(true);
		setResult(null);

		try {
			const queries: DynamicQueryRequest[] = [
				{
					id: 'custom-query',
					parameters: Array.from(selectedTypes),
					limit: 50,
				},
			];

			const websiteId = 'OXmNQsViBT-FOS_wZCTHc';
			const endDate = new Date().toISOString().split('T')[0];
			const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
				.toISOString()
				.split('T')[0];

			const response = await executeBatchQueries(
				websiteId,
				startDate,
				endDate,
				queries
			);

			setResult(response);
		} catch {
			setResult({
				success: false,
				batch: true,
				results: [
					{
						success: false,
						queryId: 'custom-query',
						data: [],
						meta: {
							parameters: Array.from(selectedTypes),
							total_parameters: selectedTypes.size,
							page: 1,
							limit: 50,
							filters_applied: 0,
						},
					},
				],
			});
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="w-full p-4 sm:p-6">
			<div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
				{/* Left: Query Builder */}
				<div className="flex min-h-0 flex-col space-y-4 lg:w-1/2">
					<div className="flex items-center justify-between">
						<h3 className="font-medium text-lg">Query Builder</h3>
						{selectedTypes.size > 0 && (
							<Badge className="font-mono text-xs" variant="secondary">
								{selectedTypes.size} selected
							</Badge>
						)}
					</div>

					<ScrollArea className="h-80 lg:h-96">
						<div className="grid grid-cols-1 gap-2 pr-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
							{availableTypes.map((type) => (
								<Card
									className={`group relative cursor-pointer transition-all duration-200 hover:shadow-md ${
										selectedTypes.has(type.name)
											? 'bg-primary/5 shadow-inner'
											: 'border-border/50 bg-card/70 hover:border-border'
									}`}
									key={type.name}
									onClick={() => handleTypeToggle(type.name)}
								>
									<CardContent className="p-2">
										<div className="flex items-center justify-between gap-2">
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													<code className="truncate font-medium font-mono text-xs">
														{type.name}
													</code>
													{type.customizable && (
														<Badge
															className="px-1.5 py-0.5 text-[10px] leading-none"
															variant="outline"
														>
															Custom
														</Badge>
													)}
												</div>
												{type.defaultLimit && (
													<div className="mt-0.5 text-[10px] text-muted-foreground">
														Limit: {type.defaultLimit}
													</div>
												)}
											</div>
											<div
												className={`h-3 w-3 flex-shrink-0 rounded-full border transition-colors ${
													selectedTypes.has(type.name)
														? 'border-primary bg-primary'
														: 'border-muted-foreground/30'
												}`}
											/>
										</div>
									</CardContent>
									<CornerDecorations />
								</Card>
							))}
						</div>
					</ScrollArea>

					<Button
						className="w-full"
						disabled={selectedTypes.size === 0 || isLoading}
						onClick={handleExecuteQuery}
						size="lg"
					>
						{isLoading ? 'Executing...' : 'Execute Query'}
					</Button>
				</div>

				{/* Right: JSON Output */}
				<div className="flex min-h-0 flex-col space-y-4 lg:w-1/2">
					<div className="flex items-center justify-between">
						<h3 className="font-medium text-lg">Response</h3>
						{result && (
							<Badge
								className="text-xs"
								variant={result.success ? 'default' : 'destructive'}
							>
								{result.success ? 'Success' : 'Failed'}
							</Badge>
						)}
					</div>

					<Card className="relative flex-1 border-border/50 bg-black">
						<CardContent className="h-80 p-0 lg:h-96">
							<ScrollArea className="h-full">
								<div className="p-4 font-mono text-xs">
									{result ? (
										<JsonNode data={result} />
									) : (
										<div className="text-gray-400">
											{/* Execute query to see API response */}
										</div>
									)}
								</div>
							</ScrollArea>
						</CardContent>
						<CornerDecorations />
					</Card>
				</div>
			</div>
		</div>
	);
}
