'use client';

import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
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

function getValueColor(value: unknown) {
	if (value === null) {
		return 'text-muted-foreground';
	}
	if (typeof value === 'string') {
		return 'text-emerald-500 dark:text-emerald-300';
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return 'text-amber-500 dark:text-amber-300';
	}
	return 'text-foreground/90';
}

function formatValue(value: unknown) {
	if (value === null) {
		return 'null';
	}
	if (typeof value === 'string') {
		return `"${value}"`;
	}
	return String(value);
}

function PrimitiveNode({
	value,
	name,
	level,
}: {
	value: unknown;
	name?: string;
	level: number;
}) {
	const indent = level * 12;
	return (
		<div
			className="flex items-center rounded px-2 py-1 transition-colors hover:bg-muted/20"
			style={{ paddingLeft: indent }}
		>
			{name && <span className="mr-2 text-primary">{name}:</span>}
			<span className={getValueColor(value)}>{formatValue(value)}</span>
		</div>
	);
}

function ArrayNode({
	data,
	name,
	level,
}: {
	data: unknown[];
	name?: string;
	level: number;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const indent = level * 12;
	if (data.length === 0) {
		return <PrimitiveNode level={level} name={name} value="[]" />;
	}
	return (
		<div>
			<button
				aria-expanded={isExpanded}
				className="flex w-full items-center rounded px-2 py-1 text-left transition-colors hover:bg-muted/20"
				onClick={() => setIsExpanded(!isExpanded)}
				style={{ paddingLeft: indent }}
				type="button"
			>
				{isExpanded ? (
					<CaretDownIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				) : (
					<CaretRightIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				)}
				{name && <span className="mr-2 text-primary">{name}:</span>}
				<span className="font-semibold text-foreground/80">[</span>
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
						className="flex items-center py-1"
						style={{ paddingLeft: indent }}
					>
						<span className="font-semibold text-foreground/80">]</span>
					</div>
				</>
			)}
			{!isExpanded && (
				<div className="flex items-center py-1" style={{ paddingLeft: indent }}>
					<span className="font-semibold text-foreground/80">]</span>
				</div>
			)}
		</div>
	);
}

function ObjectNode({
	data,
	name,
	level,
}: {
	data: Record<string, unknown>;
	name?: string;
	level: number;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const indent = level * 12;
	const keys = Object.keys(data);
	if (keys.length === 0) {
		return <PrimitiveNode level={level} name={name} value="{}" />;
	}
	return (
		<div>
			<button
				aria-expanded={isExpanded}
				className="flex w-full items-center rounded px-2 py-1 text-left transition-colors hover:bg-muted/20"
				onClick={() => setIsExpanded(!isExpanded)}
				style={{ paddingLeft: indent }}
				type="button"
			>
				{isExpanded ? (
					<CaretDownIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				) : (
					<CaretRightIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				)}
				{name && <span className="mr-2 text-primary">{name}:</span>}
				<span className="font-semibold text-foreground/80">{'{'}</span>
			</button>
			{isExpanded && (
				<>
					{keys.map((key) => (
						<JsonNode data={data[key]} key={key} level={level + 1} name={key} />
					))}
					<div
						className="flex items-center py-1"
						style={{ paddingLeft: indent }}
					>
						<span className="font-semibold text-foreground/80">{'}'}</span>
					</div>
				</>
			)}
			{!isExpanded && (
				<div className="flex items-center py-1" style={{ paddingLeft: indent }}>
					<span className="font-semibold text-foreground/80">{'}'}</span>
				</div>
			)}
		</div>
	);
}

function JsonNode({ data, name, level = 0 }: JsonNodeProps) {
	if (
		data === null ||
		typeof data === 'string' ||
		typeof data === 'number' ||
		typeof data === 'boolean'
	) {
		return <PrimitiveNode level={level} name={name} value={data} />;
	}
	if (Array.isArray(data)) {
		return <ArrayNode data={data} level={level} name={name} />;
	}
	if (typeof data === 'object') {
		return (
			<ObjectNode
				data={data as Record<string, unknown>}
				level={level}
				name={name}
			/>
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
	const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [result, setResult] = useState<BatchQueryResponse | null>(null);

	const displayedTypes = useMemo(() => {
		const selectedSet = new Set(selectedOrder);
		const selectedTypesOrdered = selectedOrder
			.map((name) => availableTypes.find((t) => t.name === name))
			.filter(Boolean) as QueryType[];
		const unselectedTypes = availableTypes.filter(
			(t) => !selectedSet.has(t.name)
		);
		return [...selectedTypesOrdered, ...unselectedTypes];
	}, [availableTypes, selectedOrder]);

	// Load available query types on mount
	const runQueries = useCallback(async (parameters: string[]) => {
		if (parameters.length === 0) {
			return;
		}

		setIsLoading(true);
		setResult(null);

		try {
			const queries: DynamicQueryRequest[] = [
				{
					id: 'custom-query',
					parameters,
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
							parameters,
							total_parameters: parameters.length,
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
	}, []);

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

				const sortedByUtility = [...types].sort((a, b) => {
					const aScore =
						(a.customizable ? 1 : 0) * 2 + (a.allowedFilters?.length || 0);
					const bScore =
						(b.customizable ? 1 : 0) * 2 + (b.allowedFilters?.length || 0);
					return bScore - aScore;
				});
				const defaultSelectedNames = sortedByUtility
					.slice(0, Math.min(3, sortedByUtility.length))
					.map((t) => t.name);
				if (defaultSelectedNames.length > 0) {
					setSelectedTypes(new Set(defaultSelectedNames));
					setSelectedOrder(defaultSelectedNames);
					runQueries(defaultSelectedNames);
				}
			}
		};
		loadTypes();
	}, [runQueries]);

	const handleTypeToggle = (typeName: string) => {
		const newSelected = new Set(selectedTypes);
		if (newSelected.has(typeName)) {
			newSelected.delete(typeName);
			setSelectedOrder((prev) => prev.filter((n) => n !== typeName));
		} else {
			newSelected.add(typeName);
			setSelectedOrder((prev) => [...prev, typeName]);
		}
		setSelectedTypes(newSelected);
	};

	const handleExecuteQuery = async () => {
		if (selectedTypes.size === 0) {
			return;
		}

		await runQueries([...selectedOrder]);
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
							{displayedTypes.map((type) => (
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

					<Card className="relative flex-1 border-border/50 bg-white dark:bg-black">
						<CardContent className="h-80 p-0 lg:h-96">
							<ScrollArea className="h-full">
								<div className="select-text break-words p-4 font-mono text-[13px] leading-6 tracking-tight sm:text-[13.5px]">
									{isLoading ? (
										<div className="space-y-2">
											<Skeleton className="h-4 w-5/6" />
											<Skeleton className="h-4 w-2/3" />
											<Skeleton className="h-4 w-11/12" />
											<Skeleton className="h-4 w-3/4" />
											<Skeleton className="h-4 w-1/2" />
											<Skeleton className="h-4 w-10/12" />
											<Skeleton className="h-4 w-8/12" />
											<Skeleton className="h-4 w-9/12" />
										</div>
									) : result ? (
										<JsonNode data={result} />
									) : (
										<div className="text-gray-400" />
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
